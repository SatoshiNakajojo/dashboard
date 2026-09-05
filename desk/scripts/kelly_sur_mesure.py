#!/usr/bin/env python3
"""Le critere de Kelly applique aux baselines REELLEMENT mesurees.

`docs/autre-risk-management.md` prescrit deux choses qui, confrontees aux
donnees de ce depot, se contredisent :

1. un plafond dur de 0,5 a 1 % de risque par trade en crypto ;
2. un dimensionnement par quarter-Kelly.

Ce script calcule `f* = p - (1-p)/R` a partir des trades reellement produits
par chaque baseline sur les sept actifs, puis confronte le resultat au plafond.

**Ce que ce script demontre n'est pas que Kelly a tort.** Kelly est exact sous
son hypothese : que `p` et `R` soient les vraies valeurs. Le probleme est que
ces valeurs sont estimees IN-SAMPLE sur des strategies dont le modele nul dit
qu'elles ne battent pas des entrees aleatoires. Kelly applique a un edge qui
n'existe pas ne produit pas une mise prudente : il produit la ruine.

Le document nomme d'ailleurs ce danger — « si le taux de reussite p ou le
ratio R sont surestimes en raison d'un historique trop court, la mise de
Kelly devient surevaluee ». Sa parade, le quarter-Kelly, est insuffisante
ici : le quart d'un edge fantome reste sept fois au-dessus du plafond.

    python scripts/kelly_sur_mesure.py
"""

from __future__ import annotations

import argparse
import math
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


def kelly(p: float, R: float) -> float:
    """Fraction optimale de Kelly. Negative = l'esperance est defavorable."""
    return p - (1.0 - p) / R if R > 0 else -1.0


def proba_serie_perdante(p_win: float, n: int, trades: int) -> float:
    """P(au moins une serie de `n` pertes consecutives sur `trades` trades).

    Approximation classique : le nombre attendu de series de longueur `n`
    vaut `N * p * q^n`, et la probabilite d'en voir au moins une suit une loi
    de Poisson de ce parametre.
    """
    q = 1.0 - p_win
    return 1.0 - math.exp(-trades * p_win * (q ** n))


def drawdown_serie(fraction: float, n: int) -> float:
    """Perte cumulee apres `n` pertes consecutives a `fraction` du capital."""
    return 1.0 - (1.0 - fraction) ** n


def main() -> int:
    ap = argparse.ArgumentParser(description="Kelly sur les baselines mesurees")
    ap.add_argument("--interval", default="1d")
    ap.add_argument("--k", type=float, default=0.25, help="fraction de Kelly")
    ap.add_argument("--serie", type=int, default=8, help="longueur de serie noire")
    ap.add_argument("--plafond-doc", type=float, default=1.0,
                    help="plafond du document, en %% du capital")
    args = ap.parse_args()

    limits = RiskLimits(max_stop_distance_bps=Decimal("5000"))
    print(f"\n  KELLY SUR LES BASELINES MESUREES — {args.interval}, "
          f"{len(ASSETS)} actifs")
    print("  " + "-" * 76)
    print(f"  {'strategie':<17}{'trades':>7}{'p':>7}{'R':>7}"
          f"{'f*':>9}{'k·f*':>9}{'DD si ' + str(args.serie) + ' pertes':>18}")
    print("  " + "-" * 76)

    for nom, cls in BASELINES.items():
        gains: list[float] = []
        pertes: list[float] = []
        for actif in ASSETS:
            try:
                bars = load_from_file(
                    f"data/{actif}_{args.interval}_real.json", actif, args.interval)
            except (DataUnavailable, FileNotFoundError):
                continue
            res = run_backtest(bars, cls(**parametres(nom, args.interval)),
                               limits=limits, interval=args.interval)
            for t in res.trades:
                net = float(t.gross_pnl_usd - t.fees_usd - t.funding_usd)
                (gains if net > 0 else pertes).append(abs(net))

        total = len(gains) + len(pertes)
        if not gains or not pertes:
            continue
        p = len(gains) / total
        R = (sum(gains) / len(gains)) / (sum(pertes) / len(pertes))
        f = kelly(p, R)
        kf = args.k * f
        dd = drawdown_serie(max(kf, 0.0), args.serie)
        if f <= 0:
            mise = "NE PAS TRADER"
        else:
            mise = f"{100 * dd:.0f} %" + ("  <- zone de mort" if dd > 0.30 else "")
        print(f"  {nom:<17}{total:>7}{p:>7.3f}{R:>7.2f}"
              f"{f:>+9.3f}{kf:>+9.3f}   {mise}")

    print("  " + "-" * 76)
    print(f"\n  Le document plafonne pourtant le risque crypto a "
          f"{args.plafond_doc:.1f} %, ce qui donne")
    print(f"  {100 * drawdown_serie(args.plafond_doc / 100, args.serie):.0f} % de "
          f"perte sur la meme serie noire. Les deux prescriptions du meme")
    print("  document se contredisent des qu'on les applique a ces chiffres.")
    print("\n  Kelly n'a pas tort : il est exact SI p et R sont les vraies")
    print("  valeurs. Or elles sont estimees in-sample sur des strategies dont")
    print("  le modele nul dit qu'elles ne battent pas des entrees aleatoires.")
    print("  Le quart d'un edge fantome reste un edge fantome.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
