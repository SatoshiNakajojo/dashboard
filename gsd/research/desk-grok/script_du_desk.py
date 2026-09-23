#!/usr/bin/env python3
"""
Audit du VRAI code du desk : `paper_supertrend_live.py`, porté à l'identique et
rejoué sur les 208 jours de bougies Hyperliquid 1h.

Ce n'est pas une campagne pré-enregistrée : c'est la lecture d'un code, vérifiée
sur les données. Deux versions de `check_exit` tournent côte à côte :

- **telle quelle** : le stop est remonté avec la ligne Supertrend de la barre en
  cours AVANT de vérifier si la barre l'a touché. Sur une barre de retournement,
  cette ligne est la bande OPPOSÉE — au-dessus du prix pour une position longue.
- **corrigée** : on vérifie le stop connu au début de la barre, sortie au pire
  de l'ouverture et du stop, et on ne remonte le stop qu'ensuite, et seulement
  si la direction n'a pas changé.

`hl_common.atr_series` n'a pas été fourni : trois ATR plausibles sont rejoués.

    python3 research/desk-grok/script_du_desk.py --cache /chemin/cache
"""

from __future__ import annotations

import argparse
import math
import os
import statistics
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from campagne import cached, true_range, wilder  # noqa: E402

TICKERS = ["BTC", "ETH", "SOL"]
MIN_STOP_PCT = 0.004
ST_PERIOD, ST_MULT, TIME_STOP = 10, 3.0, 72
FEE = 0.00035


# ---- ATR : trois lectures possibles de hl_common.atr_series ---------------

def atr_sma(bars, n):
    tr = true_range(bars)
    out = [math.nan] * len(tr)
    for i in range(n - 1, len(tr)):
        out[i] = sum(tr[i - n + 1:i + 1]) / n
    return out


def atr_wilder(bars, n):
    return [math.nan if x is None else x for x in wilder(true_range(bars), n)]


def atr_ewm(bars, n):
    """pandas `ewm(alpha=1/n, adjust=False)` : amorcée sur la première valeur."""
    tr = true_range(bars)
    out, prev, a = [], None, 1 / n
    for x in tr:
        prev = x if prev is None else (1 - a) * prev + a * x
        out.append(prev)
    return out


# ---- supertrend() du desk, ligne pour ligne -------------------------------

def supertrend_desk(bars, atr):
    n = len(bars)
    close = [b["c"] for b in bars]
    fub = [math.nan] * n
    flb = [math.nan] * n
    st = [math.nan] * n
    direction = [0] * n
    for i in range(n):
        if not math.isfinite(atr[i]):
            continue
        hl2 = (bars[i]["h"] + bars[i]["l"]) / 2
        bu, bl = hl2 + ST_MULT * atr[i], hl2 - ST_MULT * atr[i]
        if i == 0 or not math.isfinite(fub[i - 1]):
            fub[i], flb[i], st[i], direction[i] = bu, bl, bu, -1
            continue
        fub[i] = bu if bu < fub[i - 1] or close[i - 1] > fub[i - 1] else fub[i - 1]
        flb[i] = bl if bl > flb[i - 1] or close[i - 1] < flb[i - 1] else flb[i - 1]
        if direction[i - 1] == -1:
            if close[i] > fub[i]:
                direction[i], st[i] = 1, flb[i]
            else:
                direction[i], st[i] = -1, fub[i]
        else:
            if close[i] < flb[i]:
                direction[i], st[i] = -1, fub[i]
            else:
                direction[i], st[i] = 1, flb[i]
    return st, direction


# ---- check_exit() du desk, ligne pour ligne -------------------------------

def check_exit_desk(pos, b, st, d):
    side = pos["side"]
    old_stop = pos["stop_cur"]
    stop = old_stop
    pos["bars_held"] += 1
    if math.isfinite(st):
        if side == "long" and st > stop:
            stop = st
        elif side == "short" and st < stop:
            stop = st
    pos["stop_cur"] = stop
    if (b["l"] <= stop) if side == "long" else (b["h"] >= stop):
        return stop, "stop"
    if (side == "long" and d == -1) or (side == "short" and d == 1):
        return b["c"], "st_flip"
    if pos["bars_held"] >= TIME_STOP:
        return b["c"], "time_stop"
    return None


