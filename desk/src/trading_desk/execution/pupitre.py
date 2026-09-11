"""Le pupitre : ce qui relie un signal au carnet, en passant par le risque.

C'est la piece qui manquait. La couche d'execution etait construite et testee
depuis le P1 — `OrderManager`, le reconciliateur, la signature — mais rien ne
l'appelait : `run_ingestion` ingerait le marche, alimentait la supervision, et
s'arretait la. Le mode PAPER etait une valeur d'enumeration sans
implementation.

**Le pupitre ne decide rien.** Il ne connait ni les deblocages, ni les EMA, ni
les agents. Il recoit d'un `Signal` des intentions datees, les fait passer par
le moteur de risque et le dimensionnement, puis les confie a `OrderManager`.
Cette separation n'est pas de l'elegance : c'est ce qui permet de changer de
signal sans retoucher a la plomberie qui manipule des ordres, et de tester
chacun sans l'autre.

**L'ordre des operations est une propriete de sécurité**, pas une commodite :

1. facturer le temps ecoule (funding) ;
2. relire le compte chez l'exchange et le poser dans l'etat ;
3. evaluer les invariants sur cet etat frais ;
4. SORTIR d'abord, entrer ensuite.

Sortir avant d'entrer parce qu'une sortie libere de la marge et reduit
l'exposition : l'inverse peut faire echouer une fermeture pour cause de
plafond atteint par une ouverture prise une milliseconde plus tot. Et evaluer
le risque APRES avoir relu le compte, parce qu'un verdict rendu sur un etat
perime est un verdict sur le passe.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from decimal import Decimal
from typing import Protocol

from ..api.state import DeskState
from ..contracts.common import (
    Bias,
    DeskMode,
    EntryStyle,
    Regime,
    Side,
    now_ms,
)
from ..contracts.mandate import Mandate, StopBand
from ..contracts.market import BookSnapshot, MarkPrice, Trade
from ..risk import size_position
from .exchange import Exchange, ExchangeError
from .order_manager import OrderManager

log = logging.getLogger("pupitre")


@dataclass(frozen=True)
class Intention:
    """Ce qu'un signal demande. Un ordre potentiel, pas encore un ordre.

    Le stop est OBLIGATOIRE et n'a pas de defaut. Un signal qui ne sait pas
    ou il a tort n'a pas le droit d'ouvrir une position : c'est la distance au
    stop qui donne la taille, donc un stop absent ne produirait pas une
    position sans protection, il produirait une position sans taille definie.
    """

    asset: str
    side: Side
    entry_price: Decimal
    stop_price: Decimal
    target_price: Decimal | None = None
    motif: str = ""
    # L'urgence du signal. Un signal calendaire doit etre en position a une
    # DATE : un ordre passif non servi lui fait rater la fenetre entiere.
    style: EntryStyle = EntryStyle.MARKET_IOC


class Signal(Protocol):
    """Une source de decisions. Le pupitre n'en connait pas davantage."""

    nom: str

    def entrees(self, at_ms: int) -> list[Intention]: ...
    def sorties(self, at_ms: int, ouvertes: tuple[str, ...]) -> list[str]: ...

    # Optionnel. Un signal qui garde trace de ce qu'il a deja propose DOIT
    # attendre cet appel pour rayer une occasion : la rayer des la lecture
    # la perdrait chaque fois que le desk refuse d'agir — amorcage, flux
    # fige, plafond atteint — et rien ne le signalerait.
    def confirmer(self, intention: Intention) -> None: ...


