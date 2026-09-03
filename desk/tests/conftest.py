from __future__ import annotations

import sys
from decimal import Decimal
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from trading_desk.contracts import (  # noqa: E402
    AccountState, Bias, DeskMode, FeedHealth, FeedStatus, Mandate, Position,
    Side, now_ms,
)
from trading_desk.risk import RiskContext, RiskLimits  # noqa: E402


@pytest.fixture
def limits() -> RiskLimits:
    return RiskLimits()


@pytest.fixture
def account() -> AccountState:
    return AccountState(
        equity_usd=Decimal("1000"),
        available_margin_usd=Decimal("900"),
        used_margin_usd=Decimal("100"),
        positions=(),
    )


@pytest.fixture
def live_mandate() -> Mandate:
    return Mandate(
        bias=Bias.LONG,
        universe=("BTC",),
        max_notional_usd=Decimal("500"),
        max_leverage=Decimal("2"),
        max_concurrent_positions=1,
        journal_ref="jr_test",
    )


@pytest.fixture
def healthy_feeds() -> tuple[FeedHealth, ...]:
    t = now_ms()
    return (
        FeedHealth(name="trades:BTC", status=FeedStatus.LIVE, last_message_ms=t,
                   max_age_ms=20_000, messages=10),
        FeedHealth(name="book:BTC", status=FeedStatus.LIVE, last_message_ms=t,
                   max_age_ms=10_000, messages=10),
    )


@pytest.fixture
def healthy_ctx(limits, account, live_mandate, healthy_feeds) -> RiskContext:
    """Contexte ou les douze invariants passent. Les tests le degradent
    ensuite champ par champ : c'est ce qui rend chaque echec attribuable."""
    return RiskContext(
        mode=DeskMode.TESTNET,
        limits=limits,
        account=account,
        reconciled=True,
        reconciliation_age_ms=1_000,
        day_realized_pnl_usd=Decimal("0"),
        mandate=live_mandate,
        orders_last_minute=0,
        mandates_today=1,
        feeds=healthy_feeds,
        clock_drift_ms=5,
        price_divergence_bps=Decimal("2"),
        kill_switch_ready=True,
        prompt_isolation_enabled=True,
        signer_is_agent_wallet=True,
        signer_can_withdraw=False,
    )


@pytest.fixture
def open_position() -> Position:
    return Position(
        asset="BTC", side=Side.LONG, size=Decimal("0.01"),
        entry_price=Decimal("60000"), mark_price=Decimal("60500"),
        leverage=Decimal("2"), protective_stop_cloid="0x" + "a" * 32,
    )
