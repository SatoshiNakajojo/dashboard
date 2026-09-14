#!/usr/bin/env python3
"""L'effet week-end existe-t-il, et dans quel sens ?

`docs/autre-intertemporal-risk-overnight-weekend.md` avance deux affirmations
et en tire une regle :

1. la profondeur du carnet s'effondre de 40 a 70 % le week-end ;
2. le carnet mince laisse passer des « meches de liquidation » ;
3. donc il faut ELARGIR les stops le week-end (3,5x ATR au lieu de 2x).

Les deux premieres sont mesurables sur de l'OHLCV — le volume approxime la
profondeur, l'amplitude (haut-bas)/cloture approxime la violence realisee. La
troisieme ne se deduit correctement que si la deuxieme tient.

Ce script les teste sur les donnees du depot. Il ne suffit pas de regarder la
mediane : une affirmation sur des MECHES porte sur la queue de distribution,
pas sur le comportement courant. On mesure donc mediane, p95 et p99.

    python scripts/weekend_effect.py --interval 4h
"""

from __future__ import annotations

import argparse
import datetime as dt
import statistics as st
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from trading_desk.backtest.data import DataUnavailable, load_from_file

ASSETS = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "AVAX"]


def quantile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(p * len(ordered)))]


def ecart_pct(semaine: float, weekend: float) -> float:
    return 100.0 * (weekend - semaine) / semaine if semaine else 0.0


def main() -> int:
    p = argparse.ArgumentParser(description="Effet week-end sur volume et amplitude")
    p.add_argument("--interval", default="4h")
    p.add_argument("--assets", nargs="*", default=ASSETS)
    args = p.parse_args()

    lignes = []
    for actif in args.assets:
        try:
            bars = load_from_file(
                f"data/{actif}_{args.interval}_real.json", actif, args.interval)
        except (DataUnavailable, FileNotFoundError) as exc:
            print(f"  {actif} : {exc}", file=sys.stderr)
            continue

        sem_v, we_v, sem_a, we_a = [], [], [], []
        for b in bars:
            # 5 et 6 = samedi, dimanche. L'horodatage Hyperliquid est en UTC.
            weekend = dt.datetime.utcfromtimestamp(b.ts_ms / 1000).weekday() >= 5
            amplitude = float(b.high - b.low) / float(b.close) if b.close else 0.0
            (we_v if weekend else sem_v).append(float(b.volume))
            (we_a if weekend else sem_a).append(amplitude)

        if not we_v or not sem_v:
            continue
        lignes.append({
            "actif": actif,
            "volume": ecart_pct(st.median(sem_v), st.median(we_v)),
            "med": ecart_pct(st.median(sem_a), st.median(we_a)),
            "p95": ecart_pct(quantile(sem_a, 0.95), quantile(we_a, 0.95)),
            "p99": ecart_pct(quantile(sem_a, 0.99), quantile(we_a, 0.99)),
        })

    if not lignes:
        print("  Aucune donnee.", file=sys.stderr)
        return 2

    print(f"\n  EFFET WEEK-END — {args.interval} · ecart week-end vs semaine")
    print("  " + "-" * 58)
    print(f"  {'actif':<8}{'volume':>10}{'amplitude med':>15}{'p95':>10}{'p99':>10}")
    print("  " + "-" * 58)
    for r in lignes:
        print(f"  {r['actif']:<8}{r['volume']:>9.0f}%{r['med']:>14.0f}%"
              f"{r['p95']:>9.0f}%{r['p99']:>9.0f}%")
    print("  " + "-" * 58)
    med = {k: st.median([r[k] for r in lignes]) for k in ("volume", "med", "p95", "p99")}
    print(f"  {'mediane':<8}{med['volume']:>9.0f}%{med['med']:>14.0f}%"
          f"{med['p95']:>9.0f}%{med['p99']:>9.0f}%")
    print("  " + "-" * 58)

    print("\n  LECTURE")
    print(f"  Le volume baisse de {abs(med['volume']):.0f} % : l'assechement annonce")
    print("  par la documentation est confirme.")
    if med["p95"] < 0 and med["p99"] < 0:
        print("\n  Mais l'amplitude baisse AUSSI, y compris dans les queues")
        print(f"  (p95 {med['p95']:.0f} %, p99 {med['p99']:.0f} %). Les meches de")
        print("  liquidation annoncees n'apparaissent pas dans ces donnees.")
        print("\n  Consequence sur la regle prescrite : elargir les stops le")
        print("  week-end reviendrait a relacher la protection pendant la periode")
        print("  la PLUS calme. Si l'ATR est calcule sur une fenetre glissante qui")
        print("  melange semaine et week-end, un multiplicateur de 3,5x s'applique")
        print("  a des barres plus etroites — le risque porte augmente sans raison.")
    else:
        print("\n  L'amplitude de queue augmente : la regle d'elargissement des")
        print("  stops le week-end est soutenue par ces donnees.")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
