"""Execution simulee contre le carnet REEL. Le mode PAPER.

**Ce module existe pour ne pas flatter.** Un moteur papier est facile a
ecrire et facile a rendre menteur : remplir au mid, remplir instantanement,
remplir n'importe quelle taille, servir les ordres passifs des que le prix
touche la limite. Chacun de ces quatre raccourcis produit une courbe qui ne
survit pas au premier ordre reel, et le pire est qu'on ne s'en apercoit
qu'apres avoir engage de l'argent.

Les quatre sont refuses ici :

**On traverse le carnet.** Un achat consomme les demandes du meilleur vers le
pire, une vente consomme les offres. Le prix de fill est la moyenne ponderee
de ce qu'on a mange, pas le mid. Le slippage n'est donc pas une constante
posee a l'avance : il est MESURE sur la profondeur du moment. Sur un alt a
0,7 M$ de volume quotidien, c'est exactement la difference qui compte.

**On refuse ce que la profondeur n'absorbe pas.** Au-dela de
`PART_PROFONDEUR_MAX` du carnet visible, le fill est tronque. Un ordre qui
mangerait la moitie du carnet ne le mangerait pas dans la vraie vie : les
autres participants retirent leurs limites en le voyant venir. Tronquer est
optimiste — la realite serait pire — mais c'est deja beaucoup moins faux que
de servir la taille entiere au meilleur prix.

**Un ordre passif n'est pas servi parce que le prix l'a touche.** Il est
servi quand une TRANSACTION s'imprime a son prix ou au-dela, et au plus a
concurrence de la taille imprimee. C'est le mensonge le plus courant des
moteurs papier : le prix passe sur votre limite, donc vous etes servi. Non —
le prix passe parce que quelqu'un d'autre a ete servi avant vous. Ici, il
faut une impression, et la file d'attente est modelisee grossierement (on se
sert apres le volume deja imprime a ce prix).

**Le funding est facture.** Toutes les heures, sur le notionnel ouvert, avec
le meme modele que les backtests. Une strategie qui tient six jours en short
paie ou touche du funding, et l'ignorer change le signe du resultat sur les
strategies a faible marge.

Ce que ce module NE simule pas, et qu'il faut avoir en tete en lisant ses
resultats : l'impact permanent de l'ordre sur le prix, la reaction des
autres participants, les frais de liquidation, et le fait qu'un carnet peut
disparaitre entierement pendant une cascade. Le papier reste optimiste. Il
l'est juste beaucoup moins que la moyenne des moteurs papier.
"""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any

from ..backtest.costs import CostModel
from ..contracts.common import EntryStyle, Side, now_ms
from ..contracts.market import BookSnapshot, MarkPrice, Trade
from ..contracts.orders import (
    AccountState,
    Fill,
    OrderIntent,
    OrderPurpose,
    OrderRecord,
    OrderStatus,
    Position,
)
from .exchange import ExchangeRejected

log = logging.getLogger("paper")

# Part du carnet visible qu'un seul ordre a le droit de consommer. Dix pour
# cent est deja genereux : un ordre de cette taille se voit, et le carnet se
# retire devant lui. C'est le garde-fou qui empeche le papier de pretendre a
# une capacite que le marche ne donne pas.
PART_PROFONDEUR_MAX = Decimal("0.10")

# Au-dela de cet age, le carnet n'est plus une source de prix. Remplir sur un
# carnet de trois minutes reviendrait a inventer un prix.
AGE_CARNET_MAX_MS = 30_000

HEURE_MS = Decimal("3600000")


class _Poste:
    """Une position ouverte, en cours de vie. Mutable, contrairement au contrat."""

    __slots__ = ("asset", "entree", "mark", "side", "size", "stop_cloid")

    def __init__(self, asset: str, side: Side, size: Decimal, entree: Decimal) -> None:
        self.asset = asset
        self.side = side
        self.size = size
        self.entree = entree
        self.mark = entree
        self.stop_cloid: str | None = None

    @property
    def signe(self) -> Decimal:
        return Decimal("1") if self.side is Side.LONG else Decimal("-1")

    def latent(self) -> Decimal:
        return (self.mark - self.entree) * self.size * self.signe