class Pupitre:
    """Relie un signal a l'exchange, sous la surveillance du moteur de risque."""

    def __init__(
        self,
        state: DeskState,
        exchange: Exchange,
        signal: Signal,
        *,
        univers: tuple[str, ...] = (),
    ) -> None:
        self.state = state
        self.exchange = exchange
        self.signal = signal
        self.orders = OrderManager(exchange, store=state.store)
        self.univers = univers

        self.ouvertures = 0
        self.fermetures = 0
        self.refus: list[str] = []
        # Jusqu'ou les fills ont ete recopies en base. L'exchange les detient ;
        # le stockage est ce que l'interface lit. Sans ce transfert, le desk
        # traderait et le panneau VOLS resterait vide — exactement le genre
        # d'ecart entre l'etat reel et l'ecran qui rend une supervision
        # inutile.
        self._fills_vus_ms = 0

    # ------------------------------------------------------------ marche

    def on_trade(self, t: Trade) -> None:
        fn = getattr(self.exchange, "on_trade", None)
        if fn is not None:
            fn(t)

    def on_book(self, b: BookSnapshot) -> None:
        fn = getattr(self.exchange, "on_book", None)
        if fn is not None:
            fn(b)

    def on_mark(self, m: MarkPrice) -> None:
        fn = getattr(self.exchange, "on_mark", None)
        if fn is not None:
            fn(m)

    def _mandat(self, biais: Bias) -> Mandate:
        """Un mandat NEUF a chaque cycle, et c'est le contrat qui l'impose.

        `Mandate` plafonne son TTL a quatre heures, avec cette raison ecrite
        dans le module : « un mandat qui vivrait des heures serait un mandat
        qu'on oublie de reevaluer ». La premiere version de ce pupitre en
        fabriquait un seul, valable sept jours, pour couvrir la duree de
        detention de la regle des deblocages. Le contrat l'a refuse au
        chargement, et il avait raison.

        Le malentendu etait sur ce qu'un mandat autorise. Il n'autorise pas
        une POSITION a exister pendant six jours — il autorise les ENTREES du
        cycle en cours. Les positions deja ouvertes se gerent par les sorties,
        qui passent par `submit_reduce` et ne demandent aucun mandat vivant :
        fermer est toujours permis, meme mandat expire, meme desk en defaut.

        Le biais suit ce que le signal demande a cet instant, plutot que d'etre
        fige : un mandat FLAT qui autoriserait des ventes a decouvert serait un
        mandat qui ment sur ce qu'il permet.
        """
        # La fourchette de stop du mandat reprend celle du deploiement.
        #
        # Elle existe pour brider un stop PROPOSE PAR UN AGENT : c'est le
        # controle fin qui empeche un modele de justifier une perte enorme par
        # « stop large ». Ici il n'y a pas d'agent — la distance vient d'une
        # regle mecanique — donc la resserrer davantage n'ajouterait aucune
        # protection, elle ne ferait que refuser deux fois pour la meme raison.
        # Le plafond du deploiement reste le seul controle, et il est explicite.
        limites = self.state.limits
        return Mandate(
            bias=biais, regime=Regime.RANGE, universe=self.univers,
            max_notional_usd=limites.max_gross_notional_usd,
            max_leverage=limites.max_effective_leverage,
            max_concurrent_positions=4,
            stop_band=StopBand(min_bps=limites.min_stop_distance_bps,
                               max_bps=limites.max_stop_distance_bps),
            journal_ref=f"signal:{self.signal.nom}",
            ttl_ms=15 * 60 * 1000,
        )

    # ------------------------------------------------------------ cycle

    def cycle(self, at_ms: int | None = None) -> None:
        """Un tour complet. Idempotent : ne rien avoir a faire est le cas normal."""
        try:
            self._tour(at_ms)
        finally:
            # Les fills du tour qui vient de s'ecouler, y compris ceux nes de
            # ses propres ordres. Dans un `finally` parce qu'un tour
            # interrompu a pu remplir avant d'echouer : perdre la trace d'une
            # execution reelle serait pire que perdre le tour.
            self._recopier_fills()

    def _tour(self, at_ms: int | None = None) -> None:
        maintenant = at_ms if at_ms is not None else now_ms()

        horloge = getattr(self.exchange, "horloge", None)
        if horloge is not None:
            horloge(maintenant)

        try:
            compte = self.exchange.account_state()
        except ExchangeError as exc:
            # Un compte illisible n'autorise RIEN. On le dit a l'etat, qui
            # fera echouer l'invariant de reconciliation, qui arretera le desk.
            log.error("compte illisible : %s", exc)
            self.state.reconciled = False
            return
        self.state.set_account(compte)

        # La perte du jour vient de l'exchange, pas d'un compteur du pupitre.
        # Sans elle, l'invariant I03 repond « PnL du jour inconnu », ce qui
        # vaut echec — et le desk refuse toute entree en restant muet sur la
        # raison. Ce cablage manquait a la premiere version, et c'est le
        # moteur de risque qui l'a signale en bloquant.
        jour = getattr(self.exchange, "realise_jour_usd", None)
        if callable(jour):
            # Le client reel le calcule depuis ses fills ; un appel reseau
            # qui echoue ne doit pas emporter le cycle, mais il ne doit pas
            # non plus laisser croire a un PnL nul : on laisse la valeur
            # precedente, et I03 finira par se plaindre de son age.
            try:
                self.state.day_realized_pnl_usd = jour()
            except ExchangeError as exc:
                log.warning("PnL du jour illisible : %s", exc)
        elif jour is not None:
            self.state.day_realized_pnl_usd = jour

        # Ceux nes entre deux tours : fills passifs, stops declenches.
        self._recopier_fills()

        if self.state.halted:
            return

        ouvertes = tuple(p.asset for p in compte.positions)

        # SORTIES D'ABORD. Une fermeture est toujours autorisee, meme desk en
        # defaut : c'est le sens de `submit_reduce`.
        for asset in self.signal.sorties(maintenant, ouvertes):
            poste = next((p for p in compte.positions if p.asset == asset), None)
            if poste is None:
                continue
            issue = self.orders.flatten(asset, self.state.risk_context(),
                                        size=poste.size, side=poste.side)
            if issue.accepted:
                self.fermetures += 1
                log.info("fermeture %s : %s", asset, issue.cloid)
            else:
                self.refus.append(f"fermeture {asset} : {issue.reason}")

        # ENTREES ENSUITE, sur un compte relu apres les sorties.
        entrees = self.signal.entrees(maintenant)
        if not entrees:
            return

        compte = self.exchange.account_state()
        self.state.set_account(compte)
        verdict = self.state.verdict()
        if not verdict.approved:
            self.refus.append(
                "entrees refusees : " + ", ".join(i.value for i in verdict.blocking))
            return

        deja = {p.asset for p in compte.positions}
        for intention in entrees:
            if intention.asset in deja:
                continue                       # jamais deux fois le meme actif
            self._ouvrir(intention, compte)

    def _ouvrir(self, intention: Intention, compte) -> None:
        mandat = self._mandat(
            Bias.SHORT if intention.side is Side.SHORT else Bias.LONG)
        # Le mandat est journalise avant d'etre utilise : l'ordre qui suit
        # doit etre rattachable a une autorisation datee, pas l'inverse.
        self.state.set_mandate(mandat)

        taille = size_position(
            account=compte, mandate=mandat, limits=self.state.limits,
            asset=intention.asset, side=intention.side,
            entry_price=intention.entry_price, stop_price=intention.stop_price,
        )
        if taille.size <= 0:
            self.refus.append(
                f"{intention.asset} non dimensionnable : {taille.binding_constraint}")
            return

        issue = self.orders.open_position(
            mandate=mandat, ctx=self.state.risk_context(),
            asset=intention.asset, side=intention.side, size=taille.size,
            entry_price=intention.entry_price, stop_price=intention.stop_price,
            target_price=intention.target_price, style=intention.style,
        )
        if issue.opened:
            self.ouvertures += 1
            confirmer = getattr(self.signal, "confirmer", None)
            if confirmer is not None:
                confirmer(intention)
            log.info("ouverture %s %s taille %s (%s)", intention.side.value,
                     intention.asset, taille.size, intention.motif)
        else:
            self.refus.append(f"{intention.asset} : {issue.reason}")

    def _recopier_fills(self) -> None:
        """Verse en base les executions que l'exchange a enregistrees.

        Ce n'est pas de la duplication : l'exchange detient l'etat courant, le
        stockage detient l'HISTORIQUE — celui que l'interface lit, et celui qui
        survit au redemarrage du processus.
        """
        try:
            fills = self.exchange.fills_since(self._fills_vus_ms)
        except ExchangeError as exc:
            log.warning("fills illisibles : %s", exc)
            return
        for f in fills:
            # `write_fill` deduplique par `fill_id` : relire une fenetre qui
            # chevauche la precedente est donc sans consequence, et c'est ce
            # qui rend le curseur sur-inclusif inoffensif.
            self.state.store.write_fill(f)
            self._fills_vus_ms = max(self._fills_vus_ms, f.ts_ms)

    # ------------------------------------------------------------ rapport

    def resume(self) -> dict:
        base = {
            "signal": self.signal.nom,
            "ouvertures": self.ouvertures,
            "fermetures": self.fermetures,
            "refus": self.refus[-10:],
            "nb_refus": len(self.refus),
            "mode": self.state.settings.mode.value,
        }
        detail = getattr(self.exchange, "resume", None)
        if detail is not None:
            base["exchange"] = detail()
        return base


