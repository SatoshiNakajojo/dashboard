#!/usr/bin/env python3
"""
Vérifie que le port des moteurs est fidèle et causal.

La campagne calcule les indicateurs UNE FOIS sur toute la série, puis évalue la
condition de signal à chaque indice. C'est valide seulement si les indicateurs
sont causals — s'ils ne dépendent que des barres jusqu'à i. Sinon la campagne
contiendrait un look-ahead, et tout résultat serait faux dans le bon sens.

Ce fichier le vérifie en rejouant `readEngines` sur la série TRONQUÉE, comme le
bot le fait en production, et en comparant signal par signal.

    python3 research/test_port.py --cache /chemin/cache
"""

from __future__ import annotations

import argparse
import random
import sys

from campagne import (
    RR,
    WARMUP,
    cached,
    donchian,
    fetch_candles,
    signals,
    supertrend,
)


def read_engines(bars):
    """
    Port direct de readEngines(bars) : reçoit la série COMPLÈTE jusqu'à la barre
    en formation incluse, écarte celle-ci, et ne regarde que le dernier indice.
    C'est exactement ce que fait le bot à chaque cycle.
    """
    closed = bars[:-1] if len(bars) >= 3 else bars
    i = len(closed) - 1
    if i < WARMUP:
        return None
    px = closed[i]["c"]
    hi, lo = donchian(closed)
    d_hi, d_lo, p_hi, p_lo = hi[i], lo[i], hi[i - 1], lo[i - 1]

    if p_hi is not None and closed[i - 1]["c"] <= p_hi and d_hi is not None and px > p_hi:
        stop = d_lo if d_lo is not None else px * 0.97
        return ("LONG", stop, px + (px - stop) * RR, "Donchian")
    if p_lo is not None and closed[i - 1]["c"] >= p_lo and d_lo is not None and px < p_lo:
        stop = d_hi if d_hi is not None else px * 1.03
        return ("SHORT", stop, px - (stop - px) * RR, "Donchian")

    line, direction = supertrend(closed)
    sd, sp, sl = direction[i], direction[i - 1], line[i]
    if sd and sp and sd != sp and sl is not None:
        side = "LONG" if sd == 1 else "SHORT"
        tgt = px + (px - sl) * RR if side == "LONG" else px - (sl - px) * RR
        return (side, sl, tgt, "Supertrend")
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True)
    ap.add_argument("--coin", default="BTC")
    ap.add_argument("--interval", default="1h")
    ap.add_argument("--echantillon", type=int, default=400)
    args = ap.parse_args()

    raw = cached(args.cache, f"c_{args.coin}_{args.interval}.json",
                 lambda: fetch_candles(args.coin, args.interval))
    bars = [{"t": int(c["t"]), "o": float(c["o"]), "h": float(c["h"]),
             "l": float(c["l"]), "c": float(c["c"])} for c in raw]
    print(f"{args.coin} {args.interval} — {len(bars)} barres")

    plein = {i: (side, stop, tgt, src) for (i, side, stop, tgt, src) in signals(bars)}

    rng = random.Random(1)
    indices = sorted(rng.sample(range(WARMUP, len(bars)), min(args.echantillon, len(bars) - WARMUP)))

    ecarts = 0
    verifies = 0
    for i in indices:
        # readEngines voit les barres jusqu'à i, plus la barre en formation i+1.
        tronque = bars[: i + 2]
        attendu = read_engines(tronque)
        obtenu = plein.get(i)
        verifies += 1
        if attendu is None and obtenu is None:
            continue
        if attendu is None or obtenu is None:
            ecarts += 1
            print(f"  ÉCART i={i} : tronqué={attendu} · série entière={obtenu}")
            continue
        for k, (a, b) in enumerate(zip(attendu, obtenu)):
            if isinstance(a, float):
                if abs(a - b) > abs(a) * 1e-9 + 1e-12:
                    ecarts += 1
                    print(f"  ÉCART i={i} champ {k} : {a} vs {b}")
                    break
            elif a != b:
                ecarts += 1
                print(f"  ÉCART i={i} champ {k} : {a} vs {b}")
                break

    signaux = sum(1 for i in indices if i in plein)
    print(f"\n{verifies} indices vérifiés, dont {signaux} portant un signal")
    print(f"écarts : {ecarts}")
    if ecarts:
        print("\nLE PORT N'EST PAS CAUSAL — la campagne contiendrait un look-ahead.")
        return 1
    print("\nPort fidèle et causal : calculer une fois sur la série entière est")
    print("identique à rejouer readEngines sur la série tronquée.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