def check_exit_corrige(pos, b, st, d):
    """Le stop en place pendant la barre est celui connu à sa clôture précédente."""
    side = pos["side"]
    stop = pos["stop_cur"]
    pos["bars_held"] += 1
    if side == "long" and b["l"] <= stop:
        return min(b["o"], stop), "stop"
    if side == "short" and b["h"] >= stop:
        return max(b["o"], stop), "stop"
    if (side == "long" and d == -1) or (side == "short" and d == 1):
        return b["c"], "st_flip"
    if pos["bars_held"] >= TIME_STOP:
        return b["c"], "time_stop"
    if math.isfinite(st):
        if side == "long" and d == 1 and st > stop:
            pos["stop_cur"] = st
        elif side == "short" and d == -1 and st < stop:
            pos["stop_cur"] = st
    return None


# ---- boucle : evaluate_entry() + priorité + position unique ---------------

def rejouer(series, check):
    n = min(len(s["bars"]) for s in series.values())
    trades, pos = [], None
    for k in range(1, n):
        if pos is not None:
            s = series[pos["ticker"]]
            b = s["bars"][k]
            r = check(pos, b, s["st"][k], s["dir"][k])
            if r:
                px, motif = r
                L = pos["side"] == "long"
                e, rd = pos["entry"], pos["risk_dist"]
                brut = (px - e) if L else (e - px)
                hors = (px > b["h"] + 1e-12) if L else (px < b["l"] - 1e-12)
                trades.append({
                    "ticker": pos["ticker"], "side": pos["side"], "motif": motif,
                    "R": (brut - FEE * (e + px)) / rd, "hors_barre": hors,
                    "ecart_R": ((px - b["h"]) if L else (b["l"] - px)) / rd if hors else 0.0,
                })
                pos = None
        if pos is None:
            for t in TICKERS:
                s = series[t]
                d, dp = s["dir"][k], s["dir"][k - 1]
                if d == 1 and dp == -1:
                    side = "long"
                elif d == -1 and dp == 1:
                    side = "short"
                else:
                    continue
                entry, stop = s["bars"][k]["c"], s["st"][k]
                if not (math.isfinite(entry) and math.isfinite(stop)):
                    continue
                rd = entry - stop if side == "long" else stop - entry
                if rd <= 0 or rd / entry < MIN_STOP_PCT:
                    continue
                pos = {"ticker": t, "side": side, "entry": entry, "stop_cur": stop,
                       "risk_dist": rd, "bars_held": 0}
                break
    return trades


def resume(trades):
    Rs = [t["R"] for t in trades]
    g = sum(x for x in Rs if x > 0)
    p = -sum(x for x in Rs if x <= 0)
    return {
        "n": len(Rs),
        "reussite": sum(1 for x in Rs if x > 0) / len(Rs),
        "E_R": statistics.fmean(Rs),
        "PF": g / p if p else float("inf"),
        "hors_barre": sum(1 for t in trades if t["hors_barre"]),
        "ecart_moyen_R": statistics.fmean([t["ecart_R"] for t in trades if t["hors_barre"]] or [0.0]),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True)
    args = ap.parse_args()

    brut = {}
    for t in TICKERS:
        raw = cached(args.cache, f"c_{t}_1h.json", lambda: None)
        brut[t] = [{"t": int(c["t"]), "o": float(c["o"]), "h": float(c["h"]),
                    "l": float(c["l"]), "c": float(c["c"])} for c in raw]

    print("déclaré par le desk                     n=120  réussite 55,8 %  E[R] +0,222  PF 1,92")
    print()
    for nom_atr, fn in (("ATR moyenne simple", atr_sma), ("ATR Wilder", atr_wilder), ("ATR ewm pandas", atr_ewm)):
        series = {}
        for t in TICKERS:
            st, d = supertrend_desk(brut[t], fn(brut[t], ST_PERIOD))
            series[t] = {"bars": brut[t], "st": st, "dir": d}
        print(f"── {nom_atr}")
        for lab, chk in (("code du desk, tel quel", check_exit_desk), ("code du desk, corrigé", check_exit_corrige)):
            m = resume(rejouer(series, chk))
            extra = (f"   ← {m['hors_barre']} sorties hors de la barre, "
                     f"en moyenne {m['ecart_moyen_R']:+.2f} R au-delà du prix coté"
                     if m["hors_barre"] else "")
            print(f"   {lab:<24} n={m['n']:>4}  réussite {m['reussite']*100:5.1f} %  "
                  f"E[R] {m['E_R']:+.3f}  PF {m['PF']:.2f}{extra}")
        print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
