#!/usr/bin/env python3
"""Plateau ou pic ? Le test de sur-optimisation par balayage de parametre.

`docs/indicateurs-strategies-validation-robustesse.md` : « Si une strategie
est extremement rentable avec une EMA de 20 mais s'effondre totalement avec
une EMA de 19 ou de 21, elle est hautement sujette a l'overfitting. Ne
choisissez jamais le pic absolu ; choisissez le centre de gravite du plateau
le plus large. »

Un p-value spectaculaire sur UNE valeur de parametre ne prouve rien : avec
assez de valeurs essayees, l'une d'elles finit par bien tomber. Ce qui
distingue un signal d'un artefact, c'est qu'il survive au voisinage.

    python scripts/sensibilite_parametres.py --strategie tsmom --actif BTC
"""

from __future__ import annotations

import argparse
import sys
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from trading_desk.backtest.data import load_from_file
from trading_desk.backtest.engine import run_backtest
from trading_desk.backtest.null_model import randomization_test
from trading_desk.backtest.strategies import (
    TimeSeriesMomentum,
    TurtleBreakout,
)
from trading_desk.risk import RiskLimits

# Le parametre balaye pour chaque strategie, et sa plage.
BALAYAGES = {
    "tsmom": ("lookback", [7, 14, 21, 28, 35, 42, 49, 56], TimeSeriesMomentum),
    "turtle_breakout": ("entry_period", [20, 30, 40, 55, 70, 85, 100], TurtleBreakout),
}


def main() -> int:
    ap = argparse.ArgumentParser(description="Sensibilite au parametre principal")
    ap.add_argument("--strategie", default="tsmom", choices=sorted(BALAYAGES))
    ap.add_argument("--actif", default="BTC")
    ap.add_argument("--interval", default="1d")
    ap.add_argument("--draws", type=int, default=500)
    ap.add_argument("--alpha", type=float, default=0.05)
    args = ap.parse_args()

    nom_param, valeurs, cls = BALAYAGES[args.strategie]
    limits = RiskLimits(max_stop_distance_bps=Decimal("5000"))
    bars = load_from_file(
        f"data/{args.actif}_{args.interval}_real.json", args.actif, args.interval)

    print(f"\n  SENSIBILITE — {args.strategie} · {args.actif} {args.interval}")
    print("  " + "-" * 52)
    print(f"  {nom_param:>12}{'net':>11}{'trades':>8}{'p':>9}   < alpha ?")
    print("  " + "-" * 52)

    sous_seuil = 0
    testes = 0
    for v in valeurs:
        obs = run_backtest(bars, cls(**{nom_param: v}), limits=limits,
                           interval=args.interval)
        if not obs.trades:
            print(f"  {v:>12}{'—':>11}{0:>8}{'—':>9}")
            continue
        nul = randomization_test(bars, cls(**{nom_param: v}), obs,
                                 draws=args.draws, limits=limits,
                                 interval=args.interval)
        testes += 1
        ok = nul.p_value < args.alpha
        sous_seuil += ok
        print(f"  {v:>12}{float(obs.net_pnl_usd):>+11.2f}{len(obs.trades):>8}"
              f"{nul.p_value:>9.4f}   {'oui' if ok else ''}")

    print("  " + "-" * 52)
    if not testes:
        print("  Aucune valeur exploitable.\n")
        return 2
    part = sous_seuil / testes
    print(f"  {sous_seuil}/{testes} valeurs sous alpha = {args.alpha}"
          f"  ({100 * part:.0f} %)")
    if part >= 0.7:
        print("  -> PLATEAU. Le signal survit au voisinage du parametre.")
    elif part <= 0.3:
        print("  -> PIC. Le resultat tient a une valeur particuliere :")
        print("     signature classique de sur-optimisation.")
    else:
        print("  -> INTERMEDIAIRE. Ni plateau franc, ni pic isole.")
    print("\n  Un plateau ne prouve pas que le signal tiendra hors echantillon.")
    print("  Il elimine seulement l'explication « un parametre bien tombe ».\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
