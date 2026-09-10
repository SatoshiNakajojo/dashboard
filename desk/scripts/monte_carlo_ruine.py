#!/usr/bin/env python3
"""Distribution du pire drawdown, par permutation des trades reels.

Deux documents convergent sur ce test et aucun des deux n'etait satisfait :

- `indicateurs-strategies-validation-robustesse.md` en fait un critere de
  REJET : « Monte-Carlo Drawdown — probabilite de Drawdown > 30 % : rejet si
  > 5 % sur 10 000 iterations ».
- `structure-equipe-trading.md` en fait le KPI du Risk Manager : « reduction
  de la probabilite de ruine globale a moins de 0,01 % ».

**La formule de ruine du manuel de risque ne peut pas y repondre.**
`P = ((1-Edge)/(1+Edge))^C` avec `Edge = p*R - (1-p)` est derivee pour des
paris a cote egale, ou l'avantage reste dans [-1, 1]. Des que le ratio
gain/perte est grand — `turtle_breakout` a R = 8,9 — l'Edge depasse 1, la base
devient negative, et l'elever a une puissance n'a plus de sens. Le tableau
d'asymetrie des pertes du meme document reste juste ; c'est sa generalisation
du risque de ruine qui ne l'est pas.

On permute donc les rendements observes. Cela detruit leur ordre chronologique
et repond a la question que la courbe historique ne pose pas : que se
passerait-il si la serie noire tombait d'un bloc ?

    python scripts/monte_carlo_ruine.py --risque 0.5
"""

from __future__ import annotations

import argparse
import random
import sys
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from robustness_grid import parametres

from trading_desk.backtest.data import DataUnavailable, load_from_file
from trading_desk.backtest.engine import run_backtest
from trading_desk.backtest.strategies import BASELINES
from trading_desk.risk import RiskLimits

ASSETS = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "AVAX"]


def multiples_de_r(nom: str, interval: str, limits: RiskLimits,
                   capital: float = 1000.0) -> list[float]:
    """Chaque trade exprime en multiples du risque engage (« R »).

    C'est la seule unite qui permette de rejouer la serie a une autre taille
    de position : un trade qui perd 1 R perd la fraction risquee, quelle
    qu'elle soit.

    `size_position` dimensionne precisement pour que la distance au stop
    represente `risk_per_trade_pct` du capital. Le budget de risque par trade
    vaut donc `capital * risk_per_trade_pct / 100`, et le multiple de R est le
    PnL net rapporte a ce budget. Les pertes stoppees doivent se grouper vers
    -1 : c'est la verification que cette equivalence tient.
    """
    budget = capital * float(limits.risk_per_trade_pct) / 100.0
    out: list[float] = []
    for actif in ASSETS:
        try:
            bars = load_from_file(f"data/{actif}_{interval}_real.json", actif, interval)
        except (DataUnavailable, FileNotFoundError):
            continue
        res = run_backtest(bars, BASELINES[nom](**parametres(nom, interval)),
                           limits=limits, interval=interval,
                           initial_equity_usd=Decimal(str(capital)))
        for t in res.trades:
            net = float(t.gross_pnl_usd - t.fees_usd - t.funding_usd)
            out.append(net / budget)
    return out


def pire_drawdown(rendements: list[float], fraction: float) -> float:
    """Drawdown maximal d'une courbe de capital composee."""
    capital = 1.0
    sommet = 1.0
    pire = 0.0
    for r in rendements:
        capital *= 1.0 + fraction * r
        if capital <= 0:
            return 1.0
        sommet = max(sommet, capital)
        pire = max(pire, 1.0 - capital / sommet)
    return pire


def main() -> int:
    ap = argparse.ArgumentParser(description="Monte-Carlo du drawdown par permutation")
    ap.add_argument("--interval", default="1d")
    ap.add_argument("--risque", type=float, default=0.5,
                    help="risque par trade, en %% du capital")
    ap.add_argument("--tirages", type=int, default=10_000)
    ap.add_argument("--seuil-dd", type=float, default=30.0)
    ap.add_argument("--ruine", type=float, default=50.0,
                    help="perte a partir de laquelle le desk est hors jeu")
    args = ap.parse_args()

    limits = RiskLimits(max_stop_distance_bps=Decimal("5000"))
    fraction = args.risque / 100.0
    rng = random.Random(20260905)

    print(f"\n  MONTE-CARLO — {args.tirages} permutations · risque "
          f"{args.risque:.2f} %/trade · {args.interval}")
    print("  " + "-" * 72)
    print(f"  {'strategie':<17}{'trades':>7}{'DD median':>11}{'DD p95':>9}"
          f"{'P(DD>' + str(int(args.seuil_dd)) + '%)':>11}"
          f"{'P(ruine)':>10}   verdict")
    print("  " + "-" * 72)

    for nom in BASELINES:
        rendements = multiples_de_r(nom, args.interval, limits)
        if len(rendements) < 20:
            continue

        dds = []
        for _ in range(args.tirages):
            melange = rendements[:]
            rng.shuffle(melange)
            dds.append(pire_drawdown(melange, fraction))
        dds.sort()

        median = dds[len(dds) // 2]
        p95 = dds[int(0.95 * len(dds))]
        p_seuil = sum(1 for d in dds if d > args.seuil_dd / 100) / len(dds)
        p_ruine = sum(1 for d in dds if d > args.ruine / 100) / len(dds)

        # Les deux criteres viennent de documents differents et se cumulent.
        rejet = p_seuil > 0.05 or p_ruine > 0.0001
        print(f"  {nom:<17}{len(rendements):>7}{100 * median:>10.1f}%"
              f"{100 * p95:>8.1f}%{100 * p_seuil:>10.1f}%{100 * p_ruine:>9.2f}%"
              f"   {'REJET' if rejet else 'accepte'}")

    print("  " + "-" * 72)
    print(f"  Criteres : P(DD > {args.seuil_dd:.0f} %) <= 5 % "
          f"(doc robustesse) et P(ruine) <= 0,01 % (KPI Risk Manager)")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