VARIABLE_CLE = "DESK_HYPERLIQUID_PRIVATE_KEY"


def cle_de_signature() -> str:
    """La cle privee, lue dans l'environnement au moment de s'en servir.

    Elle n'entre PAS dans `Settings`. Ce n'est pas du purisme : l'objet de
    reglages est construit une fois et traverse tout le processus, y compris
    la couche qui sert l'API de supervision. Un secret qui y sejourne finira
    par sortir quelque part — dans un dump de debogage, une trace
    d'exception, un champ ajoute six mois plus tard par quelqu'un qui ne sait
    pas ce qu'il y a dedans. Lue ici, elle ne vit que le temps d'un appel.

    Le message d'erreur ne contient jamais la valeur, meme tronquee : une
    cle partiellement revelee dans un journal reste une cle affaiblie.
    """
    import os

    brute = (os.environ.get(VARIABLE_CLE) or "").strip()
    if not brute:
        raise SystemExit(
            f"{VARIABLE_CLE} est absente de l'environnement. Ce mode signe des "
            "ordres : sans cle il n'y a rien a faire, et demarrer pour "
            "echouer a la premiere signature serait pire que refuser ici."
        )
    cle = brute if brute.startswith("0x") else "0x" + brute
    corps = cle[2:]
    if len(corps) != 64 or any(c not in "0123456789abcdefABCDEF" for c in corps):
        raise SystemExit(
            f"{VARIABLE_CLE} n'est pas une cle de 32 octets en hexadecimal. "
            "Verifiee ici plutot qu'a la premiere signature, ou l'erreur "
            "remonterait en INVALID_SIGNATURE et enverrait chercher le "
            "defaut partout ailleurs."
        )
    return cle


