"""Limites dures du desk.

Ces valeurs sont du code et de la configuration, jamais une sortie de modele.
Aucun agent n'a de chemin pour les modifier a l'execution : le moteur de risque
lit cet objet, et l'objet est immuable.
"""

from __future__ import annotations

from decimal import Decimal

from pydantic import Field, model_validator

from ..contracts.common import Frozen


class RiskLimits(Frozen):
    """Plafonds appliques a chaque ordre, quoi que demande la couche cognitive.

    Les valeurs par defaut sont volontairement etroites : c'est un desk qui
    demarre, pas un desk qui a fait ses preuves. On elargit avec des donnees,
    jamais avec de l'enthousiasme.
    """

    # --- capital ---
    max_daily_loss_pct: Decimal = Field(default=Decimal("2"), gt=0, le=20)
    max_gross_notional_usd: Decimal = Field(default=Decimal("1000"), gt=0)
    max_effective_leverage: Decimal = Field(default=Decimal("3"), ge=1, le=20)
    max_concurrent_positions: int = Field(default=2, ge=1, le=20)
    max_position_notional_usd: Decimal = Field(default=Decimal("500"), gt=0)

    # --- risque par trade ---
    risk_per_trade_pct: Decimal = Field(default=Decimal("0.5"), gt=0, le=5)
    min_stop_distance_bps: Decimal = Field(default=Decimal("30"), gt=0)
    max_stop_distance_bps: Decimal = Field(default=Decimal("500"), gt=0)

    # --- portefeuille ---
    max_btc_beta_exposure_usd: Decimal = Field(default=Decimal("800"), gt=0)
    max_correlation_for_new_position: Decimal = Field(default=Decimal("0.8"), gt=0, le=1)

    # --- operationnel ---
    max_orders_per_minute: int = Field(default=20, ge=1, le=200)
    max_mandates_per_day: int = Field(default=8, ge=1, le=100)
    max_feed_age_ms: int = Field(default=15_000, ge=1_000)
    max_clock_drift_ms: int = Field(default=1_000, ge=50)
    max_margin_ratio: Decimal = Field(default=Decimal("0.5"), gt=0, le=1)
    max_price_divergence_bps: Decimal = Field(default=Decimal("50"), gt=0)

    @model_validator(mode="after")
    def _coherent(self) -> RiskLimits:
        if self.min_stop_distance_bps >= self.max_stop_distance_bps:
            raise ValueError("min_stop_distance_bps doit etre < max_stop_distance_bps")
        if self.max_position_notional_usd > self.max_gross_notional_usd:
            raise ValueError(
                "le notionnel max d'une position ne peut exceder le notionnel brut max"
            )
        return self

    def daily_loss_limit_usd(self, equity_usd: Decimal) -> Decimal:
        return equity_usd * self.max_daily_loss_pct / Decimal("100")

    def risk_budget_usd(self, equity_usd: Decimal) -> Decimal:
        return equity_usd * self.risk_per_trade_pct / Decimal("100")
