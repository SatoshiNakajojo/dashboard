#!/usr/bin/env python3
"""Teste une stratégie dans tous les sens, et inscrit la campagne ENTIÈRE.

    python scripts/testeur.py --strategie supertrend
    python scripts/testeur.py --strategie ema_cross --actifs BTC,SOL --intervalles 4h,12h
    python scripts/testeur.py --strategie inverse:supertrend --actifs BTC
    python scripts/testeur.py --strategie tsmom --etage hors_echantillon --depuis 2026-06-01
    python scripts/testeur.py --bilan

Une campagne est un BALAYAGE : croiser trois actifs et quatre échelles dépense
douze hypothèses. Le dénominateur est inscrit avec la campagne.
"""

from __future__ import annotations

import argparse
import datetime as dt
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RACINE / "src"))

from trading_desk import testeur as ts  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--strategie")
    p.add_argument("--actifs", default=",".join(ts.ACTIFS_DEFAUT))
    p.add_argument("--intervalles", default=",".join(ts.INTERVALLES_DEFAUT))
    p.add_argument("--etage", choices=ts.ETAGES, default="backtest")
    p.add_argument("--depuis", help="date de déclaration, AAAA-MM-JJ, pour "
                                    "l'étage hors échantillon")
    p.add_argument("--equite", type=float, default=1000.0)
    p.add_argument("--max-stop-bps", type=float, default=1600.0)
    p.add_argument("--bilan", action="store_true")
    a = p.parse_args()

    if a.bilan:
        par = ts.par_strategie()
        if not par:
            print("\n  Aucune campagne. `--strategie <nom>` d'abord.\n")
            return 1
        print(f"\n  {len(par)} stratégie(s) testée(s)\n")
        print(f"  {'stratégie':<24}{'campagnes':>10}{'cellules':>10}"
              f"{'dénominateur':>14}{'déployables':>13}  étages")
        print("  " + "-" * 92)
        for nom, d in sorted(par.items(), key=lambda kv: -kv[1]["cellules"]):
            etages = ", ".join(f"{k}×{v}" for k, v in sorted(d["etages"].items()))
            print(f"  {nom[:23]:<24}{d['campagnes']:>10}{d['cellules']:>10}"
                  f"{d['denominateur']:>14}{d['deployables']:>13}  {etages}")
        print()
        return 0

    if not a.strategie:
        p.print_help()
        return 1

    depuis_ms = None
    if a.depuis:
        j = dt.datetime.strptime(a.depuis, "%Y-%m-%d").replace(
            tzinfo=dt.timezone.utc)
        depuis_ms = int(j.timestamp() * 1000)

    c = ts.tester(
        a.strategie,
        actifs=[x.strip() for x in a.actifs.split(",") if x.strip()],
        intervalles=[x.strip() for x in a.intervalles.split(",") if x.strip()],
        etage=a.etage, equite=a.equite, max_stop_bps=a.max_stop_bps,
        depuis_ms=depuis_ms)
    ts.inscrire(c)

    print(f"\n  {c.strategie} — étage « {c.etage} »")
    if c.refus:
        print(f"\n  N'A PAS TOURNÉ : {c.refus}\n")
        return 2

    print(f"  {len(c.cellules)} cellule(s) · dénominateur {c.denominateur}\n")
    print(f"  {'actif':<6}{'TF':<6}{'trades':>8}{'net $':>10}{'%/an':>8}"
          f"{'note':>7}  verdict")
    print("  " + "-" * 78)
    for x in c.cellules:
        if x.erreur:
            print(f"  {x.actif:<6}{x.intervalle:<6}{'':>33}  {x.erreur[:40]}")
            continue
        n = x.note or {}
        print(f"  {x.actif:<6}{x.intervalle:<6}{x.trades:>8}{x.net_usd:>10.2f}"
              f"{n.get('annualise_pct', 0):>8.1f}{n.get('note_sur_10', 0):>7.1f}"
              f"  {'DÉPLOYABLE' if x.deployable else (n.get('resume') or '')[:44]}")
    d = sum(1 for x in c.cellules if x.deployable)
    print(f"\n  {d} cellule(s) franchissant les deux portes sur "
          f"{c.denominateur} testée(s).\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