def exchange_pour(state: DeskState):
    """L'exchange qui correspond au mode. **La seule porte vers l'argent reel.**

    Cette fonction est deliberement le seul endroit du depot qui choisit un
    exchange en fonction du mode. Un second endroit qui ferait ce choix serait
    un second endroit ou l'oublier.
    """
    from ..backtest.costs import CostModel
    from .paper import PaperExchange

    if state.settings.mode is DeskMode.PAPER:
        return PaperExchange(
            equity_usd=state.settings.paper_equity_usd,
            costs=CostModel(),
        )

    if state.settings.mode is DeskMode.TESTNET:
        # La signature est desormais validee vecteur par vecteur contre le SDK
        # officiel (`tests/test_signature_hyperliquid.py`). Ce qui reste non
        # valide, c'est le RESTE de la requete : indices d'actifs, pas de
        # cotation, tailles minimales. C'est precisement ce que le testnet
        # sert a eprouver, et il n'y engage aucun argent.
        from .hyperliquid_client import HyperliquidClient

        return HyperliquidClient(
            account_address=state.settings.agent_wallet_address or "",
            private_key=cle_de_signature(),
            testnet=True,
        )

    raise NotImplementedError(
        f"mode {state.settings.mode.value} : aucun exchange cable. "
        "LIVE attend un aller-retour reussi sur testnet — la signature est "
        "validee, le reste de la requete ne l'est pas."
    )
