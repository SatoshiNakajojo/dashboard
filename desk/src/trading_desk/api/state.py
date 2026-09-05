"""Etat partage du desk, tel que l'interface de supervision le voit.

Un seul objet detient la verite courante du processus. Il ne calcule rien de
metier : il agrege ce que les couches produisent et le rend serialisable.

Le kill switch vit ici. Il est deliberement trivial — un drapeau et un motif —
parce qu'un mecanisme d'arret ne doit jamais dependre de la partie du systeme
qui, precisement, vient de mal se comporter.
"""

from __future__ import annotations

import threading
from decimal import Decimal
from typing import Any

from ..config import Settings
from ..contracts.common import DeskMode, HaltReason, now_ms
from ..contracts.mandate import Mandate
from ..contracts.market import FeedHealth
from ..contracts.orders import AccountState
from ..market.budget import RequestBudget
from ..risk import LABELS, RiskContext, RiskVerdict, evaluate
from ..storage import SqliteStore


class DeskState:
    """Agregateur d'etat, sur pour les threads."""

    def __init__(self, settings: Settings, store: SqliteStore) -> None:
        self._lock = threading.RLock()
        self.settings = settings
        self.store = store
        self.limits = settings.risk_limits()
        self.budget = RequestBudget()

        self.started_at_ms = now_ms()
        self.halted = False
        self.halt_reason: HaltReason | None = None
        self.halt_detail = ""

        self.mandate: Mandate = Mandate.flat(journal_ref="boot")
        self.account: AccountState | None = None
        self.reconciled = False
        self.reconciled_at_ms: int | None = None
        self.day_realized_pnl_usd: Decimal | None = None

        self.feeds: tuple[FeedHealth, ...] = ()
        self.clock_drift_ms: int | None = 0
        self.price_divergence_bps: Decimal | None = None
        self.ws_connected = False

        self.orders_last_minute = 0
        self.mandates_today = 0
        self.last_prices: dict[str, str] = {}

    # ------------------------------------------------------------ kill switch

    def halt(self, reason: HaltReason, detail: str = "") -> None:
        """Arret du desk. Idempotent : le premier motif est celui qui compte,
        car c'est lui qui explique la cascade."""
        with self._lock:
            if self.halted:
                return
            self.halted = True
            self.halt_reason = reason
            self.halt_detail = detail
            self.mandate = Mandate.flat(journal_ref="halt")
        self.store.write_halt(reason.value, detail)

    def arm(self) -> None:
        """Rearmement manuel. Volontairement sans condition automatique : un
        desk qui se remet en route tout seul apres une perte est un desk qui
        recommence la meme erreur."""
        with self._lock:
            self.halted = False
            self.halt_reason = None
            self.halt_detail = ""

    # --------------------------------------------------------------- mise a jour

    def set_feeds(self, feeds: tuple[FeedHealth, ...], connected: bool) -> None:
        with self._lock:
            self.feeds = feeds
            self.ws_connected = connected

    def set_account(self, account: AccountState, *, reconciled: bool = True) -> None:
        with self._lock:
            self.account = account
            self.reconciled = reconciled
            self.reconciled_at_ms = now_ms()

    def set_mandate(self, mandate: Mandate) -> None:
        with self._lock:
            self.mandate = mandate
            self.mandates_today += 1
        self.store.write_mandate(mandate.mandate_id, mandate.model_dump(mode="json"))

    # ------------------------------------------------------------------ risque

    def risk_context(self) -> RiskContext:
        with self._lock:
            age = (
                now_ms() - self.reconciled_at_ms
                if self.reconciled_at_ms is not None else None
            )
            return RiskContext(
                mode=self.settings.mode,
                limits=self.limits,
                account=self.account,
                reconciled=self.reconciled and not self.halted,
                reconciliation_age_ms=age,
                day_realized_pnl_usd=self.day_realized_pnl_usd,
                mandate=self.mandate,
                orders_last_minute=self.orders_last_minute,
                mandates_today=self.mandates_today,
                feeds=self.feeds,
                clock_drift_ms=self.clock_drift_ms,
                price_divergence_bps=self.price_divergence_bps,
                kill_switch_ready=True,  # ce processus expose /api/halt
                prompt_isolation_enabled=self.settings.prompt_isolation_enabled,
                signer_is_agent_wallet=bool(self.settings.agent_wallet_address)
                and self.settings.agent_wallet_address
                != self.settings.master_wallet_address,
                signer_can_withdraw=self.settings.signer_can_withdraw,
            )

    def verdict(self) -> RiskVerdict:
        return evaluate(self.risk_context())

    # -------------------------------------------------------------- snapshot

    def snapshot(self) -> dict[str, Any]:
        """Vue complete pour l'interface. Un seul appel, tout l'ecran."""
        v = self.verdict()
        with self._lock:
            m, acc = self.mandate, self.account
            budget = self.budget.snapshot()
            return {
                "ts_ms": now_ms(),
                "uptime_s": (now_ms() - self.started_at_ms) // 1000,
                "mode": self.settings.mode.value,
                "is_real_money": self.settings.mode.is_real_money,
                "testnet": self.settings.testnet,
                "halted": self.halted,
                "halt_reason": self.halt_reason.value if self.halt_reason else None,
                "halt_detail": self.halt_detail,
                "ws_connected": self.ws_connected,
                "healthy": v.approved and not self.halted,
                "mandate": {
                    "id": m.mandate_id,
                    "bias": m.bias.value,
                    "regime": m.regime.value,
                    "conviction": str(m.conviction),
                    "universe": list(m.universe),
                    "max_notional_usd": str(m.max_notional_usd),
                    "max_leverage": str(m.max_leverage),
                    "max_positions": m.max_concurrent_positions,
                    "remaining_ms": m.remaining_ms(),
                    "ttl_ms": m.ttl_ms,
                    "expired": m.is_expired(),
                    "journal_ref": m.journal_ref,
                },
                "account": None if acc is None else {
                    "equity_usd": str(acc.equity_usd),
                    "available_margin_usd": str(acc.available_margin_usd),
                    "gross_notional_usd": str(acc.gross_notional_usd),
                    "effective_leverage": f"{acc.effective_leverage:.2f}",
                    "margin_ratio": f"{acc.margin_ratio:.3f}",
                    "day_pnl_usd": str(self.day_realized_pnl_usd)
                    if self.day_realized_pnl_usd is not None else None,
                    "positions": [
                        {
                            "asset": p.asset,
                            "side": p.side.value,
                            "size": str(p.size),
                            "entry_price": str(p.entry_price),
                            "mark_price": str(p.mark_price),
                            "notional_usd": f"{p.notional_usd:.2f}",
                            "unrealized_pnl_usd": str(p.unrealized_pnl_usd),
                            "leverage": str(p.leverage),
                            "protected": p.is_protected,
                            "liquidation_price": str(p.liquidation_price)
                            if p.liquidation_price else None,
                        }
                        for p in acc.positions
                    ],
                },
                "checks": [
                    {
                        "id": c.invariant.value,
                        "label": LABELS[c.invariant],
                        "passed": c.passed,
                        "detail": c.detail,
                    }
                    for c in v.checks
                ],
                "blocking": [i.value for i in v.blocking],
                "feeds": [
                    {
                        "name": f.name,
                        "status": f.status.value,
                        "age_ms": f.age_ms(),
                        "max_age_ms": f.max_age_ms,
                        "messages": f.messages,
                        "reconnects": f.reconnects,
                        "last_error": f.last_error,
                    }
                    for f in self.feeds
                ],
                "budget": {
                    "ip_pct": round(budget.ip_pct, 1),
                    "ip_used": budget.ip_weight_used,
                    "ip_limit": budget.ip_weight_limit,
                    "reserve_left": budget.address_reserve_left,
                    "reserve_pct": round(budget.reserve_pct, 1),
                    "critical": budget.is_critical,
                },
                "limits": {
                    "max_daily_loss_pct": str(self.limits.max_daily_loss_pct),
                    "max_gross_notional_usd": str(self.limits.max_gross_notional_usd),
                    "max_effective_leverage": str(self.limits.max_effective_leverage),
                    "max_mandates_per_day": self.limits.max_mandates_per_day,
                    "mandates_today": self.mandates_today,
                },
                "last_prices": dict(self.last_prices),
                "storage": self.store.counts(),
            }


def demo_account(equity: Decimal = Decimal("1000")) -> AccountState:
    """Compte fictif, clairement etiquete, pour que l'interface s'ouvre sur un
    ecran utile plutot que sur des tirets. Jamais utilise en mode LIVE."""
    return AccountState(
        equity_usd=equity,
        available_margin_usd=equity * Decimal("0.82"),
        used_margin_usd=equity * Decimal("0.18"),
        positions=(),
        source="simulator",
    )
