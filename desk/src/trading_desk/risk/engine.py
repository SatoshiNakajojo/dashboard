"""Moteur de risque : les douze invariants.

C'est le seul point de passage entre une intention et un ordre signe. Aucun
agent LLM n'a de reference vers ce module ; il ne peut donc ni l'appeler, ni
l'assouplir.

Trois regles gouvernent tout ce fichier :

1. **Un controle qui ne peut pas etre evalue est un controle en echec.**
   L'absence d'information n'est jamais interpretee favorablement. C'est ce qui
   fait la difference entre un desk prudent et un desk qui trade a l'aveugle
   apres une panne partielle.
2. **Aucune sortie de LLM n'entre ici.** Les seuls conseils acceptes sont des
   facteurs dans ]0, 1] appliques par multiplication : ils reduisent, jamais
   l'inverse.
3. **Le verdict est explicite.** On ne renvoie pas un booleen : on renvoie la
   liste des douze controles avec leur resultat, pour que l'interface de
   supervision puisse montrer *lequel* bloque.
"""

from __future__ import annotations

from decimal import Decimal
from enum import Enum

from pydantic import Field

from ..contracts.common import DeskMode, Frozen, HaltReason, Side, now_ms
from ..contracts.mandate import Mandate
from ..contracts.market import FeedHealth
from ..contracts.orders import AccountState, OrderIntent, OrderPurpose
from .limits import RiskLimits


class Invariant(str, Enum):
    """Les douze regles. L'ordre est stable : il sert d'identifiant d'audit."""

    I01_RECONCILED = "I01_RECONCILED"
    I02_STOPS_AT_EXCHANGE = "I02_STOPS_AT_EXCHANGE"
    I03_DAILY_LOSS = "I03_DAILY_LOSS"
    I04_NOTIONAL_LEVERAGE = "I04_NOTIONAL_LEVERAGE"
    I05_NO_LLM_WIDENING = "I05_NO_LLM_WIDENING"
    I06_MANDATE_ALIVE = "I06_MANDATE_ALIVE"
    I07_ORDER_RATE = "I07_ORDER_RATE"
    I08_DETERMINISTIC_CLOID = "I08_DETERMINISTIC_CLOID"
    I09_FRESH_DATA = "I09_FRESH_DATA"
    I10_KILL_SWITCH = "I10_KILL_SWITCH"
    I11_PROMPT_ISOLATION = "I11_PROMPT_ISOLATION"
    I12_SIGNER_ISOLATION = "I12_SIGNER_ISOLATION"


LABELS: dict[Invariant, str] = {
    Invariant.I01_RECONCILED: "État réconcilié avec l'exchange",
    Invariant.I02_STOPS_AT_EXCHANGE: "Stops actifs côté exchange",
    Invariant.I03_DAILY_LOSS: "Perte du jour sous la limite",
    Invariant.I04_NOTIONAL_LEVERAGE: "Notionnel et levier plafonnés",
    Invariant.I05_NO_LLM_WIDENING: "Aucun élargissement par un agent",
    Invariant.I06_MANDATE_ALIVE: "Mandat valide et non expiré",
    Invariant.I07_ORDER_RATE: "Débit d'ordres sous le plafond",
    Invariant.I08_DETERMINISTIC_CLOID: "Identifiant d'ordre déterministe",
    Invariant.I09_FRESH_DATA: "Flux de données frais",
    Invariant.I10_KILL_SWITCH: "Kill switch opérationnel",
    Invariant.I11_PROMPT_ISOLATION: "Isolation des contenus externes",
    Invariant.I12_SIGNER_ISOLATION: "Signer isolé, sans droit de retrait",
}


class Check(Frozen):
    invariant: Invariant
    passed: bool
    detail: str = ""

    @property
    def label(self) -> str:
        return LABELS[self.invariant]


