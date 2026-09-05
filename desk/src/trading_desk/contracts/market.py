"""Donnees de marche et sante des flux.

Le point important de ce module n'est pas la structure des ticks : c'est
`FeedHealth`. Un flux WebSocket qui gele sur un dernier prix est plus dangereux
qu'un flux coupe, parce qu'il ne leve aucune exception et que les indicateurs
continuent de calculer sur une valeur morte (angle mort A-10).
"""

from __future__ import annotations

from decimal import Decimal
from enum import Enum

from pydantic import Field

from .common import Frozen, now_ms


class Trade(Frozen):
    asset: str
    price: Decimal = Field(gt=0)
    size: Decimal = Field(gt=0)
    is_buy: bool
    ts_ms: int


class BookLevel(Frozen):
    price: Decimal = Field(gt=0)
    size: Decimal = Field(ge=0)


class BookSnapshot(Frozen):
    asset: str
    bids: tuple[BookLevel, ...]
    asks: tuple[BookLevel, ...]
    ts_ms: int

    @property
    def best_bid(self) -> Decimal | None:
        return self.bids[0].price if self.bids else None

    @property
    def best_ask(self) -> Decimal | None:
        return self.asks[0].price if self.asks else None

    @property
    def mid(self) -> Decimal | None:
        b, a = self.best_bid, self.best_ask
        return (b + a) / 2 if b is not None and a is not None else None

    @property
    def spread_bps(self) -> Decimal | None:
        b, a, m = self.best_bid, self.best_ask, self.mid
        if b is None or a is None or not m:
            return None
        return (a - b) / m * Decimal("10000")

    def depth_usd(self, side: str, levels: int = 10) -> Decimal:
        rows = self.bids if side == "bid" else self.asks
        return sum((r.price * r.size for r in rows[:levels]), Decimal("0"))

    def imbalance(self, levels: int = 10) -> Decimal | None:
        """Desequilibre du carnet dans [-1, 1]. Positif = pression acheteuse."""
        b = self.depth_usd("bid", levels)
        a = self.depth_usd("ask", levels)
        total = b + a
        return (b - a) / total if total > 0 else None


class MarkPrice(Frozen):
    asset: str
    mark: Decimal = Field(gt=0)
    oracle: Decimal | None = Field(default=None, gt=0)
    funding_rate_bps: Decimal | None = None
    open_interest_usd: Decimal | None = None
    ts_ms: int


class FeedStatus(str, Enum):
    LIVE = "LIVE"
    STALE = "STALE"        # connecte mais plus de tick depuis trop longtemps
    DISCONNECTED = "DISCONNECTED"
    NEVER_CONNECTED = "NEVER_CONNECTED"

    @property
    def is_tradable(self) -> bool:
        return self is FeedStatus.LIVE


class FeedHealth(Frozen):
    """Etat de fraicheur d'un flux nomme.

    `max_age_ms` est le seuil au-dela duquel le flux est declare mort. Il doit
    etre cale sur la cadence naturelle du flux : quelques secondes pour des
    trades sur un actif liquide, davantage pour le funding.
    """

    name: str
    status: FeedStatus = FeedStatus.NEVER_CONNECTED
    last_message_ms: int | None = None
    max_age_ms: int = 15_000
    messages: int = 0
    reconnects: int = 0
    last_error: str | None = None

    def age_ms(self, at_ms: int | None = None) -> int | None:
        if self.last_message_ms is None:
            return None
        return max(0, (at_ms if at_ms is not None else now_ms()) - self.last_message_ms)

    def evaluate(self, at_ms: int | None = None) -> FeedHealth:
        """Recalcule le statut a partir de l'age. Une deconnexion explicite
        n'est jamais ecrasee par ce calcul."""
        if self.status is FeedStatus.DISCONNECTED:
            return self
        age = self.age_ms(at_ms)
        if age is None:
            return self.model_copy(update={"status": FeedStatus.NEVER_CONNECTED})
        status = FeedStatus.LIVE if age <= self.max_age_ms else FeedStatus.STALE
        return self.model_copy(update={"status": status})
