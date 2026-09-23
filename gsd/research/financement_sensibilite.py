#!/usr/bin/env python3
"""
Sensibilité au financement non couvert.

Limite découverte EN COURS de campagne, le 23/09/2026 : `fundingHistory`
d'Hyperliquid ne sert qu'environ cinquante jours, alors que les bougies
remontent à 2022. Le financement n'est donc compté que sur une fraction du
temps passé en position.

Le sens de l'erreur compte : le moteur est structurellement long sur des alts à
financement positif, donc du côté qui PAIE. Sous-compter le financement
**flatte** la stratégie. Le résultat mesuré est un majorant de sa performance.

Ce script mesure la couverture réelle, puis recharge les heures non couvertes au
taux médian mesuré de chaque actif. C'est une extrapolation, pas une mesure —
elle est là pour borner l'erreur, pas pour la corriger.

    python3 research/financement_sensibilite.py --cache /chemin --resultats research/resultats.json
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys

from campagne import (
    FEE_ONE_WAY,
    IN_SAMPLE,
    MS,
    Funding,
    backtest,
    cached,
    fetch_candles,
    fetch_funding,
    signals,
)

RISK_PCT = 0.01


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True)
    ap.add_argument("--resultats", required=True)
    args = ap.parse_args()

    with open(args.resultats, encoding="utf-8") as f:
        res = json.load(f)

    faites = {c["cellule"]: c for c in res["cellules"]}
    lignes = []

    print(f"{'cellule':<12} {'heures pos.':>11} {'couvert':>8} "
          f"{'R total':>8} {'R ajusté':>9} {'écart':>8}")
    print("-" * 64)

    for cell in res["cellules"]:
        coin, iv = cell["coin"], cell["interval"]
        raw = cached(args.cache, f"c_{coin}_{iv}.json", lambda: fetch_candles(coin, iv))
        bars = [{"t": int(c["t"]), "o": float(c["o"]), "h": float(c["h"]),
                 "l": float(c["l"]), "c": float(c["c"])} for c in raw]
        frows = cached(args.cache, f"f_{coin}.json", lambda: fetch_funding(coin, bars[0]["t"]))
        if not frows:
            continue
        fnd = Funding(frows)
        couvert_de, couvert_a = frows[0]["t"], frows[-1]["t"]
        taux_median = statistics.median(r["r"] for r in frows)

        trades = backtest(bars, fnd, signals(bars))
        if not trades:
            continue

        h_tot = h_couv = 0.0
        ajuste = 0.0
        for t in trades:
            t0 = bars[t["i"] + 1]["t"]
            t1 = t0 + t["barres"] * MS[iv]
            h = (t1 - t0) / 3_600_000
            hc = max(0.0, (min(t1, couvert_a) - max(t0, couvert_de)) / 3_600_000)
            hc = min(hc, h)
            h_tot += h
            h_couv += hc
            # les heures non couvertes, au taux médian de l'actif
            manquant = (h - hc) * taux_median
            cout = manquant if t["side"] == "LONG" else -manquant
            net = t["net"] - cout
            ajuste += net / t["stop_frac"]

        part = h_couv / h_tot if h_tot else 0.0
        lignes.append({
            "cellule": cell["cellule"], "heures_position": h_tot,
            "part_couverte": part, "taux_median_horaire": taux_median,
            "R_total": cell["R_total"], "R_total_ajuste": ajuste,
        })
        print(f"{cell['cellule']:<12} {h_tot:>11.0f} {part*100:>7.1f}% "
              f"{cell['R_total']:>+8.1f} {ajuste:>+9.1f} {ajuste - cell['R_total']:>+8.1f}")

    if not lignes:
        print("rien à mesurer")
        return 1

    rt = sum(x["R_total"] for x in lignes)
    ra = sum(x["R_total_ajuste"] for x in lignes)
    part = statistics.fmean(x["part_couverte"] for x in lignes)
    print("-" * 64)
    print(f"{'TOTAL':<12} {sum(x['heures_position'] for x in lignes):>11.0f} "
          f"{part*100:>7.1f}% {rt:>+8.1f} {ra:>+9.1f} {ra - rt:>+8.1f}")
    print()
    print(f"Couverture moyenne du financement : {part*100:.1f} % du temps en position.")
    print(f"R total mesuré  {rt:+.1f}  →  {rt * RISK_PCT * 100:+.1f} % d'équité à 1 % de risque")
    print(f"R total ajusté  {ra:+.1f}  →  {ra * RISK_PCT * 100:+.1f} % d'équité")
    print()
    if ra < rt:
        print("L'ajustement DÉGRADE le résultat : le financement non compté était un coût,")
        print("conformément au fait que le moteur est du côté qui paie. Le chiffre mesuré")
        print("est donc un majorant, et le verdict de la campagne n'est pas menacé par")
        print("cette limite — il est atténué par elle.")
    else:
        print("L'ajustement AMÉLIORE le résultat : à vérifier, ce n'est pas le sens attendu.")

    res["financement_sensibilite"] = {
        "raison": "fundingHistory Hyperliquid ne sert qu'environ 50 jours",
        "part_couverte_moyenne": part,
        "R_total_mesure": rt,
        "R_total_ajuste": ra,
        "cellules": lignes,
    }
    with open(args.resultats, "w", encoding="utf-8") as f:
        json.dump(res, f, indent=1)
    print(f"\nfusionné dans {args.resultats}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
