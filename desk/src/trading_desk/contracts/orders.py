"""Ordres, positions, fills. Vocabulaire de la couche deterministe.

Rappel de l'invariant I02 : l'exchange est l'unique source de verite. Ces
modeles decrivent ce que le desk *croit* ; la reconciliation les remplace par
ce que l'exchange *dit*, jamais l'inverse.
"""

from __future__ import annotations

from decimal import Decimal
from enum import Enum
from typing import Literal

from pydantic import Field, model_validator

from .common import EntryStyle, Frozen, Side, now_ms


class OrderPurpose(str, Enum):
    """Pourquoi cet ordre existe. Determine le cloid, donc l'idempotence."""

    ENTRY = "ENTRY"
    STOP_LOSS = "STOP_LOSS"
    TAKE_PROFIT = "TAKE_PROFIT"
    REDUCE = "REDUCE"
    FLATTEN = "FLATTEN"


class OrderStatus(str, Enum):
    PENDING = "PENDING"        # construit, pas encore signe
    SENT = "SENT"              # signe et envoye, sort inconnu
    RESTING = "RESTING"        # au carnet
    FILLED = "FILLED"
    PARTIAL = "PARTIAL"
    CANCELLED = "CANCELLED"
    REJECTED = "REJECTED"
    UNKNOWN = "UNKNOWN"        # etat perdu : la reconciliation doit trancher

    @property
    def is_terminal(self) -> bool:
        return self in (OrderStatus.FILLED, OrderStatus.CANCELLED, OrderStatus.REJECTED)


class OrderIntent(Frozen):
    """Une intention d'ordre, avant signature.

    `cloid` est derive de facon deterministe du contenu de l'intention
    (cf. execution.cloid). Deux tentatives d'envoi de la meme intention portent
    donc le meme cloid, et l'exchange dedoublonne : c'est la parade a l'angle
    mort A-02 (reponse HTTP perdue -> position doublee).
    """

    intent_id: str
    mandate_id: str
    asset: str
    side: Side
    purpose: OrderPurpose
    size: Decimal = Field(gt=0)
    limit_price: Decimal | None = Field(default=None, gt=0)
    trigger_price: Decimal | None = Field(default=None, gt=0)
    style: EntryStyle = EntryStyle.LIMIT_PASSIVE
    reduce_only: bool = False
    created_at_ms: int = Field(default_factory=now_ms)

    @model_validator(mode="after")
    def _shape(self) -> OrderIntent:
        if self.purpose in (OrderPurpose.STOP_LOSS, OrderPurpose.TAKE_PROFIT):
            if self.trigger_price is None:
                raise ValueError(f"{self.purpose} exige un trigger_price")
            if not self.reduce_only:
                raise ValueError(f"{self.purpose} doit etre reduce_only")
        if self.style is not EntryStyle.MARKET_IOC and self.purpose is OrderPurpose.ENTRY:
            if self.limit_price is None:
                raise ValueError("une entree limite exige un limit_price")
        return self


class OrderRecord(Frozen):
    """Etat connu d'un ordre. Ecrit dans le journal a chaque transition."""

    cloid: str
    intent: OrderIntent
    status: OrderStatus = OrderStatus.PENDING
    exchange_oid: int | None = None
    filled_size: Decimal = Decimal("0")
    avg_price: Decimal | None = None
    error: str | None = None
    updated_at_ms: int = Field(default_factory=now_ms)


class Fill(Frozen):
    """Un fill tel que rapporte par l'exchange. Unite de base du journal fiscal."""

    fill_id: str
    cloid: str | None
    asset: str
    side: Side
    size: Decimal = Field(gt=0)
    price: Decimal = Field(gt=0)
    fee_usd: Decimal = Decimal("0")
    is_maker: bool = False
    ts_ms: int

    @property
    def notional_usd(self) -> Decimal:
        return self.size * self.price


class Position(Frozen):
    """Position telle que lue chez l'exchange lors de la reconciliation."""

    asset: str
    side: Side
    size: Decimal = Field(gt=0)
    entry_price: Decimal = Field(gt=0)
    mark_price: Decimal = Field(gt=0)
    leverage: Decimal = Field(gt=0)
    unrealized_pnl_usd: Decimal = Decimal("0")
    liquidation_price: Decimal | None = None
    # Renseigne par la reconciliation : y a-t-il un stop actif COTE EXCHANGE ?
    # Un None signifie "inconnu", ce qui vaut echec pour l'invariant I02.
    protective_stop_cloid: str | None = None

    @property
    def notional_usd(self) -> Decimal:
        return self.size * self.mark_price

    @property
    def is_protected(self) -> bool:
        return self.protective_stop_cloid is not None


class AccountState(Frozen):
    """Photo du compte au moment de la reconciliation."""

    equity_usd: Decimal
    available_margin_usd: Decimal
    used_margin_usd: Decimal
    positions: tuple[Position, ...] = ()
    open_orders: tuple[OrderRecord, ...] = ()
    reconciled_at_ms: int = Field(default_factory=now_ms)
    source: Literal["exchange", "simulator"] = "exchange"

    @property
    def gross_notional_usd(self) -> Decimal:
        return sum((p.notional_usd for p in self.positions), Decimal("0"))

    @property
    def effective_leverage(self) -> Decimal:
        if self.equity_usd <= 0:
            return Decimal("999")
        return self.gross_notional_usd / self.equity_usd

    @property
    def unprotected_positions(self) -> tuple[Position, ...]:
        return tuple(p for p in self.positions if not p.is_protected)

    @property
    def margin_ratio(self) -> Decimal:
        """Part de l'equite immobilisee. 1.0 = plus rien de disponible."""
        if self.equity_usd <= 0:
            return Decimal("1")
        return self.used_margin_usd / self.equity_usd
