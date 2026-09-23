#!/usr/bin/env python3
"""
Revalide une cellule dont le p est tombé au plancher du test.

Un p égal à 1/(tirages+1) n'est pas un p mesuré : c'est tout ce que la
résolution permettait de dire. Le desk l'a appris sur `tsmom BTC 1d` — p = 0,0005
à 2 000 tirages, p = 0,00105 à 20 000, au-dessus du seuil. Il ne survivait pas.

La graine est DIFFÉRENTE de celle de la campagne, et fixée : les tirages sont
indépendants des premiers, et la revalidation est reproductible.

    python3 research/revalider.py --cache /chemin --coin ARB --interval 4h --tirages 20000
"""

from __future__ import annotations

import argparse
import random
import statistics
import sys

from campagne import SEED, Funding, backtest, cached, fetch_candles, fetch_funding, modele_nul, signals


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True)
    ap.add_argument("--coin", required=True)
    ap.add_argument("--interval", required=True)
    ap.add_argument("--tirages", type=int, default=20000)
    ap.add_argument("--cellules", type=int, default=74, help="nombre de cellules du criblage (pour le seuil BH)")
    args = ap.parse_args()

    raw = cached(args.cache, f"c_{args.coin}_{args.interval}.json", lambda: fetch_candles(args.coin, args.interval))
    bars = [{"t": int(c["t"]), "o": float(c["o"]), "h": float(c["h"]),
             "l": float(c["l"]), "c": float(c["c"])} for c in raw]
    fnd = Funding(cached(args.cache, f"f_{args.coin}.json", lambda: fetch_funding(args.coin, bars[0]["t"])))

    trades = backtest(bars, fnd, signals(bars))
    moyenne = statistics.fmean(t["R"] for t in trades)
    longs = sum(1 for t in trades if t["side"] == "LONG")

    rng = random.Random(SEED + 1)
    nul = modele_nul(bars, fnd, trades, args.tirages, rng)
    depasse = sum(1 for m in nul if m >= moyenne)
    p = (depasse + 1) / (len(nul) + 1)
    plancher = 1 / (len(nul) + 1)
    seuil = 0.05 / args.cellules

    print(f"{args.coin} {args.interval} — {len(trades)} trades ({longs} longs, {len(trades) - longs} courts)")
    print(f"R moyen observé      {moyenne:+.4f}")
    print(f"nul, R moyen         {statistics.fmean(nul):+.4f}  (écart-type {statistics.pstdev(nul):.4f})")
    print(f"tirages du nul       {len(nul)}  ·  dépassent l'observé : {depasse}")
    print()
    print(f"p                    {p:.6f}")
    print(f"plancher             {plancher:.6f}")
    print(f"seuil BH au rang 1   {seuil:.6f}  ({args.cellules} cellules)")
    print()
    if depasse == 0:
        print("Encore au plancher : le test ne distingue toujours pas un p réel d'un p sous sa résolution.")
    elif p <= seuil:
        print("SURVIT : p mesuré, sous le seuil de Benjamini-Hochberg au rang 1.")
    else:
        print("NE SURVIT PAS : le p au plancher n'était que la résolution du test.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
