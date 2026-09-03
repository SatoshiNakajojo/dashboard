"""Metriques et rapport de backtest.

Le rapport montre systematiquement le **brut et le net cote a cote**. C'est
volontaire : l'ecart entre les deux est la question la plus utile d'un
backtest de perpetuels, et la plus facile a ne pas regarder.

Aucune metrique n'est annualisee sans le dire, et le nombre de trades est
toujours affiche : un Sharpe calcule sur onze trades ne veut rien dire, et il
faut que ca se voie.
"""

from __future__ import annotations

import math
from decimal import Decimal

from ..contracts.common import Frozen
from ..features.bars import INTERVAL_MS
from .engine import BacktestResult

BARS_PER_YEAR: dict[str, float] = {
    "1m": 525_600, "5m": 105_120, "15m": 35_040,
    "1h": 8_760, "4h": 2_190, "1d": 365,
}


class Metrics(Frozen):
    strategy: str
    asset: str
    interval: str
    bars: int
    days: float

    net_pnl_usd: Decimal
    net_return_pct: float
    gross_pnl_usd: Decimal
    fees_usd: Decimal
    funding_usd: Decimal
    cost_drag_pct: float

    sharpe: float | None
    max_drawdown_pct: float
    calmar: float | None

    trades: int
    win_rate_pct: float | None
    avg_win_usd: Decimal | None
    avg_loss_usd: Decimal | None
    profit_factor: float | None
    exposure_pct: float
    rejected_by_risk: int

    @property
    def is_significant(self) -> bool:
        """Seuil grossier et volontairement severe.

        En dessous, les metriques de ratio sont du bruit. Le desk multi-agents
        devra battre ces baselines sur des echantillons qui passent ce seuil,
        pas sur trois trades chanceux.
        """
        return self.trades >= 30


def compute_metrics(result: BacktestResult) -> Metrics:
    curve = [float(v) for v in result.equity_curve]
    initial = float(result.initial_equity_usd)
    days = (result.end_ts_ms - result.start_ts_ms) / 86_400_000

    rets: list[float] = []
    for i in range(1, len(curve)):
        if curve[i - 1] > 0:
            rets.append(curve[i] / curve[i - 1] - 1.0)

    sharpe = _sharpe(rets, result.interval)
    mdd = _max_drawdown_pct(curve)
    net_return = (curve[-1] / initial - 1.0) * 100 if initial > 0 and curve else 0.0

    wins = [t for t in result.trades if t.net_pnl_usd > 0]
    losses = [t for t in result.trades if t.net_pnl_usd < 0]
    gain = sum((t.net_pnl_usd for t in wins), Decimal("0"))
    loss = -sum((t.net_pnl_usd for t in losses), Decimal("0"))

    held_ms = sum(t.exit_ts_ms - t.entry_ts_ms for t in result.trades)
    span_ms = max(1, result.end_ts_ms - result.start_ts_ms)

    total_costs = float(result.total_fees_usd + result.total_funding_usd)
    gross = float(result.gross_pnl_usd)

    return Metrics(
        strategy=result.strategy,
        asset=result.asset,
        interval=result.interval,
        bars=result.bars,
        days=round(days, 1),
        net_pnl_usd=result.net_pnl_usd,
        net_return_pct=round(net_return, 2),
        gross_pnl_usd=result.gross_pnl_usd,
        fees_usd=result.total_fees_usd,
        funding_usd=result.total_funding_usd,
        # Part du brut mangee par les couts. Au-dela de 100 %, une strategie
        # gagnante avant frais est perdante apres — le cas le plus frequent.
        cost_drag_pct=round(100 * total_costs / abs(gross), 1) if gross else 0.0,
        sharpe=sharpe,
        max_drawdown_pct=round(mdd, 2),
        calmar=round(net_return / mdd, 2) if mdd > 0.01 else None,
        trades=len(result.trades),
        win_rate_pct=round(100 * len(wins) / len(result.trades), 1)
        if result.trades else None,
        avg_win_usd=(gain / len(wins)).quantize(Decimal("0.01")) if wins else None,
        avg_loss_usd=(-loss / len(losses)).quantize(Decimal("0.01")) if losses else None,
        profit_factor=round(float(gain / loss), 2) if loss > 0 else None,
        exposure_pct=round(100 * held_ms / span_ms, 1),
        rejected_by_risk=result.rejected_by_risk,
    )


def _sharpe(rets: list[float], interval: str) -> float | None:
    if len(rets) < 30:
        return None
    mean = sum(rets) / len(rets)
    var = sum((r - mean) ** 2 for r in rets) / (len(rets) - 1)
    sd = math.sqrt(var)
    if sd == 0:
        return None
    # Taux sans risque suppose nul : sur un horizon de quelques mois en crypto,
    # l'affiner ne change pas la conclusion.
    return round(mean / sd * math.sqrt(BARS_PER_YEAR.get(interval, 8_760)), 2)


def _max_drawdown_pct(curve: list[float]) -> float:
    peak, worst = float("-inf"), 0.0
    for v in curve:
        peak = max(peak, v)
        if peak > 0:
            worst = max(worst, (peak - v) / peak * 100)
    return worst


def format_report(metrics: list[Metrics]) -> str:
    """Tableau comparatif en texte. C'est le livrable de la porte P2."""
    if not metrics:
        return "aucun resultat"

    head = metrics[0]
    lines = [
        "",
        f"  BASELINES — {head.asset} {head.interval} · {head.bars} barres "
        f"· {head.days:.0f} jours",
        "  " + "─" * 92,
        f"  {'strategie':<16}{'net':>10}{'net %':>9}{'brut':>10}"
        f"{'couts':>9}{'Sharpe':>9}{'DD max':>9}{'trades':>8}{'gagn.':>8}{'expo':>7}",
        "  " + "─" * 92,
    ]
    for m in sorted(metrics, key=lambda x: x.net_pnl_usd, reverse=True):
        flag = "" if m.is_significant else " *"
        lines.append(
            f"  {m.strategy:<16}"
            f"{float(m.net_pnl_usd):>+10.2f}"
            f"{m.net_return_pct:>+9.2f}"
            f"{float(m.gross_pnl_usd):>+10.2f}"
            f"{float(m.fees_usd + m.funding_usd):>9.2f}"
            f"{(m.sharpe if m.sharpe is not None else float('nan')):>9.2f}"
            f"{m.max_drawdown_pct:>9.2f}"
            f"{m.trades:>8}"
            f"{(m.win_rate_pct or 0):>7.0f}%"
            f"{m.exposure_pct:>6.0f}%"
            f"{flag}"
        )
    lines += [
        "  " + "─" * 92,
        "  * echantillon trop faible (< 30 trades) : les ratios ne sont pas "
        "interpretables.",
        "",
        "  Ces chiffres sont la REFERENCE que le desk multi-agents devra battre",
        "  au P5, net de tous les couts — y compris le cout des appels LLM.",
        "",
    ]
    return "\n".join(lines)
