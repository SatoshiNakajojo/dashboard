"""Client WebSocket Hyperliquid : ingestion, heartbeat, detection de flux gele.

Ce module est la premiere brique du P0 et celle dont tout depend. Il est ecrit
autour d'une seule conviction : **un flux gele est plus dangereux qu'un flux
coupe**, parce qu'il ne leve aucune exception et laisse les indicateurs
calculer sur une valeur morte (angle mort A-10).

D'ou trois mecanismes qui n'ont l'air de rien mais font tout le travail :

- un `FeedHealth` par souscription, avec un age maximal propre a la cadence du
  flux : quelques secondes pour des trades BTC, bien plus pour le funding ;
- un ping applicatif periodique, parce que Hyperliquid ferme les connexions
  silencieuses (~60 s) ;
- une reconnexion a backoff exponentiel qui *re-souscrit* tout, et compte ses
  tentatives pour que la supervision les voie.

Le client ne decide rien et ne stocke rien : il valide, horodate, et transmet.
"""

from __future__ import annotations

import asyncio
import json
import logging
import random
from collections.abc import Awaitable, Callable
from decimal import Decimal, InvalidOperation
from typing import Any

import websockets

from ..contracts.common import now_ms
from ..contracts.market import (
    BookLevel, BookSnapshot, FeedHealth, FeedStatus, MarkPrice, Trade,
)

log = logging.getLogger(__name__)

MAINNET_WS = "wss://api.hyperliquid.xyz/ws"
TESTNET_WS = "wss://api.hyperliquid-testnet.xyz/ws"

PING_INTERVAL_S = 25.0
MAX_BACKOFF_S = 60.0

Handler = Callable[[Any], Awaitable[None]]


def _dec(value: Any) -> Decimal | None:
    try:
        d = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None
    return d if d.is_finite() else None


class Subscription:
    """Une souscription et la sante du flux qu'elle alimente."""

    __slots__ = ("payload", "feed", "max_age_ms")

    def __init__(self, payload: dict[str, Any], name: str, max_age_ms: int) -> None:
        self.payload = payload
        self.max_age_ms = max_age_ms
        self.feed = FeedHealth(name=name, max_age_ms=max_age_ms)

    @classmethod
    def trades(cls, coin: str, max_age_ms: int = 20_000) -> Subscription:
        return cls({"type": "trades", "coin": coin}, f"trades:{coin}", max_age_ms)

    @classmethod
    def book(cls, coin: str, max_age_ms: int = 10_000) -> Subscription:
        return cls({"type": "l2Book", "coin": coin}, f"book:{coin}", max_age_ms)

    @classmethod
    def mids(cls, max_age_ms: int = 10_000) -> Subscription:
        return cls({"type": "allMids"}, "mids", max_age_ms)

    @classmethod
    def asset_ctx(cls, coin: str, max_age_ms: int = 120_000) -> Subscription:
        # Funding et open interest bougent lentement : seuil large, sinon on
        # declare mort un flux parfaitement sain.
        return cls({"type": "activeAssetCtx", "coin": coin}, f"ctx:{coin}", max_age_ms)


