#!/usr/bin/env python3
"""
Corrélation entre actifs, et taille d'échantillon effective.

C'est la mesure que le pré-enregistrement exige à côté du compte de cellules.
Sans elle, le nombre de cellules flatte l'œil : le desk a déjà cru tenir
p = 1,2·10⁻⁴ sur quatorze cellules qui, corrélées à 0,58, valaient moins de deux
observations indépendantes — soit p ≈ 0,64, c'est-à-dire rien.

    python3 research/correlation.py --cache /chemin/cache --resultats research/resultats.json
"""

from __future__ import annotations

import argparse
import json
import math
import statistics
import sys

from campagne import IN_SAMPLE, cached, fetch_candles


def log_returns(bars):
    out = {}
    for i in range(1, len(bars)):
        a, b = bars[i - 1]["c"], bars[i]["c"]
        if a > 0 and b > 0:
            out[bars[i]["t"]] = math.log(b / a)
    return out


def pearson(xs, ys):
    n = len(xs)
    if n < 10:
        return None
    mx, my = statistics.fmean(xs), statistics.fmean(ys)
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    dx = math.sqrt(sum((x - mx) ** 2 for x in xs))
    dy = math.sqrt(sum((y - my) ** 2 for y in ys))
    if dx == 0 or dy == 0:
        return None
    return num / (dx * dy)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True)
    ap.add_argument("--resultats", required=True)
    args = ap.parse_args()

    with open(args.resultats, encoding="utf-8") as f:
        res = json.load(f)

    groupes = {"in": IN_SAMPLE, "hors": res["hors_echantillon"]}
    sortie = {}

    for nom, actifs in groupes.items():
        series = {}
        for coin in actifs:
            try:
                raw = cached(args.cache, f"c_{coin}_1d.json", lambda: fetch_candles(coin, "1d", pages=1))
            except Exception:
                continue
            bars = [{"t": int(c["t"]), "c": float(c["c"])} for c in raw]
            if len(bars) < 60:
                continue
            series[coin] = log_returns(bars)
        noms = sorted(series)
        paires = []
        for a in range(len(noms)):
            for b in range(a + 1, len(noms)):
                ta, tb = series[noms[a]], series[noms[b]]
                communs = sorted(set(ta) & set(tb))
                if len(communs) < 30:
                    continue
                r = pearson([ta[t] for t in communs], [tb[t] for t in communs])
                if r is not None:
                    paires.append((noms[a], noms[b], r, len(communs)))
        if not paires:
            continue
        rho = statistics.fmean(p[2] for p in paires)
        n = len(noms)
        n_eff = n / (1 + (n - 1) * rho) if rho > -1 / (n - 1) else float("inf")
        sortie[nom] = {
            "actifs": noms,
            "n": n,
            "rho_moyen": rho,
            "rho_min": min(p[2] for p in paires),
            "rho_max": max(p[2] for p in paires),
            "jours_communs_median": statistics.median(p[3] for p in paires),
            "n_effectif": n_eff,
            "paires": len(paires),
        }
        print(f"{nom:<5} n={n:>2} · ρ moyen {rho:+.3f} "
              f"(min {min(p[2] for p in paires):+.2f}, max {max(p[2] for p in paires):+.2f}) "
              f"· n effectif {n_eff:.2f}")

    cells = len(res.get("cellules", []))
    if "in" in sortie and cells:
        rho = sortie["in"]["rho_moyen"]
        n_eff_cell = cells / (1 + (cells - 1) * rho)
        sortie["cellules"] = {
            "comptees": cells,
            "n_effectif_si_meme_rho": n_eff_cell,
        }
        print(f"\n{cells} cellules comptées · n effectif si ρ = {rho:.3f} : {n_eff_cell:.2f}")
        print("C'est ce second chiffre qui décide, pas le premier.")

    res["correlation"] = sortie
    with open(args.resultats, "w", encoding="utf-8") as f:
        json.dump(res, f, indent=1)
    print(f"\nfusionné dans {args.resultats}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
