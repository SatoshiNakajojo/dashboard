"""Metriques et rapport de backtest.

Le rapport montre systematiquement le **brut et le net cote a cote**. C'est
volontaire : l'ecart entre les deux est la question la plus utile d'un
backtest de perpetuels, et la plus facile a ne pas regarder.

Aucune metrique n'est annualisee sans le dire, et le nombre de trades est
toujours affiche : un Sharpe calcule sur onze trades ne veut rien dire, et il
faut que ca se voie.

**Et surtout : aucun PnL n'est affiche sans son intervalle de confiance.**
Un backtest qui annonce « +11,76 $ » sur 129 trades laisse croire a un
resultat ; le meme resultat annonce « +11,76 $, IC 95 % [-82 ; +105] »
s'interprete correctement du premier coup d'oeil. L'ecart entre les deux
lectures est exactement l'erreur qui fait deployer du capital sur du bruit,
et elle ne se corrige pas par la prudence : elle se corrige en refusant
d'afficher le premier chiffre sans le second.
"""

from __future__ import annotations

import math
import random
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

    # Le PnL est-il distinguable de zero ? Sur la distribution des resultats
    # par trade, pas sur la courbe d'equity — deux points consecutifs d'une
    # courbe sont correles, les trades le sont beaucoup moins.
    t_stat: float | None = None
    p_value: float | None = None
    ci95_low_usd: float | None = None
    ci95_high_usd: float | None = None
    p_loss: float | None = None          # P(PnL total <= 0) par bootstrap
    trades_for_t2: int | None = None     # taille d'echantillon requise

    @property
    def has_enough_trades(self) -> bool:
        """Seuil grossier et volontairement severe.

        En dessous, les metriques de ratio sont du bruit. Necessaire, jamais
        suffisant : 129 trades suffisent a calculer un Sharpe et ne suffisent
        pas a prouver un edge.
        """
        return self.trades >= 30

    # Conserve : `is_significant` disait « assez de trades », ce qui se lit
    # « resultat significatif » — precisement le contresens que ce module
    # cherche a rendre impossible.
    is_significant = has_enough_trades

    @property
    def edge_verdict(self) -> str:
        """Ce qu'on a le droit de conclure. Trois etats, jamais un booleen.

        `INDECIS` est la reponse honnete par defaut et de loin la plus
        frequente : elle dit « ce backtest ne tranche pas », ce qui n'est ni
        un echec ni une validation.
        """
        if self.trades < 30 or self.t_stat is None:
            return "ECHANTILLON"
        if self.t_stat >= 2.0:
            return "PROBABLE"
        if self.t_stat <= -2.0:
            return "PERDANT"
        return "INDECIS"


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
    sig = _significance([float(t.net_pnl_usd) for t in result.trades])

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
        **sig,
    )


