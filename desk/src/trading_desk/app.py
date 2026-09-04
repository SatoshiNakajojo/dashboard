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
from .market import HyperliquidFeed, Subscription
from .storage import SqliteStore

log = logging.getLogger("desk")

# Le carnet arrive plusieurs fois par seconde : tout persister sature le disque
# pour une valeur analytique nulle. Un echantillon par seconde et par actif
# suffit a reconstruire spread, profondeur et desequilibre.
BOOK_SAMPLE_INTERVAL_MS = 1_000


async def run_ingestion(state: DeskState, settings: Settings) -> None:
    """Boucle d'ingestion. Ne rend la main que sur annulation."""
    feed = HyperliquidFeed(testnet=settings.testnet)
    for asset in settings.assets:
        feed.subscribe(Subscription.trades(asset))
        feed.subscribe(Subscription.book(asset))
        feed.subscribe(Subscription.asset_ctx(asset))
    feed.subscribe(Subscription.mids())

    last_book_write: dict[str, int] = {}

    async def on_trade(t: Trade) -> None:
        state.store.write_trade(t)
        state.last_prices[t.asset] = format(t.price, "f")

    async def on_book(b: BookSnapshot) -> None:
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

    feed.on_trade, feed.on_book, feed.on_mark = on_trade, on_book, on_mark

    async def health_loop() -> None:
        """Watchdog. Il ne trade pas : il constate, et il peut arreter."""
        while True:
            state.set_feeds(feed.feeds, feed.connected)
            state.budget.spend(0)  # rafraichit la fenetre glissante
            state.store.commit()

            v = state.verdict()
            if v.halt_reason is not None and not state.halted:
                log.error("arret automatique : %s — %s", v.halt_reason.value, v.reason)
                state.halt(v.halt_reason, v.reason[:500])
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

    tasks = [
        asyncio.create_task(feed.run()),
        asyncio.create_task(health_loop()),
        asyncio.create_task(clock_loop()),
    ]
    try:
        await asyncio.gather(*tasks)
    finally:
        feed.stop()
        for t in tasks:
            t.cancel()


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


async def main_async(demo: bool) -> None:
    _install_asyncio_noise_filter()
    settings = get_settings()
    store = SqliteStore(settings.db_path)
    state = DeskState(settings, store)

    if settings.mode.sends_orders:
        # Filet de securite : la phase P0 n'a pas de couche d'execution. Un
        # mode qui enverrait des ordres serait une erreur de configuration.
        raise SystemExit(
            f"mode {settings.mode.value} refuse : la couche d'execution n'existe "
            "pas encore (porte P1 non franchie). Utiliser SHADOW ou PAPER."
        )

    store.journal("boot", {
        "mode": settings.mode.value,
        "testnet": settings.testnet,
        "assets": list(settings.assets),
        "demo": demo,
    })

    app = create_app(state)
    server = uvicorn.Server(
        uvicorn.Config(app, host=settings.api_host, port=settings.api_port,
                       log_level="warning", access_log=False)
    )

    worker = run_demo(state, settings) if demo else run_ingestion(state, settings)
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