class PaperExchange:
    """Un exchange qui ne signe rien et ne ment pas plus que necessaire.

    Il implemente le protocole `Exchange`, donc `OrderManager`, le
    reconciliateur et le moteur de risque fonctionnent au-dessus de lui sans
    savoir qu'ils parlent a une simulation. C'est la seule facon de valider la
    PLOMBERIE : si le papier passait par un chemin de code special, il
    validerait ce chemin-la et pas celui du live.
    """

    def __init__(
        self,
        *,
        equity_usd: Decimal = Decimal("1000"),
        costs: CostModel | None = None,
        part_profondeur_max: Decimal = PART_PROFONDEUR_MAX,
        levier: Decimal = Decimal("1"),
    ) -> None:
        self.costs = costs or CostModel()
        self.part_profondeur_max = part_profondeur_max
        self.levier = levier

        self._equity = equity_usd
        self._depart = equity_usd
        self._postes: dict[str, _Poste] = {}
        self._ordres: dict[str, OrderRecord] = {}
        self._fills: list[Fill] = []
        self._carnets: dict[str, BookSnapshot] = {}
        self._marks: dict[str, MarkPrice] = {}
        self._seq = 0
        self._dernier_funding_ms: int | None = None

        # Audit : ce que le moteur a refuse, et pourquoi. Un papier qui
        # remplit tout n'apprend rien ; les refus SONT le resultat.
        self.refus: list[dict[str, Any]] = []
        self.tronques = 0
        self.funding_paye_usd = Decimal("0")
        self.frais_payes_usd = Decimal("0")
        self.realise_usd = Decimal("0")
        # Le realise DU JOUR, remis a zero au changement de jour UTC. C'est
        # lui que l'invariant de perte quotidienne regarde ; le cumul depuis
        # le demarrage ne dirait rien sur la limite d'aujourd'hui.
        self.realise_jour_usd = Decimal("0")
        self._jour = None

    # -------------------------------------------------------- flux de marche

    def on_book(self, b: BookSnapshot) -> None:
        self._carnets[b.asset] = b
        self._servir_passifs(b.asset)

    def on_trade(self, t: Trade) -> None:
        """Une transition imprimee. C'est elle, et elle seule, qui sert les
        ordres passifs — voir la docstring du module."""
        self._servir_sur_impression(t)

    def on_mark(self, m: MarkPrice) -> None:
        self._marks[m.asset] = m
        poste = self._postes.get(m.asset)
        if poste is not None:
            poste.mark = m.mark
        self._declencher_stops(m.asset, m.mark)

    def horloge(self, at_ms: int | None = None) -> None:
        """Facture le funding ecoule. A appeler regulierement ; le calcul est
        proportionnel au temps, donc la frequence d'appel ne change rien."""
        maintenant = at_ms if at_ms is not None else now_ms()
        if self._dernier_funding_ms is None:
            self._dernier_funding_ms = maintenant
            return
        heures = (Decimal(maintenant - self._dernier_funding_ms) / HEURE_MS)
        if heures <= 0:
            return
        self._dernier_funding_ms = maintenant
        for poste in self._postes.values():
            cout = self.costs.funding_usd(
                poste.size * poste.mark, heures, is_long=poste.side is Side.LONG)
            self._equity -= cout
            self.funding_paye_usd += cout

    # ------------------------------------------------------- protocole Exchange

    def place(self, intent: OrderIntent) -> OrderRecord:
        from .cloid import make_cloid

        cloid = make_cloid(intent)
        vu = self._ordres.get(cloid)
        if vu is not None:
            # Meme dedoublonnage que le vrai : renvoyer une intention
            # identique est inoffensif. C'est la parade a la reponse perdue.
            return vu

        if intent.purpose in (OrderPurpose.STOP_LOSS, OrderPurpose.TAKE_PROFIT):
            record = OrderRecord(cloid=cloid, intent=intent,
                                 status=OrderStatus.RESTING,
                                 exchange_oid=self._prochain_oid())
            self._ordres[cloid] = record
            poste = self._postes.get(intent.asset)
            if poste is not None and intent.purpose is OrderPurpose.STOP_LOSS:
                poste.stop_cloid = cloid
            return record

        if intent.reduce_only and intent.asset not in self._postes:
            return self._rejeter(cloid, intent, "reduce_only sans position")

        agressif = intent.style in (EntryStyle.MARKET_IOC, EntryStyle.LIMIT_AGGRESSIVE)
        if not agressif:
            # Passif : il attend une impression. `open_position` verra
            # `filled_size == 0` et n'ouvrira pas — c'est correct, et c'est
            # pourquoi le pilote de deblocages entre en agressif.
            record = OrderRecord(cloid=cloid, intent=intent,
                                 status=OrderStatus.RESTING,
                                 exchange_oid=self._prochain_oid())
            self._ordres[cloid] = record
            return record

        return self._executer(cloid, intent, maker=False)

    def cancel(self, cloid: str) -> bool:
        record = self._ordres.get(cloid)
        if record is None or record.status.is_terminal:
            return False
        self._ordres[cloid] = record.model_copy(
            update={"status": OrderStatus.CANCELLED, "updated_at_ms": now_ms()})
        return True

    def account_state(self) -> AccountState:
        positions = tuple(
            Position(
                asset=p.asset, side=p.side, size=p.size,
                entry_price=p.entree, mark_price=p.mark,
                leverage=self.levier, unrealized_pnl_usd=p.latent(),
                protective_stop_cloid=p.stop_cloid,
            )
            for p in self._postes.values() if p.size > 0
        )
        brut = sum((p.notional_usd for p in positions), Decimal("0"))
        marge = brut / self.levier if self.levier > 0 else brut
        equite = self._equity + sum((p.unrealized_pnl_usd for p in positions), Decimal("0"))
        return AccountState(
            equity_usd=equite,
            available_margin_usd=max(Decimal("0"), equite - marge),
            used_margin_usd=marge,
            positions=positions,
            source="simulator",
        )

    def fills_since(self, ts_ms: int) -> list[Fill]:
        return [f for f in self._fills if f.ts_ms >= ts_ms]

    # ------------------------------------------------------------- execution

    def _executer(self, cloid: str, intent: OrderIntent, *, maker: bool) -> OrderRecord:
        carnet = self._carnets.get(intent.asset)
        if carnet is None:
            return self._rejeter(cloid, intent, "aucun carnet pour cet actif")
        age = now_ms() - carnet.ts_ms
        if age > AGE_CARNET_MAX_MS:
            return self._rejeter(cloid, intent,
                                 f"carnet vieux de {age} ms : prix non fiable")

        taille, prix = self._traverser(carnet, intent.side, intent.size)
        if taille <= 0 or prix is None:
            return self._rejeter(cloid, intent, "profondeur insuffisante")

        if taille < intent.size:
            self.tronques += 1
            log.info("fill tronque sur %s : %s sur %s demandes",
                     intent.asset, taille, intent.size)

        self._appliquer(cloid, intent, taille, prix, maker=maker)
        statut = OrderStatus.FILLED if taille >= intent.size else OrderStatus.PARTIAL
        record = OrderRecord(cloid=cloid, intent=intent, status=statut,
                             exchange_oid=self._prochain_oid(),
                             filled_size=taille, avg_price=prix)
        self._ordres[cloid] = record
        return record

    def _traverser(
        self, carnet: BookSnapshot, side: Side, taille: Decimal
    ) -> tuple[Decimal, Decimal | None]:
        """Mange le carnet niveau par niveau. Renvoie (taille servie, prix moyen).

        C'est ici que vit l'honnetete du moteur : le prix qui sort n'est pas
        le meilleur, c'est la moyenne ponderee de ce qu'il a fallu prendre.
        """
        niveaux = carnet.asks if side is Side.LONG else carnet.bids
        if not niveaux:
            return Decimal("0"), None

        visible = sum((n.size for n in niveaux), Decimal("0"))
        plafond = visible * self.part_profondeur_max
        a_servir = min(taille, plafond)
        if a_servir <= 0:
            return Decimal("0"), None

        reste = a_servir
        cout = Decimal("0")
        servi = Decimal("0")
        for n in niveaux:
            if reste <= 0:
                break
            pris = min(reste, n.size)
            cout += pris * n.price
            servi += pris
            reste -= pris

        if servi <= 0:
            return Decimal("0"), None
        return servi, cout / servi

    def _appliquer(
        self, cloid: str, intent: OrderIntent, taille: Decimal,
        prix: Decimal, *, maker: bool, ts_ms: int | None = None,
    ) -> None:
        """Comptabilise un fill : frais, position, P&L realise."""
        horodatage = ts_ms if ts_ms is not None else now_ms()
        frais = self.costs.fee_usd(taille * prix, maker=maker)
        self._equity -= frais
        self.frais_payes_usd += frais

        self._seq += 1
        self._fills.append(Fill(
            fill_id=f"paper-{self._seq}", cloid=cloid, asset=intent.asset,
            side=intent.side, size=taille, price=prix, fee_usd=frais,
            is_maker=maker, ts_ms=horodatage,
        ))
        self._muter_poste(intent.asset, intent.side, taille, prix)

    def _muter_poste(self, asset: str, side: Side, taille: Decimal,
                     prix: Decimal) -> None:
        poste = self._postes.get(asset)
        if poste is None:
            self._postes[asset] = _Poste(asset, side, taille, prix)
            return

        if poste.side is side:                       # on renforce
            total = poste.size + taille
            poste.entree = (poste.entree * poste.size + prix * taille) / total
            poste.size = total
            poste.mark = prix
            return

        # On reduit : la part fermee devient du realise.
        fermee = min(poste.size, taille)
        gain = (prix - poste.entree) * fermee * poste.signe
        self._equity += gain
        self.realise_usd += gain
        self._cumuler_jour(gain)
        poste.size -= fermee
        poste.mark = prix

        reliquat = taille - fermee
        if poste.size <= 0:
            del self._postes[asset]
            if reliquat > 0:                         # renversement
                self._postes[asset] = _Poste(asset, side, reliquat, prix)

    # ---------------------------------------------------------- ordres passifs

    def _servir_passifs(self, asset: str) -> None:
        """Le carnet a bouge. On ne sert RIEN.

        Cette methode est volontairement vide, et son vide est le point du
        module : un carnet qui traverse une limite ne sert pas cette limite.
        Il faut une impression. Elle existe pour que le lecteur qui cherche
        « ou les passifs sont-ils servis quand le carnet bouge » trouve la
        reponse ici plutot que de conclure a un oubli.
        """
        return

    def _servir_sur_impression(self, t: Trade) -> None:
        """Une transaction s'est imprimee : elle peut servir des limites.

        Un achat imprime a P sert les ventes limitees a P ou moins ; une vente
        imprimee a P sert les achats limites a P ou plus. La taille servie est
        au plus celle imprimee : on ne se sert pas de volume qui n'existe pas.
        """
        for cloid, record in list(self._ordres.items()):
            # PARTIAL compte autant que RESTING : un ordre a moitie servi est
            # toujours au carnet pour le reste. Ne garder que RESTING le
            # figeait apres sa premiere impression — bug trouve par
            # `test_un_passif_ne_prend_pas_plus_que_le_volume_imprime`, et il
            # aurait sous-estime les entrees passives sans jamais planter.
            if record.status not in (OrderStatus.RESTING, OrderStatus.PARTIAL):
                continue
            intent = record.intent
            if intent.asset != t.asset or intent.limit_price is None:
                continue
            if intent.purpose in (OrderPurpose.STOP_LOSS, OrderPurpose.TAKE_PROFIT):
                continue

            achat = intent.side is Side.LONG
            # L'impression doit venir de la contrepartie : un achat limite
            # n'est servi que par un vendeur qui traverse.
            if achat and not (t.price <= intent.limit_price and not t.is_buy):
                continue
            if not achat and not (t.price >= intent.limit_price and t.is_buy):
                continue

            reste = intent.size - record.filled_size
            taille = min(reste, t.size)
            if taille <= 0:
                continue

            self._appliquer(cloid, intent, taille, intent.limit_price,
                            maker=True, ts_ms=t.ts_ms)
            rempli = record.filled_size + taille
            self._ordres[cloid] = record.model_copy(update={
                "filled_size": rempli,
                "avg_price": intent.limit_price,
                "status": (OrderStatus.FILLED if rempli >= intent.size
                           else OrderStatus.PARTIAL),
                "updated_at_ms": t.ts_ms,
            })

    def _declencher_stops(self, asset: str, mark: Decimal) -> None:
        """Un stop touche s'execute en TRAVERSANT le carnet, comme dans la vraie
        vie : il devient un ordre au marche, et c'est precisement au moment ou
        il se declenche que le carnet est le plus mince."""
        for cloid, record in list(self._ordres.items()):
            if record.status is not OrderStatus.RESTING:
                continue
            intent = record.intent
            if intent.asset != asset or intent.trigger_price is None:
                continue
            if intent.purpose is not OrderPurpose.STOP_LOSS:
                continue

            # Le stop d'un long est une VENTE sous le trigger.
            vend = intent.side is Side.SHORT
            touche = mark <= intent.trigger_price if vend else mark >= intent.trigger_price
            if not touche:
                continue

            self._ordres[cloid] = record.model_copy(
                update={"status": OrderStatus.CANCELLED})
            marche = intent.model_copy(update={"style": EntryStyle.MARKET_IOC,
                                               "trigger_price": None,
                                               "purpose": OrderPurpose.REDUCE})
            sortie = self._executer(cloid + "-x", marche, maker=False)
            log.info("stop declenche sur %s a %s : %s", asset, mark, sortie.status.value)

    def _cumuler_jour(self, gain: Decimal, at_ms: int | None = None) -> None:
        jour = (at_ms if at_ms is not None else now_ms()) // 86_400_000
        if self._jour != jour:
            self._jour = jour
            self.realise_jour_usd = Decimal("0")
        self.realise_jour_usd += gain

    # ------------------------------------------------------------- utilitaires

    def _rejeter(self, cloid: str, intent: OrderIntent, motif: str) -> OrderRecord:
        self.refus.append({"cloid": cloid, "asset": intent.asset,
                           "taille": str(intent.size), "motif": motif,
                           "ts_ms": now_ms()})
        record = OrderRecord(cloid=cloid, intent=intent,
                             status=OrderStatus.REJECTED, error=motif)
        self._ordres[cloid] = record
        raise ExchangeRejected(motif)

    def _prochain_oid(self) -> int:
        self._seq += 1
        return self._seq

    # ------------------------------------------------------------- rapport

    def resume(self) -> dict[str, Any]:
        """De quoi remplir le panneau VOLS sans interroger l'exchange."""
        compte = self.account_state()
        return {
            "equite_depart_usd": str(self._depart),
            "equite_usd": str(compte.equity_usd),
            "realise_usd": str(self.realise_usd),
            "realise_jour_usd": str(self.realise_jour_usd),
            "latent_usd": str(sum((p.unrealized_pnl_usd for p in compte.positions),
                                  Decimal("0"))),
            "frais_usd": str(self.frais_payes_usd),
            "funding_usd": str(self.funding_paye_usd),
            "fills": len(self._fills),
            "ordres": len(self._ordres),
            "tronques": self.tronques,
            "refus": self.refus[-10:],
            "nb_refus": len(self.refus),
        }