class RiskContext(Frozen):
    """Tout ce que le moteur doit savoir pour trancher.

    Les champs `Optional` ne sont pas des commodites : ils modelisent
    l'ignorance. `None` signifie "je ne sais pas", ce qui vaut echec.
    """

    mode: DeskMode
    limits: RiskLimits
    now_ms: int = Field(default_factory=now_ms)

    # I01 / I02 / I03 / I04
    account: AccountState | None = None
    reconciled: bool = False
    reconciliation_age_ms: int | None = None
    day_realized_pnl_usd: Decimal | None = None

    # I06
    mandate: Mandate | None = None

    # I07
    orders_last_minute: int = 0
    mandates_today: int = 0

    # I09
    feeds: tuple[FeedHealth, ...] = ()
    clock_drift_ms: int | None = None
    price_divergence_bps: Decimal | None = None

    # I10 / I11 / I12 : preconditions structurelles, verifiees au demarrage
    # puis reevaluees a chaque cycle du watchdog.
    kill_switch_ready: bool = False
    prompt_isolation_enabled: bool = False
    signer_is_agent_wallet: bool = False
    signer_can_withdraw: bool = True

    # Trace : facteurs de reduction issus des agents, deja bornes a ]0, 1]
    advisory_size_factor: Decimal = Field(default=Decimal("1"), gt=0, le=1)

    def freshest_failure(self) -> FeedHealth | None:
        for f in self.feeds:
            if not f.evaluate(self.now_ms).status.is_tradable:
                return f
        return None


class RiskVerdict(Frozen):
    """Resultat d'une evaluation. Toujours complet, jamais un simple booleen."""

    approved: bool
    checks: tuple[Check, ...]
    approved_size: Decimal = Decimal("0")
    reason: str = ""
    halt_reason: HaltReason | None = None

    @property
    def blocking(self) -> tuple[Invariant, ...]:
        return tuple(c.invariant for c in self.checks if not c.passed)

    def check(self, inv: Invariant) -> Check | None:
        return next((c for c in self.checks if c.invariant is inv), None)


# --------------------------------------------------------------------------
#  Controles unitaires
# --------------------------------------------------------------------------
# Chacun est une fonction pure de RiskContext vers Check : testable isolement,
# rejouable sur un etat enregistre, et sans effet de bord.


def _i01(ctx: RiskContext) -> Check:
    if ctx.account is None:
        return Check(invariant=Invariant.I01_RECONCILED, passed=False,
                     detail="aucun état de compte connu")
    if not ctx.reconciled:
        return Check(invariant=Invariant.I01_RECONCILED, passed=False,
                     detail="réconciliation non convergée")
    age = ctx.reconciliation_age_ms
    if age is None:
        return Check(invariant=Invariant.I01_RECONCILED, passed=False,
                     detail="âge de réconciliation inconnu")
    if age > 60_000:
        return Check(invariant=Invariant.I01_RECONCILED, passed=False,
                     detail=f"réconciliation vieille de {age // 1000} s")
    return Check(invariant=Invariant.I01_RECONCILED, passed=True,
                 detail=f"réconcilié il y a {age // 1000} s")


def _i02(ctx: RiskContext) -> Check:
    if ctx.account is None:
        return Check(invariant=Invariant.I02_STOPS_AT_EXCHANGE, passed=False,
                     detail="positions inconnues")
    naked = ctx.account.unprotected_positions
    if naked:
        names = ", ".join(p.asset for p in naked)
        return Check(invariant=Invariant.I02_STOPS_AT_EXCHANGE, passed=False,
                     detail=f"position sans stop côté exchange : {names}")
    n = len(ctx.account.positions)
    return Check(invariant=Invariant.I02_STOPS_AT_EXCHANGE, passed=True,
                 detail=f"{n} position(s), toutes protégées" if n else "aucune position")