class HyperliquidFeed:
    """Connexion WebSocket unique, multi-souscriptions.

    Usage :

        feed = HyperliquidFeed(testnet=True)
        feed.subscribe(Subscription.trades("BTC"))
        feed.on_trade = mon_handler
        await feed.run()          # boucle jusqu'a annulation
    """

    def __init__(self, *, testnet: bool = True, url: str | None = None) -> None:
        self.url = url or (TESTNET_WS if testnet else MAINNET_WS)
        self._subs: list[Subscription] = []
        self._ws: websockets.ClientConnection | None = None
        self._connected = False
        self._stop = asyncio.Event()

        self.on_trade: Handler | None = None
        self.on_book: Handler | None = None
        self.on_mark: Handler | None = None
        self.on_raw: Handler | None = None

    # ------------------------------------------------------------ souscriptions

    def subscribe(self, sub: Subscription) -> Subscription:
        self._subs.append(sub)
        return sub

    @property
    def feeds(self) -> tuple[FeedHealth, ...]:
        """Sante evaluee de tous les flux. C'est ce que lit l'invariant I09."""
        at = now_ms()
        return tuple(s.feed.evaluate(at) for s in self._subs)

    @property
    def connected(self) -> bool:
        return self._connected

    def _touch(self, name: str) -> None:
        for s in self._subs:
            if s.feed.name == name:
                s.feed = s.feed.model_copy(
                    update={
                        "last_message_ms": now_ms(),
                        "messages": s.feed.messages + 1,
                        "status": FeedStatus.LIVE,
                        "last_error": None,
                    }
                )
                return

    def _mark_all(self, status: FeedStatus, error: str | None = None) -> None:
        for s in self._subs:
            update: dict[str, Any] = {"status": status}
            if error is not None:
                update["last_error"] = error
            if status is FeedStatus.DISCONNECTED:
                update["reconnects"] = s.feed.reconnects + 1
            s.feed = s.feed.model_copy(update=update)

    # ------------------------------------------------------------------ boucle

    def stop(self) -> None:
        self._stop.set()

    async def run(self) -> None:
        """Boucle de connexion. Ne rend la main que sur `stop()` ou annulation."""
        attempt = 0
        while not self._stop.is_set():
            try:
                async with websockets.connect(
                    self.url, ping_interval=None, max_queue=1024
                ) as ws:
                    self._ws = ws
                    self._connected = True
                    attempt = 0
                    await self._send_subscriptions(ws)
                    log.info("connecte a %s, %d souscriptions", self.url, len(self._subs))
                    ping = asyncio.create_task(self._ping_loop(ws))
                    try:
                        await self._read_loop(ws)
                    finally:
                        ping.cancel()
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 - toute panne doit etre survivable
                log.warning("websocket interrompu : %s", exc)
                self._mark_all(FeedStatus.DISCONNECTED, str(exc)[:200])
            finally:
                self._connected = False
                self._ws = None

            if self._stop.is_set():
                break
            # Backoff exponentiel avec gigue : sans la gigue, plusieurs desks
            # qui redemarrent se resynchronisent et martelent l'API ensemble.
            attempt += 1
            delay = min(MAX_BACKOFF_S, 2 ** min(attempt, 6)) * (0.5 + random.random())
            log.info("reconnexion dans %.1f s (tentative %d)", delay, attempt)
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=delay)
            except asyncio.TimeoutError:
                pass

    async def _send_subscriptions(self, ws: Any) -> None:
        for s in self._subs:
            await ws.send(json.dumps({"method": "subscribe", "subscription": s.payload}))

    async def _ping_loop(self, ws: Any) -> None:
        """Hyperliquid ferme les connexions silencieuses. Le ping applicatif
        est ce qui distingue "rien ne se passe sur le marche" de "on est
        deconnecte sans le savoir"."""
        try:
            while True:
                await asyncio.sleep(PING_INTERVAL_S)
                await ws.send(json.dumps({"method": "ping"}))
        except (asyncio.CancelledError, Exception):  # noqa: B014
            return

    async def _read_loop(self, ws: Any) -> None:
        async for raw in ws:
            try:
                msg = json.loads(raw)
            except (ValueError, TypeError):
                log.debug("message non JSON ignore")
                continue
            if self.on_raw:
                await self.on_raw(msg)
            await self._dispatch(msg)

    # --------------------------------------------------------------- dispatch

    async def _dispatch(self, msg: dict[str, Any]) -> None:
        channel = msg.get("channel")
        data = msg.get("data")
        if channel in (None, "pong", "subscriptionResponse"):
            return

        if channel == "trades" and isinstance(data, list):
            for item in data:
                trade = self._parse_trade(item)
                if trade is None:
                    continue
                self._touch(f"trades:{trade.asset}")
                if self.on_trade:
                    await self.on_trade(trade)

        elif channel == "l2Book" and isinstance(data, dict):
            book = self._parse_book(data)
            if book is not None:
                self._touch(f"book:{book.asset}")
                if self.on_book:
                    await self.on_book(book)

        elif channel == "allMids" and isinstance(data, dict):
            self._touch("mids")
            if self.on_mark:
                for coin, px in (data.get("mids") or {}).items():
                    price = _dec(px)
                    if price and price > 0:
                        await self.on_mark(
                            MarkPrice(asset=coin, mark=price, ts_ms=now_ms())
                        )

        elif channel == "activeAssetCtx" and isinstance(data, dict):
            mark = self._parse_ctx(data)
            if mark is not None:
                self._touch(f"ctx:{mark.asset}")
                if self.on_mark:
                    await self.on_mark(mark)

    # Les parseurs renvoient None plutot que de lever : un message malforme est
    # une donnee de mauvaise qualite, pas une raison d'arreter l'ingestion. Le
    # flux devient alors stale de lui-meme, ce que l'invariant I09 detecte.

    def _parse_trade(self, item: dict[str, Any]) -> Trade | None:
        price, size = _dec(item.get("px")), _dec(item.get("sz"))
        coin = item.get("coin")
        if not coin or price is None or size is None or price <= 0 or size <= 0:
            return None
        return Trade(
            asset=str(coin),
            price=price,
            size=size,
            is_buy=item.get("side") == "B",
            ts_ms=int(item.get("time") or now_ms()),
        )

    def _parse_book(self, data: dict[str, Any]) -> BookSnapshot | None:
        coin = data.get("coin")
        levels = data.get("levels")
        if not coin or not isinstance(levels, list) or len(levels) != 2:
            return None

        def side(rows: Any) -> tuple[BookLevel, ...]:
            out = []
            for r in rows or []:
                px, sz = _dec(r.get("px")), _dec(r.get("sz"))
                if px is not None and sz is not None and px > 0 and sz >= 0:
                    out.append(BookLevel(price=px, size=sz))
            return tuple(out)

        bids, asks = side(levels[0]), side(levels[1])
        if not bids or not asks:
            return None
        return BookSnapshot(
            asset=str(coin), bids=bids, asks=asks,
            ts_ms=int(data.get("time") or now_ms()),
        )

    def _parse_ctx(self, data: dict[str, Any]) -> MarkPrice | None:
        coin = data.get("coin")
        ctx = data.get("ctx") or {}
        mark = _dec(ctx.get("markPx"))
        if not coin or mark is None or mark <= 0:
            return None
        funding = _dec(ctx.get("funding"))
        return MarkPrice(
            asset=str(coin),
            mark=mark,
            oracle=_dec(ctx.get("oraclePx")),
            funding_rate_bps=funding * Decimal("10000") if funding is not None else None,
            open_interest_usd=_dec(ctx.get("openInterest")),
            ts_ms=now_ms(),
        )
