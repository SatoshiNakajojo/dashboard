from __future__ import annotations

import sys
from decimal import Decimal
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from trading_desk.agents.llm import API_KEY_VARS  # noqa: E402
from trading_desk.contracts import (  # noqa: E402
    AccountState, Bias, DeskMode, FeedHealth, FeedStatus, Mandate, Position,
    Side, now_ms,
)
from trading_desk.risk import RiskContext, RiskLimits  # noqa: E402

# Toutes les facons de s'authentifier, y compris celles que le SDK resout
# seul. `API_KEY_VARS` est importe plutot que recopie : le jour ou le desk
# accepte une variable de plus, l'isolation la couvre sans qu'on y pense.
CREDENTIALS = (*API_KEY_VARS, "ANTHROPIC_AUTH_TOKEN")


@pytest.fixture(autouse=True)
def _aucune_cle_reelle(monkeypatch, tmp_path):
    """Aucun test ne doit pouvoir appeler l'API pour de vrai.

    Sans cette isolation, un test qui verifie le comportement « sans cle »
    passe sur une machine nue et, sur une machine ou la cle du projet est
    posee, part faire trente cycles factures a la place. Ce n'est pas
    theorique : c'est arrive, et le seul symptome etait une suite lente.

    Un test qui a besoin d'une cle la pose lui-meme avec `monkeypatch.setenv` —
    il s'execute apres cette fixture, donc il gagne.
    """
    for var in CREDENTIALS:
        monkeypatch.delenv(var, raising=False)
    # Le SDK sait aussi resoudre un profil `ant auth login` sur le disque.
    monkeypatch.setattr("pathlib.Path.home", lambda: tmp_path)


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