def _i03(ctx: RiskContext) -> Check:
    if ctx.account is None or ctx.day_realized_pnl_usd is None:
        return Check(invariant=Invariant.I03_DAILY_LOSS, passed=False,
                     detail="PnL du jour inconnu")
    limit = ctx.limits.daily_loss_limit_usd(ctx.account.equity_usd)
    loss = -ctx.day_realized_pnl_usd
    if loss >= limit:
        return Check(invariant=Invariant.I03_DAILY_LOSS, passed=False,
                     detail=f"perte {loss:.2f} USD ≥ limite {limit:.2f} USD")
    return Check(invariant=Invariant.I03_DAILY_LOSS, passed=True,
                 detail=f"PnL jour {ctx.day_realized_pnl_usd:.2f} USD, "
                        f"marge restante {limit - loss:.2f} USD")


def _i04(ctx: RiskContext) -> Check:
    if ctx.account is None:
        return Check(invariant=Invariant.I04_NOTIONAL_LEVERAGE, passed=False,
                     detail="exposition inconnue")
    a, lim = ctx.account, ctx.limits
    if a.gross_notional_usd > lim.max_gross_notional_usd:
        return Check(invariant=Invariant.I04_NOTIONAL_LEVERAGE, passed=False,
                     detail=f"notionnel {a.gross_notional_usd:.0f} > "
                            f"{lim.max_gross_notional_usd:.0f} USD")
    if a.effective_leverage > lim.max_effective_leverage:
        return Check(invariant=Invariant.I04_NOTIONAL_LEVERAGE, passed=False,
                     detail=f"levier effectif {a.effective_leverage:.2f}× > "
                            f"{lim.max_effective_leverage:.2f}×")
    if len(a.positions) >= lim.max_concurrent_positions:
        return Check(invariant=Invariant.I04_NOTIONAL_LEVERAGE, passed=False,
                     detail=f"{len(a.positions)} positions, plafond "
                            f"{lim.max_concurrent_positions}")
    if a.margin_ratio > lim.max_margin_ratio:
        return Check(invariant=Invariant.I04_NOTIONAL_LEVERAGE, passed=False,
                     detail=f"marge utilisée {a.margin_ratio:.0%} > "
                            f"{lim.max_margin_ratio:.0%}")
    return Check(invariant=Invariant.I04_NOTIONAL_LEVERAGE, passed=True,
                 detail=f"levier {a.effective_leverage:.2f}×, "
                        f"notionnel {a.gross_notional_usd:.0f} USD")


def _i05(ctx: RiskContext) -> Check:
    """Le facteur consultatif est borne par le schema (]0, 1]). Ce controle
    verifie la propriete a l'execution : une valeur > 1 signale une regression
    de code, pas une opinion d'agent."""
    f = ctx.advisory_size_factor
    if f <= 0 or f > 1:
        return Check(invariant=Invariant.I05_NO_LLM_WIDENING, passed=False,
                     detail=f"facteur consultatif hors bornes : {f}")
    return Check(invariant=Invariant.I05_NO_LLM_WIDENING, passed=True,
                 detail=f"facteur de réduction {f}")


def _i06(ctx: RiskContext, intent: OrderIntent | None) -> Check:
    m = ctx.mandate
    if m is None:
        return Check(invariant=Invariant.I06_MANDATE_ALIVE, passed=False,
                     detail="aucun mandat en vigueur")
    if m.is_expired(ctx.now_ms):
        return Check(invariant=Invariant.I06_MANDATE_ALIVE, passed=False,
                     detail="mandat expiré")
    if intent is not None:
        if intent.mandate_id != m.mandate_id:
            return Check(invariant=Invariant.I06_MANDATE_ALIVE, passed=False,
                         detail="l'ordre référence un autre mandat")
        if intent.purpose is OrderPurpose.ENTRY and not m.allows_entry(
            intent.asset, intent.side, ctx.now_ms
        ):
            return Check(invariant=Invariant.I06_MANDATE_ALIVE, passed=False,
                         detail=f"{intent.asset} {intent.side.value} hors mandat "
                                f"({m.bias.value}, univers {list(m.universe)})")
    return Check(invariant=Invariant.I06_MANDATE_ALIVE, passed=True,
                 detail=f"mandat {m.bias.value}, {m.remaining_ms(ctx.now_ms) // 1000} s restantes")


