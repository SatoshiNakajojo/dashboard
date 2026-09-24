#!/usr/bin/env python3
"""
Que peut-on attendre de la règle 25/10 face au BTC détenu ?

Pas une moyenne sur une seule période : la distribution des écarts sur toutes
les fenêtres d'un an et de trois ans qui commencent un 1er du mois, de 2013 à
2026 (CoinMetrics, clôtures, variante D — règle à plat au départ, comme un
nouvel utilisateur). Plus le coût du funding, mesuré sur Hyperliquid depuis
2024, que paie la règle jouée sur les perps.

    PYTHONPATH=<numpy> python3 attentes.py --cache /chemin/cache
"""

from __future__ import annotations

import argparse
import statistics
from pathlib import Path

import numpy as np

import regle_grok as rg


def ann(x, jours):
    return x ** (365.25 / jours) - 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path)
    args = ap.parse_args()
    DAY = rg.DAY

    hl = rg.hl_journalier(args.cache)
    fund = rg.hl_funding(args.cache, rg.ms("2024-01-01"), int(hl["t"][-1]) + DAY)
    eqA, _, _, _ = rg.jouer(hl, 25, 10, "A")
    eqF, _, _, _ = rg.jouer(hl, 25, 10, "A", funding=fund)
    bh = rg.comptant(hl)
    i = int(np.searchsorted(hl["t"], rg.ms("2024-01-01")))
    j = (hl["t"][-1] - hl["t"][i]) / DAY
    a, f, b = eqA[-1] / eqA[i], eqF[-1] / eqF[i], bh[-1] / bh[i]
    print(f"2024-01 → {rg.jour(int(hl['t'][-1]))}, Hyperliquid, variante A :")
    print(f"  BTC détenu {ann(b, j) * 100:+.0f} %/an · règle sans funding {ann(a, j) * 100:+.0f} %/an · "
          f"règle sur perps, funding payé {ann(f, j) * 100:+.0f} %/an · funding : {(1 - f / a) * 100:.0f} % du capital en {j / 365.25:.1f} ans")

    cm = rg.fenetre(rg.coinmetrics(args.cache), rg.ms("2012-06-01"), rg.ms("2026-05-23"))
    for ans in (1, 3):
        rel = []
        for an in range(2013, 2026):
            for mo in range(1, 13):
                s0 = rg.ms(f"{an}-{mo:02d}-01")
                s1 = s0 + int(ans * 365.25 * DAY)
                if s1 > cm["t"][-1]:
                    continue
                w = rg.fenetre(cm, s0 - 150 * DAY, s1)
                d = int(np.searchsorted(w["t"], s0))
                eq, _, _, _ = rg.jouer(w, 25, 10, "D", depuis=d)
                rel.append((eq[-1], rg.comptant(w, d)[-1]))
        r = [x / y - 1 for x, y in rel]
        q = np.percentile(r, [10, 50, 90])
        print(f"\nfenêtres de {ans} an{'s' if ans > 1 else ''} ({len(r)} départs mensuels, 2013 → 2026), sans funding :")
        print(f"  règle devant le BTC détenu dans {sum(x > 0 for x in r) / len(r) * 100:.0f} % des cas · "
              f"écart règle / BTC : 10e centile {q[0] * 100:+.0f} %, médiane {q[1] * 100:+.0f} %, 90e {q[2] * 100:+.0f} %")
        for nom, test in (("BTC > +30 %", lambda y: y > 1.3), ("BTC entre −20 % et +30 %", lambda y: 0.8 <= y <= 1.3),
                          ("BTC < −20 %", lambda y: y < 0.8)):
            g = [(x, y) for x, y in rel if test(y)]
            if g:
                rr = [x / y - 1 for x, y in g]
                print(f"    quand {nom:<26} {len(g):>3} cas · médiane {statistics.median(rr) * 100:+.0f} % · devant dans "
                      f"{sum(x > 0 for x in rr) / len(rr) * 100:.0f} %")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
