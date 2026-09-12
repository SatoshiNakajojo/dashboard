"""Point d'entree du desk (phase P0 : ingestion + supervision).

Ce que ce processus fait aujourd'hui, et rien de plus :

- il se connecte au WebSocket Hyperliquid et persiste ce qu'il recoit ;
- il evalue les douze invariants en continu ;
- il sert l'interface de supervision et le kill switch.

Ce qu'il ne fait pas, et ne doit pas faire avant la porte P1 : signer quoi que
ce soit. Le mode par defaut est SHADOW.

    python -m trading_desk                 # ingestion reelle (testnet)
    python -m trading_desk --demo          # sans reseau, pour voir l'interface
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import logging
import math
import random
import time
from decimal import Decimal

import uvicorn

from .api.server import create_app
from .api.state import DeskState, demo_account
from .config import Settings, get_settings
from .contracts.common import Bias, DeskMode, HaltReason, Regime, now_ms
from .contracts.mandate import Mandate
from .contracts.market import BookSnapshot, FeedHealth, FeedStatus, MarkPrice, Trade
from .market import HyperliquidFeed, Subscription, perps_disponibles
from .storage import SqliteStore

log = logging.getLogger("desk")

# Le carnet arrive plusieurs fois par seconde : tout persister sature le disque
# pour une valeur analytique nulle. Un echantillon par seconde et par actif
# suffit a reconstruire spread, profondeur et desequilibre.
# Delai laisse au desk pour se connecter et lire son compte avant que le
# watchdog ne latche un arret definitif. Une minute : au-dela, ce n'est
# plus un demarrage, c'est une panne.
AMORCAGE_MS = 60_000

BOOK_SAMPLE_INTERVAL_MS = 1_000


async def run_ingestion(state: DeskState, settings: Settings,
                        pupitre: object | None = None) -> None:
    """Boucle d'ingestion. Ne rend la main que sur annulation.

    Un `pupitre` optionnel recoit les memes evenements de marche et decide.
    Il est optionnel plutot qu'obligatoire pour une raison de fond : en
    SHADOW, le desk doit tourner exactement comme en PAPER — memes flux,
    memes invariants, meme supervision — sans qu'aucun ordre ne parte. Deux
    boucles distinctes auraient fini par diverger, et c'est le chemin qui
    trade qui aurait ete le moins teste.
    """
    # L'univers a suivre. `DESK_ASSETS` donne le socle ; le JOURNAL donne le
    # reste, et c'est lui qui commande.
    #
    # Sans ca, le desk s'abonnait a BTC et ETH pendant que le journal lui
    # demandait KAITO, ZRO, LISTA. Le pilote sautait chaque position faute de
    # prix — en silence — et l'ecran affichait douze invariants au vert, zero
    # position, zero refus. Deux sources de verite sur « ce qu'on trade »
    # divergent toujours, et ici la divergence ne se voyait pas.
    #
    # Le journal gagne parce qu'il est la seule source qui bouge toute seule :
    # une position inscrite le lundi doit etre suivie le lundi, sans qu'un
    # humain pense a editer une variable d'environnement.
    univers = list(dict.fromkeys(settings.assets))
    # Le signal du pupitre, s'il sait dire a quoi il s'attend. Interroge par
    # capacite et non par type : un autre signal qui saurait repondre serait
    # suivi de la meme facon, sans que ce module le connaisse.
    attendre = getattr(getattr(pupitre, "signal", None), "symboles_attendus", None)
    if callable(attendre):
        JOUR_MS = 86_400_000
        attendus = attendre(now_ms(), horizon_ms=2 * JOUR_MS)
        for symbole in sorted(attendus):
            if symbole not in univers:
                univers.append(symbole)
        if attendus:
            log.info("univers du journal : %s", " ".join(sorted(attendus)))

    # FILTRER L'UNIVERS AVANT DE S'ABONNER.
    #
    # Un symbole que l'exchange ne connait pas ne fait pas echouer SON flux :
    # il fait tomber toute la connexion, donc les vingt-et-un autres avec
    # elle. La boucle de reconnexion rejoue les memes souscriptions, se fait
    # couper, recommence — toutes les deux secondes, indefiniment, sans
    # jamais recevoir une seule donnee. Le desk finit en STALE_FEED et
    # s'arrete tout seul, en affichant une erreur qui ne nomme ni le symbole
    # ni la cause : « no close frame received or sent ».
    #
    # C'est arrive en production le 12 septembre 2026. L'univers vient du
    # journal, le journal suit les deverrouillages de jetons, et il finit
    # toujours par contenir un jeton que l'exchange ne liste pas — ou plus.
    inconnus: list[str] = []
    try:
        connus = perps_disponibles(testnet=settings.testnet)
    except Exception as exc:  # noqa: BLE001
        # Ne pas empecher le desk de demarrer parce qu'on n'a pas pu
        # verifier : on garde le comportement d'avant et on le DIT. Se
        # rabattre sur le socle serait pire — l'univers retrecirait en
        # silence et le pilote sauterait des positions sans que rien ne
        # l'explique.
        log.warning("univers non verifie (%s) — souscription a l'aveugle ; "
                    "un symbole inconnu couperait tous les flux", exc)
    else:
        inconnus = [a for a in univers if a.upper() not in connus]
        if inconnus:
            log.error(
                "RETIRES DE L'UNIVERS, inconnus de l'exchange : %s. "
                "Ces symboles auraient coupe la connexion et tous les "
                "autres flux avec. Les positions correspondantes du journal "
                "ne seront pas suivies.", " ".join(sorted(inconnus)))
            univers = [a for a in univers if a.upper() in connus]

    # Ce qui a ete retire doit se VOIR, pas seulement s'ecrire dans un log
    # que personne ne relit. Un univers ampute en silence, c'est le pilote
    # qui saute des positions sans que l'ecran en dise rien.
    state.symboles_inconnus = sorted(inconnus)

    socle = set(settings.assets)
    feed = HyperliquidFeed(testnet=settings.testnet)
    for asset in univers:
        # Le socle est essentiel ; ce que le journal ajoute est de la
        # SURVEILLANCE. Un carnet d'alt qui n'arrive jamais — celui de LISTA
        # sur le testnet — ne doit pas arreter un desk dont le prix arrive
        # par `mids` de toute facon.
        cle = asset in socle
        feed.subscribe(Subscription.trades(asset, essentiel=cle))
        feed.subscribe(Subscription.book(asset, essentiel=cle))
        feed.subscribe(Subscription.asset_ctx(asset, essentiel=cle))
    feed.subscribe(Subscription.mids())

    last_book_write: dict[str, int] = {}

    async def on_trade(t: Trade) -> None:
        state.store.write_trade(t)
        state.last_prices[t.asset] = format(t.price, "f")
        if pupitre is not None:
            pupitre.on_trade(t)

    async def on_book(b: BookSnapshot) -> None:
        # Le pupitre voit TOUS les carnets, meme ceux qu'on n'echantillonne
        # pas en base : un fill se calcule sur le carnet du moment, pas sur
        # celui qu'on a bien voulu enregistrer.
        if pupitre is not None:
            pupitre.on_book(b)
        prev = last_book_write.get(b.asset, 0)
        if b.ts_ms - prev >= BOOK_SAMPLE_INTERVAL_MS:
            last_book_write[b.asset] = b.ts_ms
            state.store.write_book(b)

    async def on_mark(m: MarkPrice) -> None:
        if m.oracle is not None and m.oracle > 0:
            # Recoupement mark / oracle : une divergence anormale signale une
            # donnee douteuse bien avant qu'elle ne produise un mauvais trade.
            state.price_divergence_bps = abs(m.mark - m.oracle) / m.oracle * Decimal("10000")
        state.store.write_mark(m)
        if pupitre is not None:
            pupitre.on_mark(m)

    feed.on_trade, feed.on_book, feed.on_mark = on_trade, on_book, on_mark

    async def health_loop() -> None:
        """Watchdog. Il ne trade pas : il constate, et il peut arreter.

        **La periode d'amorcage.** Le watchdog tourne a 1 Hz des la premiere
        seconde, quand aucun flux n'est encore connecte et qu'aucun compte n'a
        ete lu. Le verdict est alors legitimement en echec — I01 « aucun etat
        de compte connu », I09 « jamais recu » — et l'arret qui en decoulait
        etait un arret LATCHE, qui exige un rearmement manuel.

        Autrement dit : le desk s'arretait definitivement une seconde apres
        chaque demarrage, avant meme d'avoir eu la possibilite d'aller bien.
        Constate le 9 septembre 2026 en lancant le mode PAPER pour la premiere
        fois ; le meme defaut valait pour SHADOW, ou il se voyait moins parce
        qu'un desk arrete y ressemble a un desk qui ne trade pas.

        Pendant l'amorcage, on ne LATCHE donc pas. Rien de dangereux n'est
        autorise pour autant : `evaluate()` continue de refuser chaque ordre
        tant qu'un invariant echoue, et l'interface montre lesquels. La seule
        chose suspendue est le verrou permanent, jusqu'a ce que le desk ait
        ete sain une fois — apres quoi le moindre defaut arrete pour de bon.

        Si l'amorcage ne converge pas dans le delai, on latche : un desk qui
        n'arrive pas a se connecter en une minute a un vrai probleme.
        """
        amorce = False
        depuis = now_ms()
        while True:
            state.set_feeds(feed.feeds, feed.connected)
            state.budget.spend(0)  # rafraichit la fenetre glissante
            # Le battement de coeur du mandat de repos. Sans lui, le mandat
            # de demarrage expire au bout d'un quart d'heure et le desk
            # s'enferme : I06 echoue, le verdict n'est plus approuve, le
            # pupitre refuse tout, et le seul code qui emet un mandat ne
            # tourne donc jamais. Voir `DeskState.renouveler_le_mandat_de_
            # repos`, qui refuse de prolonger un mandat directionnel.
            if state.renouveler_le_mandat_de_repos():
                log.info("mandat de repos reconduit")
            state.store.commit()

            v = state.verdict()
            if v.approved:
                amorce = True
            if v.halt_reason is not None and not state.halted:
                expire = now_ms() - depuis > AMORCAGE_MS
                if amorce or expire:
                    log.error("arret automatique : %s — %s",
                              v.halt_reason.value, v.reason)
                    state.halt(v.halt_reason, v.reason[:500])
                else:
                    log.info("amorcage : %s", v.reason[:200])
            await asyncio.sleep(1.0)

    async def clock_loop() -> None:
        """Derive d'horloge : ecart entre horloge murale et horloge monotone.

        Detecte les sauts NTP brutaux et les VM suspendues, qui cassent les
        nonces silencieusement (angle mort A-04). Ne remplace pas chrony.
        """
        base_wall, base_mono = time.time(), time.monotonic()
        while True:
            await asyncio.sleep(5.0)
            expected = base_wall + (time.monotonic() - base_mono)
            state.clock_drift_ms = int((time.time() - expected) * 1000)

    async def pupitre_loop() -> None:
        """Le cycle de decision. Lent exprès.

        Cinq secondes, pas cinquante millisecondes : le signal des deblocages
        est CALENDAIRE — il se declenche a une date, pas sur un tick. Cycler
        vite ne le rendrait pas plus reactif, seulement plus susceptible de
        reagir a un carnet transitoire. Un signal intraday exigerait une autre
        cadence, et ce serait alors une decision a prendre explicitement.
        """
        while True:
            await asyncio.sleep(5.0)
            try:
                await asyncio.to_thread(pupitre.cycle)
            except Exception:
                # Un pupitre qui tombe ne doit pas emporter l'ingestion : la
                # supervision et le kill switch doivent survivre a une panne
                # de la partie qui trade, pas l'inverse.
                log.exception("cycle du pupitre en echec")

    async def reconciliation_loop(lecteur) -> None:
        """Relever l'etat du compte, en LECTURE SEULE.

        Quatre invariants — I01 reconcilie, I02 stops, I03 perte du jour,
        I04 exposition — ne peuvent rien dire tant que le desk ignore l'etat
        du compte. Hors mode demo, personne ne le renseignait : ils
        restaient donc en defaut indefiniment, et l'ecran affichait
        « decollage bloque » sur un desk qui allait parfaitement bien. Un
        controle qui ne peut pas etre evalue est un controle en echec — mais
        le laisser inevaluable par simple absence de cablage, c'est
        fabriquer l'echec.

        Le point important : ce releve n'exige AUCUNE cle. L'endpoint
        d'information d'Hyperliquid rend l'etat d'un compte a partir de sa
        seule adresse publique. On peut donc tout voir sans rien pouvoir
        signer, ce qui est exactement la posture qu'on veut en SHADOW.

        En cas d'echec on ne touche a rien : I01 controle lui-meme l'age de
        la derniere reconciliation et passe au rouge au-dela de soixante
        secondes. Reecrire un etat perime en le marquant frais serait la
        seule facon de rendre ce controle dangereux.
        """
        while True:
            try:
                etat = await asyncio.to_thread(lecteur.account_state)
                state.set_account(etat, reconciled=True)
                # I03 exige le PnL du jour. Sans lui il repond « inconnu »,
                # ce qui vaut ECHEC : un desk parfaitement sain resterait
                # bloque parce qu'un chiffre n'a pas ete releve.
                jour = getattr(lecteur, "realise_jour_usd", None)
                if callable(jour):
                    state.day_realized_pnl_usd = await asyncio.to_thread(jour)
                elif jour is not None:
                    state.day_realized_pnl_usd = jour
            except Exception as exc:
                log.warning("reconciliation en echec : %s", exc)
            await asyncio.sleep(15.0)

    tasks = [
        asyncio.create_task(feed.run()),
        asyncio.create_task(health_loop()),
        asyncio.create_task(clock_loop()),
    ]
    if pupitre is not None:
        tasks.append(asyncio.create_task(pupitre_loop()))
        tasks.append(asyncio.create_task(reconciliation_loop(pupitre.exchange)))
    elif settings.agent_wallet_address:
        # Pas de pupitre (SHADOW) : on ouvre quand meme un client SANS CLE,
        # uniquement pour lire. Il ne peut rien signer, par construction.
        from .execution.hyperliquid_client import HyperliquidClient

        tasks.append(asyncio.create_task(reconciliation_loop(
            HyperliquidClient(
                account_address=settings.agent_wallet_address,
                private_key=None,
                testnet=settings.testnet,
            ))))
    try:
        await asyncio.gather(*tasks)
    finally:
        feed.stop()
        for t in tasks:
            t.cancel()


def _verifier_le_port(settings: Settings) -> None:
    """Refuser tot, et lisiblement, si le port est deja pris.

    Uvicorn laisse remonter un `SystemExit(3)` depuis une tache asyncio :
    quarante lignes de trace dont le seul mot utile — « address already in
    use » — est noye au milieu. On le lit comme une panne du desk alors que
    c'est l'inverse : un desk tourne deja, et il va tres bien.

    On teste donc le bind nous-memes, avant de construire quoi que ce soit,
    et on le dit en une phrase. `SO_REUSEADDR` est pose exprès comme uvicorn
    le fera, sinon on refuserait un port que lui aurait accepte.
    """
    import socket

    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        s.bind((settings.api_host, settings.api_port))
    except OSError:
        raise SystemExit(
            f"\n  Un desk tourne deja sur http://{settings.api_host}:"
            f"{settings.api_port}\n\n"
            "  Ouvrez-le dans le navigateur, ou arretez-le (Ctrl+C dans sa\n"
            "  fenetre) avant d'en lancer un autre. Pour en lancer un second\n"
            "  a cote, choisissez un autre port :\n\n"
            f"      DESK_API_PORT={settings.api_port + 1} desk\n"
        ) from None
    finally:
        s.close()


def _annoncer_le_programme(pilote, settings: Settings) -> None:
    """Dire au demarrage ce que le desk va suivre, et ce qu'il ne peut pas.

    Un desk qui demarre sans rien dire laisse son operateur deviner s'il
    attend une fenetre, s'il lui manque un flux, ou s'il est casse. Les
    trois se ressemblent a l'ecran — zero position — et seul le premier est
    normal.

    Le cas concret qui a motive ceci : le journal demandait KAITO, ZRO,
    LISTA, le desk etait abonne a BTC et ETH, et rien ne le disait.
    """
    from datetime import datetime, timezone

    maintenant = now_ms()
    attendus = pilote.symboles_attendus(maintenant)
    if attendus:
        log.info("fenetres ouvertes maintenant : %s", " ".join(sorted(attendus)))
    else:
        suite = pilote.prochaine_fenetre(maintenant)
        if suite is None:
            log.warning(
                "aucune position a venir dans le journal : le desk tournera "
                "sans rien avoir a faire. Regenerer : "
                "python3 scripts/journal_unlocks.py")
        else:
            symbole, quand = suite
            jour = datetime.fromtimestamp(quand / 1000, timezone.utc)
            heures = max(0, (quand - maintenant) // 3_600_000)
            log.info(
                "aucune fenetre ouverte. Prochaine : %s le %s (dans %d h). "
                "Zero position d'ici la est le comportement attendu.",
                symbole, jour.strftime("%Y-%m-%d"), heures)

    # Ce que le journal reclamera bientot et qui n'est pas dans DESK_ASSETS
    # est desormais suivi automatiquement ; on le dit quand meme, parce
    # qu'un abonnement implicite est un abonnement qu'on oublie.
    horizon = pilote.symboles_attendus(maintenant, horizon_ms=7 * 86_400_000)
    hors_reglage = sorted(horizon - set(settings.assets))
    if hors_reglage:
        log.info("suivis d'apres le journal (hors DESK_ASSETS) : %s",
                 " ".join(hors_reglage))


async def run_demo(state: DeskState, settings: Settings) -> None:
    """Marche simule, sans reseau.

    Sert a deux choses : ouvrir l'interface sur un ecran vivant, et pouvoir
    tester le kill switch et l'affichage des invariants sans dependre d'un
    exchange. Les donnees sont explicitement marquees comme simulees.
    """
    log.warning("MODE DEMO — donnees simulees, aucune connexion a Hyperliquid")

    # La demo presente un desk *correctement configure*, sinon l'ecran s'ouvre
    # sur un I12 rouge qu'on apprend a ignorer — exactement l'habitude qu'une
    # interface de supervision ne doit pas installer. Ces adresses sont
    # fictives et ne servent qu'a rendre l'invariant evaluable.
    if not settings.agent_wallet_address:
        settings.agent_wallet_address = "0xDEMO_AGENT_WALLET"
        settings.master_wallet_address = "0xDEMO_MASTER_WALLET"
        settings.signer_can_withdraw = False
        log.warning("adresses de demonstration injectees (aucune cle, aucun signer)")

    prices = {"BTC": Decimal("64000"), "ETH": Decimal("3100")}
    feeds = {
        name: FeedHealth(name=name, max_age_ms=20_000, status=FeedStatus.LIVE,
                         last_message_ms=now_ms())
        for name in ("trades:BTC", "book:BTC", "trades:ETH", "mids")
    }
    state.set_account(demo_account())
    state.day_realized_pnl_usd = Decimal("0")
    state.clock_drift_ms = 3

    ref = state.store.journal(
        "demo_boot",
        {"note": "Mandat de demonstration, aucune execution.",
         "regime": Regime.RANGE.value},
    )
    state.set_mandate(
        Mandate(
            bias=Bias.LONG, regime=Regime.RANGE, conviction=Decimal("0.55"),
            universe=("BTC",), max_notional_usd=Decimal("300"),
            max_leverage=Decimal("2"), max_concurrent_positions=1,
            ttl_ms=20 * 60 * 1000, journal_ref=ref,
        )
    )

    tick = 0
    while True:
        tick += 1
        for asset, base in list(prices.items()):
            drift = Decimal(str(math.sin(tick / 25) * 0.0006 + random.uniform(-0.0004, 0.0004)))
            px = (base * (1 + drift)).quantize(Decimal("0.01"))
            prices[asset] = px
            state.last_prices[asset] = format(px, "f")
            state.store.write_trade(
                Trade(asset=asset, price=px, size=Decimal("0.01"),
                      is_buy=random.random() > 0.5, ts_ms=now_ms())
            )
        for name in feeds:
            feeds[name] = feeds[name].model_copy(
                update={"last_message_ms": now_ms(),
                        "messages": feeds[name].messages + 1,
                        "status": FeedStatus.LIVE}
            )
        state.set_feeds(tuple(feeds.values()), True)
        state.set_account(demo_account(), reconciled=True)
        state.store.commit()

        v = state.verdict()
        if v.halt_reason is not None and not state.halted:
            state.halt(v.halt_reason, v.reason[:500])
        await asyncio.sleep(1.0)


def is_known_websockets_noise(exc: BaseException | None) -> bool:
    """Vrai uniquement pour la trace parasite connue de websockets.

    Trois conditions cumulees — type, message, et fichier d'origine — parce
    qu'un filtre de journal trop large transforme un vrai bug en silence, ce
    qui est bien pire que le bruit qu'il supprime.
    """
    if not isinstance(exc, AttributeError) or "status_code" not in str(exc):
        return False
    tb = exc.__traceback__
    while tb is not None:
        if "websockets/asyncio/client.py" in tb.tb_frame.f_code.co_filename:
            return True
        tb = tb.tb_next
    return False


def _install_asyncio_noise_filter() -> None:
    """Rabaisse une trace connue de la bibliotheque websockets.

    Quand la connexion est refusee au niveau du proxy ou du TLS, websockets
    leve une `AttributeError` interne depuis `connection_lost`, et asyncio en
    imprime la trace complete a chaque tentative. Le desk a DEJA journalise la
    vraie cause juste avant ("websocket interrompu : ..."), donc ces lignes
    n'apportent rien — elles noient les incidents reels, et un journal
    illisible est un journal qu'on cesse de lire.

    Le filtre s'appuie sur l'ORIGINE de la trace, pas sur la forme du contexte
    asyncio : selon que l'erreur remonte d'un callback ou d'une tache, les
    cles disponibles changent, et se fier a l'une d'elles rend le filtre
    silencieusement inoperant.

    Volontairement etroit : meme fichier, meme exception, meme symptome. Tout
    le reste garde sa trace complete, sinon un vrai bug deviendrait un silence.
    """
    loop = asyncio.get_running_loop()

    def handler(loop: asyncio.AbstractEventLoop, context: dict) -> None:
        exc = context.get("exception")
        if is_known_websockets_noise(exc):
            log.debug("bruit websockets ignore : %s", exc)
            return
        loop.default_exception_handler(context)

    loop.set_exception_handler(handler)


class _PrixVus:
    """Vue Decimal sur la table de prix de la supervision.

    `DeskState.last_prices` stocke des chaines, parce que c'est ce que
    l'interface serialise. Le pilote a besoin de `Decimal`. Convertir a la
    lecture plutot que maintenir une seconde table evite la seule chose qui
    compte ici : que le desk trade sur un prix que l'ecran ne montre pas.
    """

    def __init__(self, source: dict[str, str]) -> None:
        self._source = source

    def get(self, asset: str, defaut=None):
        brut = self._source.get(asset)
        if brut is None:
            return defaut
        try:
            return Decimal(brut)
        except (ArithmeticError, ValueError):
            return defaut


async def main_async(demo: bool) -> None:
    _install_asyncio_noise_filter()
    settings = get_settings()
    store = SqliteStore(settings.db_path)
    state = DeskState(settings, store)

    if settings.mode is DeskMode.LIVE:
        # La porte P1 s'est ouverte a moitie, et la moitie qui reste fermee
        # est celle qui engage de l'argent.
        #
        # CE QUI EST ACQUIS : la signature. Chaque hash et chaque signature
        # sont compares octet pour octet a ceux du SDK officiel, sur des
        # vecteurs couvrant ordres limite, stops declencheurs, annulations,
        # coffres et expirations, sur les deux reseaux
        # (`tests/test_signature_hyperliquid.py`). Un ordre refuse ne le sera
        # pas pour cause de signature.
        #
        # CE QUI NE L'EST PAS : tout le reste de la requete. Les indices
        # d'actifs, les pas de cotation, les tailles minimales et le
        # comportement de l'API viennent encore de la documentation. Aucun
        # aller-retour reel n'a eu lieu. C'est exactement ce que le testnet
        # sert a eprouver — sans un centime en jeu.
        #
        # Ce garde saute quand un aller-retour testnet aura reussi, et il se
        # franchit deliberement, pas par oubli d'une variable d'environnement.
        raise SystemExit(
            "mode LIVE refuse : la signature est validee contre le SDK "
            "officiel, mais aucun aller-retour reel n'a encore eu lieu. "
            "Passer par TESTNET d'abord — le format des requetes n'a jamais "
            "ete confronte a un exchange."
        )

    # Le pupitre existe en PAPER et en TESTNET. En SHADOW la meme boucle
    # tourne sans lui : memes flux, memes invariants, aucun ordre.
    #
    # Les deux modes partagent TOUT sauf l'exchange, et c'est voulu : le
    # testnet n'est pas un autre desk, c'est le meme contre un carnet reel.
    # Deux branches separees finiraient par diverger — le jour ou l'une
    # gagnerait un garde-fou que l'autre n'a pas, c'est celle qui signe pour
    # de vrai qui en manquerait.
    pupitre = None
    if settings.mode in (DeskMode.PAPER, DeskMode.TESTNET) and not demo:
        from .execution.pupitre import Pupitre, exchange_pour
        from .sentinelle.pilote_deblocages import PiloteDeblocages

        pilote = PiloteDeblocages(settings.paper_journal)
        if pilote.absent:
            raise SystemExit(
                f"mode {settings.mode.value} refuse : {settings.paper_journal} "
                "est absent. Le desk ne trade que des positions inscrites "
                "AVANT les faits ; sans journal, il n'y a rien a trader et "
                "une entree calculee a la volee ne serait pas hors "
                "echantillon. "
                "Produire le journal : python scripts/journal_unlocks.py"
            )
        pupitre = Pupitre(state, exchange_pour(state), pilote,
                          univers=tuple(settings.assets))
        # Sans ce branchement, le desk peut refuser toutes ses entrees en
        # affichant « aucun blocage » : les invariants disent si le desk a le
        # DROIT d'agir, pas s'il agit.
        state.rapport_pupitre = pupitre.resume
        _annoncer_le_programme(pilote, settings)
        # Le pilote a besoin des derniers prix pour poser un niveau d'entree.
        # On lui donne la MEME table que la supervision, par reference : deux
        # tables finiraient par diverger, et le desk traderait sur des prix
        # que l'ecran ne montre pas.
        pilote.prix = _PrixVus(state.last_prices)

    store.journal("boot", {
        "mode": settings.mode.value,
        "testnet": settings.testnet,
        "assets": list(settings.assets),
        "demo": demo,
        "signal": pupitre.signal.nom if pupitre else None,
    })

    _verifier_le_port(settings)

    app = create_app(state)
    server = uvicorn.Server(
        uvicorn.Config(app, host=settings.api_host, port=settings.api_port,
                       log_level="warning", access_log=False)
    )

    worker = (run_demo(state, settings) if demo
              else run_ingestion(state, settings, pupitre))
    tasks = [asyncio.create_task(server.serve()), asyncio.create_task(worker)]

    print(f"\n  Desk en mode {settings.mode.value}"
          f"{' (DEMO)' if demo else ''} — supervision :")
    print(f"  http://{settings.api_host}:{settings.api_port}\n")

    try:
        await asyncio.gather(*tasks)
    except (asyncio.CancelledError, KeyboardInterrupt):
        pass
    finally:
        state.halt(HaltReason.MANUAL, "arret du processus")
        for t in tasks:
            t.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await t
        store.commit()
        store.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Trading desk — phase P0")
    parser.add_argument("--demo", action="store_true",
                        help="marche simule, sans reseau ni exchange")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s  %(levelname)-7s %(name)s  %(message)s",
    )
    try:
        asyncio.run(main_async(args.demo))
    except KeyboardInterrupt:
        print("\n  arret demande.\n")


if __name__ == "__main__":
    main()