def _i07(ctx: RiskContext) -> Check:
    if ctx.orders_last_minute > ctx.limits.max_orders_per_minute:
        return Check(invariant=Invariant.I07_ORDER_RATE, passed=False,
                     detail=f"{ctx.orders_last_minute} ordres/min > "
                            f"{ctx.limits.max_orders_per_minute}")
    if ctx.mandates_today > ctx.limits.max_mandates_per_day:
        return Check(invariant=Invariant.I07_ORDER_RATE, passed=False,
                     detail=f"{ctx.mandates_today} mandats aujourd'hui > "
                            f"{ctx.limits.max_mandates_per_day}")
    return Check(invariant=Invariant.I07_ORDER_RATE, passed=True,
                 detail=f"{ctx.orders_last_minute} ordres/min, "
                        f"{ctx.mandates_today} mandats aujourd'hui")


def _i08(intent: OrderIntent | None, cloid: str | None) -> Check:
    from ..execution.cloid import is_valid_cloid, make_cloid

    if intent is None:
        return Check(invariant=Invariant.I08_DETERMINISTIC_CLOID, passed=True,
                     detail="pas d'ordre à valider")
    if not cloid:
        return Check(invariant=Invariant.I08_DETERMINISTIC_CLOID, passed=False,
                     detail="cloid absent")
    if not is_valid_cloid(cloid):
        return Check(invariant=Invariant.I08_DETERMINISTIC_CLOID, passed=False,
                     detail="cloid mal formé")
    if cloid != make_cloid(intent):
        return Check(invariant=Invariant.I08_DETERMINISTIC_CLOID, passed=False,
                     detail="cloid non déterministe pour cette intention")
    return Check(invariant=Invariant.I08_DETERMINISTIC_CLOID, passed=True,
                 detail=cloid[:14] + "...")


def _i09(ctx: RiskContext) -> Check:
    if not ctx.feeds:
        return Check(invariant=Invariant.I09_FRESH_DATA, passed=False,
                     detail="aucun flux déclaré")
    bad = ctx.freshest_failure()
    if bad is not None:
        age = bad.age_ms(ctx.now_ms)
        age_txt = f"{age} ms" if age is not None else "jamais reçu"
        return Check(invariant=Invariant.I09_FRESH_DATA, passed=False,
                     detail=f"flux '{bad.name}' {bad.evaluate(ctx.now_ms).status.value} ({age_txt})")
    if ctx.clock_drift_ms is None:
        return Check(invariant=Invariant.I09_FRESH_DATA, passed=False,
                     detail="dérive d'horloge inconnue")
    if abs(ctx.clock_drift_ms) > ctx.limits.max_clock_drift_ms:
        return Check(invariant=Invariant.I09_FRESH_DATA, passed=False,
                     detail=f"dérive d'horloge {ctx.clock_drift_ms} ms")
    if ctx.price_divergence_bps is not None and (
        ctx.price_divergence_bps > ctx.limits.max_price_divergence_bps
    ):
        return Check(invariant=Invariant.I09_FRESH_DATA, passed=False,
                     detail=f"divergence de prix {ctx.price_divergence_bps:.1f} bps")
    return Check(invariant=Invariant.I09_FRESH_DATA, passed=True,
                 detail=f"{len(ctx.feeds)} flux vivants, dérive {ctx.clock_drift_ms} ms")


def _i10(ctx: RiskContext) -> Check:
    return Check(invariant=Invariant.I10_KILL_SWITCH, passed=ctx.kill_switch_ready,
                 detail="armé" if ctx.kill_switch_ready else "non joignable")


