"""Dimensionnement des positions.

Le principe : la taille se deduit du risque accepte et de la distance de stop,
jamais de la conviction. Un agent tres convaincu ne fait pas grossir la
position ; il fait, au mieux, qu'on la prenne.

Chaque plafond est applique par `min()`. La liste des contraintes actives est
renvoyee pour que l'interface puisse dire *pourquoi* la taille est ce qu'elle
est — question qu'on se pose systematiquement quand on regarde un ordre.
"""

from __future__ import annotations

from decimal import ROUND_DOWN, Decimal

from ..contracts.common import Frozen, Side
from ..contracts.mandate import Mandate
from ..contracts.orders import AccountState
from .limits import RiskLimits


class SizingResult(Frozen):
    size: Decimal
    notional_usd: Decimal
    risk_usd: Decimal
    binding_constraint: str
    constraints: tuple[str, ...]

    @property
    def is_tradable(self) -> bool:
        return self.size > 0


def size_position(
    *,
    account: AccountState,
    mandate: Mandate,
    limits: RiskLimits,
    asset: str,
    side: Side,
    entry_price: Decimal,
    stop_price: Decimal,
    advisory_factor: Decimal = Decimal("1"),
    size_decimals: int = 4,
) -> SizingResult:
    """Calcule la taille autorisee, en unites de l'actif.

    `advisory_factor` est le seul canal d'influence des agents, et il est
    strictement reducteur : la valeur est ecretee a 1 avant usage, de sorte
    qu'une regression amont ne puisse pas elargir la position.
    """
    factor = min(max(advisory_factor, Decimal("0")), Decimal("1"))
    distance = abs(entry_price - stop_price)
    if distance <= 0 or entry_price <= 0:
        return SizingResult(
            size=Decimal("0"), notional_usd=Decimal("0"), risk_usd=Decimal("0"),
            binding_constraint="stop invalide", constraints=("stop invalide",),
        )

    distance_bps = distance / entry_price * Decimal("10000")
    constraints: list[str] = []

    if not limits.min_stop_distance_bps <= distance_bps <= limits.max_stop_distance_bps:
        return SizingResult(
            size=Decimal("0"), notional_usd=Decimal("0"), risk_usd=Decimal("0"),
            binding_constraint=f"stop a {distance_bps:.0f} bps hors bornes "
                               f"[{limits.min_stop_distance_bps:.0f}, "
                               f"{limits.max_stop_distance_bps:.0f}]",
            constraints=("distance de stop",),
        )
    if not mandate.stop_band.contains(distance_bps):
        return SizingResult(
            size=Decimal("0"), notional_usd=Decimal("0"), risk_usd=Decimal("0"),
            binding_constraint=f"stop a {distance_bps:.0f} bps hors fourchette du mandat",
            constraints=("fourchette de stop du mandat",),
        )
    if not mandate.allows_entry(asset, side):
        return SizingResult(
            size=Decimal("0"), notional_usd=Decimal("0"), risk_usd=Decimal("0"),
            binding_constraint="entree non autorisee par le mandat",
            constraints=("mandat",),
        )

    # 1. Point de depart : budget de risque / distance au stop.
    risk_budget = limits.risk_budget_usd(account.equity_usd) * factor
    size = risk_budget / distance
    binding = "budget de risque"
    constraints.append("budget de risque")

    def cap(max_notional: Decimal, label: str) -> None:
        nonlocal size, binding
        if max_notional <= 0:
            size, binding = Decimal("0"), label
            constraints.append(label)
            return
        capped = max_notional / entry_price
        constraints.append(label)
        if capped < size:
            size, binding = capped, label

    # 2. Plafonds de notionnel, du plus specifique au plus global.
    cap(limits.max_position_notional_usd, "notionnel max par position")
    cap(mandate.max_notional_usd * factor, "notionnel du mandat")
    cap(
        max(limits.max_gross_notional_usd - account.gross_notional_usd, Decimal("0")),
        "notionnel brut restant",
    )
    cap(
        max(
            limits.max_effective_leverage * account.equity_usd - account.gross_notional_usd,
            Decimal("0"),
        ),
        "levier effectif restant",
    )
    # 3. Marge reellement disponible, avec une reserve de 20 % pour absorber
    #    les variations de mark price avant l'appel de marge.
    cap(
        account.available_margin_usd * mandate.max_leverage * Decimal("0.8"),
        "marge disponible",
    )

    quantum = Decimal(1).scaleb(-size_decimals)
    size = size.quantize(quantum, rounding=ROUND_DOWN)
    if size <= 0:
        return SizingResult(
            size=Decimal("0"), notional_usd=Decimal("0"), risk_usd=Decimal("0"),
            binding_constraint=binding, constraints=tuple(constraints),
        )

    return SizingResult(
        size=size,
        notional_usd=size * entry_price,
        risk_usd=size * distance,
        binding_constraint=binding,
        constraints=tuple(constraints),
    )