def _significance(pnls: list[float], *, draws: int = 10_000,
                  seed: int = 20260904) -> dict:
    """Le PnL observe est-il distinguable de zero ?

    Deux lectures complementaires, parce qu'elles echouent differemment :

    - le **t de Student** sur le PnL par trade, qui suppose une distribution
      a peu pres reguliere — hypothese fausse en trading, ou quelques trades
      portent tout le resultat ;
    - un **bootstrap** par reechantillonnage, qui ne suppose rien de la forme
      de la distribution et donne directement P(PnL total <= 0).

    Quand les deux divergent, c'est le bootstrap qui a raison.

    Le tirage est seede : deux executions du meme backtest doivent produire
    le meme rapport, intervalle de confiance compris. Un chiffre qui bouge
    d'un run a l'autre est un chiffre qu'on cesse de lire.
    """
    n = len(pnls)
    if n < 30:
        return {}

    mean = sum(pnls) / n
    var = sum((x - mean) ** 2 for x in pnls) / (n - 1)
    sd = math.sqrt(var)
    if sd == 0:
        return {}

    t = mean / (sd / math.sqrt(n))
    p = 2 * (1 - 0.5 * (1 + math.erf(abs(t) / math.sqrt(2))))

    rng = random.Random(seed)
    totals = sorted(sum(rng.choices(pnls, k=n)) for _ in range(draws))
    lo = totals[int(0.025 * draws)]
    hi = totals[min(draws - 1, int(0.975 * draws))]
    p_loss = sum(1 for x in totals if x <= 0) / draws

    # Combien de trades il faudrait pour atteindre t = 2 a effet constant.
    # Souvent le chiffre le plus parlant du rapport : quand il annonce des
    # decennies au rythme observe, la strategie n'est pas « a affiner ».
    needed = int((2 * sd / mean) ** 2) if mean != 0 else None

    return {"t_stat": round(t, 2), "p_value": round(p, 3),
            "ci95_low_usd": round(lo, 2), "ci95_high_usd": round(hi, 2),
            "p_loss": round(p_loss, 3), "trades_for_t2": needed}


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
    """Tableau comparatif en texte. C'est le livrable de la porte P2.

    Le verdict est une colonne, pas une note de bas de page : il doit etre
    lu en meme temps que le PnL, sinon il est lu apres avoir conclu.
    """
    if not metrics:
        return "aucun resultat"

    head = metrics[0]
    W = 100
    lines = [
        "",
        f"  BASELINES — {head.asset} {head.interval} · {head.bars} barres "
        f"· {head.days:.0f} jours",
        "  " + "─" * W,
        f"  {'strategie':<16}{'net':>10}{'net %':>9}{'brut':>10}"
        f"{'couts':>9}{'Sharpe':>9}{'DD max':>9}{'trades':>8}"
        f"{'expo':>7}{'t':>7}{'verdict':>12}",
        "  " + "─" * W,
    ]
    for m in sorted(metrics, key=lambda x: x.net_pnl_usd, reverse=True):
        lines.append(
            f"  {m.strategy:<16}"
            f"{float(m.net_pnl_usd):>+10.2f}"
            f"{m.net_return_pct:>+9.2f}"
            f"{float(m.gross_pnl_usd):>+10.2f}"
            f"{float(m.fees_usd + m.funding_usd):>9.2f}"
            f"{(m.sharpe if m.sharpe is not None else float('nan')):>9.2f}"
            f"{m.max_drawdown_pct:>9.2f}"
            f"{m.trades:>8}"
            f"{m.exposure_pct:>6.0f}%"
            f"{(m.t_stat if m.t_stat is not None else float('nan')):>7.2f}"
            f"{m.edge_verdict:>12}"
        )
    lines += ["  " + "─" * W, ""]

    # Le detail statistique, strategie par strategie. C'est cette section, et
    # pas la ligne de PnL, qui dit ce qu'on a le droit de conclure.
    for m in sorted(metrics, key=lambda x: x.net_pnl_usd, reverse=True):
        if m.ci95_low_usd is None:
            lines.append(
                f"  {m.strategy:<16} {m.trades} trades : trop peu pour "
                "conclure quoi que ce soit.")
            continue
        lines.append(
            f"  {m.strategy:<16} PnL {float(m.net_pnl_usd):+.2f} $  ·  "
            f"IC 95 % [{m.ci95_low_usd:+.2f} ; {m.ci95_high_usd:+.2f}]  ·  "
            f"p = {m.p_value:.2f}  ·  P(perte) = {(m.p_loss or 0) * 100:.0f} %")
        if m.edge_verdict == "INDECIS" and m.trades_for_t2 and m.trades_for_t2 > 0:
            annees = m.trades_for_t2 / (m.trades / max(m.days, 1) * 365)
            lines.append(
                f"  {'':<16} a cet effet, il faudrait ~{m.trades_for_t2} trades "
                f"pour trancher — soit ~{annees:.0f} ans au rythme observe.")

    lines += [
        "",
        "  LECTURE",
        "  Un PnL positif dont l'intervalle de confiance contient zero n'est",
        "  pas un edge : c'est un tirage. `INDECIS` signifie que ce backtest ne",
        "  tranche pas — ni dans un sens, ni dans l'autre.",
        "",
        "  Ces chiffres sont la REFERENCE que le desk multi-agents devra battre",
        "  au P5, net de tous les couts — y compris le cout des appels LLM.",
        "",
    ]
    return "\n".join(lines)