def _i11(ctx: RiskContext) -> Check:
    return Check(invariant=Invariant.I11_PROMPT_ISOLATION,
                 passed=ctx.prompt_isolation_enabled,
                 detail="contenus externes encadrés et extraits vers un schéma"
                        if ctx.prompt_isolation_enabled else "isolation désactivée")


def _i12(ctx: RiskContext) -> Check:
    if not ctx.signer_is_agent_wallet:
        return Check(invariant=Invariant.I12_SIGNER_ISOLATION, passed=False,
                     detail="le signer n'utilise pas un agent wallet")
    if ctx.signer_can_withdraw:
        return Check(invariant=Invariant.I12_SIGNER_ISOLATION, passed=False,
                     detail="la clé en ligne dispose du droit de retrait")
    return Check(invariant=Invariant.I12_SIGNER_ISOLATION, passed=True,
                 detail="agent wallet, sans droit de retrait")


# --------------------------------------------------------------------------
#  Evaluation
# --------------------------------------------------------------------------

# Un echec sur ces invariants n'est pas un simple refus d'ordre : c'est un
# etat anormal du systeme, qui doit arreter le desk et non seulement le trade.
_HALT_ON: dict[Invariant, HaltReason] = {
    Invariant.I01_RECONCILED: HaltReason.RECONCILIATION_FAILED,
    Invariant.I02_STOPS_AT_EXCHANGE: HaltReason.UNPROTECTED_POSITION,
    Invariant.I03_DAILY_LOSS: HaltReason.DAILY_LOSS_LIMIT,
    Invariant.I07_ORDER_RATE: HaltReason.ORDER_RATE_EXCEEDED,
    Invariant.I09_FRESH_DATA: HaltReason.STALE_FEED,
}


def evaluate(
    ctx: RiskContext,
    intent: OrderIntent | None = None,
    cloid: str | None = None,
) -> RiskVerdict:
    """Evalue les douze invariants.

    Appelee sans `intent`, elle donne l'etat de sante du desk (c'est ce que
    l'interface de supervision affiche). Appelee avec une intention, elle
    autorise ou refuse cet ordre precis.
    """
    checks = (
        _i01(ctx), _i02(ctx), _i03(ctx), _i04(ctx), _i05(ctx),
        _i06(ctx, intent), _i07(ctx), _i08(intent, cloid), _i09(ctx),
        _i10(ctx), _i11(ctx), _i12(ctx),
    )
    failed = [c for c in checks if not c.passed]

    halt: HaltReason | None = None
    for c in failed:
        if c.invariant in _HALT_ON:
            halt = _HALT_ON[c.invariant]
            break

    if failed:
        return RiskVerdict(
            approved=False,
            checks=checks,
            approved_size=Decimal("0"),
            reason="; ".join(f"{c.invariant.value}: {c.detail}" for c in failed),
            halt_reason=halt,
        )

    if intent is None:
        return RiskVerdict(approved=True, checks=checks, reason="desk sain")

    if not ctx.mode.sends_orders:
        return RiskVerdict(
            approved=False, checks=checks, approved_size=Decimal("0"),
            reason=f"mode {ctx.mode.value} : aucun ordre réel n'est émis",
        )

    return RiskVerdict(
        approved=True, checks=checks, approved_size=intent.size,
        reason="tous les invariants satisfaits",
    )


def reduce_only_verdict(ctx: RiskContext) -> RiskVerdict:
    """Verdict special : les sorties restent permises meme desk arrete.

    Fermer une position est toujours autorise. Un systeme qui s'interdit de
    reduire son risque quand il va mal est un systeme dangereux.
    """
    checks = (_i08(None, None), _i10(ctx), _i12(ctx))
    failed = [c for c in checks if not c.passed]
    return RiskVerdict(
        approved=not failed,
        checks=checks,
        reason="sortie autorisée" if not failed
        else "; ".join(f"{c.invariant.value}: {c.detail}" for c in failed),
    )
