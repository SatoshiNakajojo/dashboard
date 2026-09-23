#!/usr/bin/env python3
"""
Reproduction des deux stratégies PASS du desk Grok, depuis leur description.

Les règles et les prédictions sont dans PRE-ENREGISTREMENT.md, commité avant ce
fichier. Les scripts du desk n'étant pas accessibles, les écarts de détail
d'implémentation sont possibles et déclarés — le test qui compte est l'écart
entre l'implémentation correcte et l'implémentation à anticipation, pas le
chiffre au centième près.

    python3 research/desk-grok/reproduction.py --cache /chemin/cache
"""

from __future__ import annotations

import argparse
import json
import os
import random
import statistics
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from campagne import Funding, cached, true_range, wilder  # noqa: E402

TICKERS = ["BTC", "ETH", "SOL"]  # ordre = priorité du desk
AUTRES = ["BNB", "XRP", "DOGE", "AVAX", "LINK", "SUI", "APT",
          "ATOM", "DYDX", "APE", "OP", "LTC", "ARB", "INJ", "kPEPE", "CRV"]
FLOOR = 0.0040
RISK_BT = 0.0035
SEED = 20260923


# ---- indicateurs ----------------------------------------------------------

def supertrend(bars, period=10, mult=3.0):
    """Supertrend classique (bandes finales), ATR de Wilder — la forme de pandas-ta."""
    n = len(bars)
    atr = wilder(true_range(bars), period)
    ub = [None] * n
    lb = [None] * n
    d = [0] * n
    line = [None] * n
    for i in range(n):
        if atr[i] is None:
            continue
        hl2 = (bars[i]["h"] + bars[i]["l"]) / 2
        ub[i] = hl2 + mult * atr[i]
        lb[i] = hl2 - mult * atr[i]
        if i == 0 or ub[i - 1] is None:
            d[i] = 1
            line[i] = lb[i]
            continue
        c = bars[i]["c"]
        if c > ub[i - 1]:
            d[i] = 1
        elif c < lb[i - 1]:
            d[i] = -1
        else:
            d[i] = d[i - 1]
            if d[i] > 0 and lb[i] < lb[i - 1]:
                lb[i] = lb[i - 1]
            if d[i] < 0 and ub[i] > ub[i - 1]:
                ub[i] = ub[i - 1]
        line[i] = lb[i] if d[i] > 0 else ub[i]
    return line, d


def ema(values, period):
    out = [None] * len(values)
    if len(values) < period:
        return out
    k = 2 / (period + 1)
    prev = sum(values[:period]) / period
    out[period - 1] = prev
    for i in range(period, len(values)):
        prev = values[i] * k + prev * (1 - k)
        out[i] = prev
    return out


def canal(bars, n, i):
    """Plus haut / plus bas des n barres PRÉCÉDENT i (i exclu)."""
    if i < n:
        return None, None
    w = bars[i - n:i]
    return max(b["h"] for b in w), min(b["l"] for b in w)


# ---- Supertrend V3-1B -----------------------------------------------------

def st_signal(ind, i):
    line, d = ind
    if i < 1 or line[i] is None or d[i - 1] == 0 or d[i] == d[i - 1]:
        return None
    return ("LONG" if d[i] > 0 else "SHORT"), line[i]


def st_suivre(bars, ind, pos, k, anticipation):
    """Une barre de gestion. Rend (prix_sortie, motif) ou None."""
    line, d = ind
    b = bars[k]
    L = pos["side"] == "LONG"
    sens = 1 if L else -1
    if anticipation and d[k] == sens:
        stop = line[k]          # calculée avec le haut et le bas de CETTE barre
    else:
        stop = pos["trail"]     # la ligne connue à la clôture précédente
    if L and b["l"] <= stop:
        return min(b["o"], stop), "stop"
    if not L and b["h"] >= stop:
        return max(b["o"], stop), "stop"
    if k - pos["i"] >= 72:
        return b["c"], "time_stop"
    if d[k] != sens:
        return b["c"], "flip"
    pos["trail"] = line[k]
    return None


# ---- Donchian B′ ----------------------------------------------------------

def dn_signal(bars, ind, i):
    atr, ema100 = ind
    hi, lo = canal(bars, 20, i)
    if hi is None or atr[i] is None or ema100[i] is None:
        return None
    c = bars[i]["c"]
    dist = max(2 * atr[i], FLOOR * c)
    if c > hi and c > ema100[i]:
        return "LONG", c - dist
    if c < lo and c < ema100[i]:
        return "SHORT", c + dist
    return None


def dn_suivre(bars, ind, pos, k, anticipation):
    b = bars[k]
    L = pos["side"] == "LONG"
    e, r = pos["entree"], pos["r"]
    if L and b["l"] <= pos["stop"]:
        return min(b["o"], pos["stop"]), ("be_stop" if pos["be"] else "stop")
    if not L and b["h"] >= pos["stop"]:
        return max(b["o"], pos["stop"]), ("be_stop" if pos["be"] else "stop")
    cible = e + 3 * r if L else e - 3 * r
    if (L and b["h"] >= cible) or (not L and b["l"] <= cible):
        return cible, "t3r"
    if not pos["be"] and ((L and b["h"] >= e + r) or (not L and b["l"] <= e - r)):
        pos["be"] = True
        pos["stop"] = e
    hi10, lo10 = canal(bars, 10, k)
    if hi10 is not None and ((L and b["c"] < lo10) or (not L and b["c"] > hi10)):
        return b["c"], "donchian10_exit"
    if k - pos["i"] >= 48:
        return b["c"], "time_stop"
    return None


# ---- simulation ----------------------------------------------------------

def ouvrir(bars, side, stop, i, entree_suivante):
    if entree_suivante:
        if i + 1 >= len(bars):
            return None
        e, i0 = bars[i + 1]["o"], i + 1
    else:
        e, i0 = bars[i]["c"], i
    r = abs(e - stop)
    if e <= 0 or r <= 0:
        return None
    # Entrée à l'ouverture : le reste de la barre d'entrée est déjà en risque.
    # Entrée à la clôture : la première barre gérée est la suivante.
    gere_des = i0 if entree_suivante else i0 + 1
    return {"side": side, "entree": e, "stop": stop, "trail": stop, "r": r,
            "i": i0, "be": False, "gere_des": gere_des}


def clore(pos, px, motif, bars, k, fee, fnd):
    L = pos["side"] == "LONG"
    e, r = pos["entree"], pos["r"]
    brut = (px - e) if L else (e - px)
    frais = fee * (e + px)
    f = fnd.somme(bars[pos["i"]]["t"], bars[k]["t"]) * e if fnd else 0.0
    fin = f if L else -f
    return {"R": (brut - frais - fin) / r, "R_brut": brut / r, "motif": motif,
            "side": pos["side"], "barres": k - pos["i"], "stop_frac": r / e}


def portefeuille(series, strat, fee, anticipation=False, entree_suivante=False, fnds=None):
    """Une seule position à la fois, tous actifs confondus, priorité dans l'ordre de `series`."""
    noms = list(series)
    n = min(len(series[t]["bars"]) for t in noms)
    trades, pos, qui = [], None, None
    for k in range(1, n):
        if pos is not None:
            bars, ind = series[qui]["bars"], series[qui]["ind"]
            if k >= pos["gere_des"]:
                suivi = (st_suivre if strat == "st" else dn_suivre)(bars, ind, pos, k, anticipation)
                if suivi:
                    t = clore(pos, suivi[0], suivi[1], bars, k, fee, (fnds or {}).get(qui))
                    t["ticker"] = qui
                    trades.append(t)
                    pos = None
        if pos is None:
            for tkr in noms:
                bars, ind = series[tkr]["bars"], series[tkr]["ind"]
                sig = st_signal(ind, k) if strat == "st" else dn_signal(bars, ind, k)
                if not sig:
                    continue
                side, stop = sig
                p = ouvrir(bars, side, stop, k, entree_suivante)
                if p is None:
                    continue
                if strat == "st" and p["r"] / p["entree"] < FLOOR:
                    continue
                pos, qui = p, tkr
                break
    return trades


def metriques(trades):
    if not trades:
        return None
    Rs = [t["R"] for t in trades]
    gains = sum(x for x in Rs if x > 0)
    pertes = -sum(x for x in Rs if x <= 0)
    cum = pic = dd = 0.0
    for x in Rs:
        cum += x
        pic = max(pic, cum)
        dd = min(dd, cum - pic)
    return {
        "n": len(Rs),
        "reussite": sum(1 for x in Rs if x > 0) / len(Rs),
        "E_R": statistics.fmean(Rs),
        "PF": gains / pertes if pertes > 0 else float("inf"),
        "max_dd_pct": dd * RISK_BT * 100,
        "R_total": sum(Rs),
    }


# ---- modèles nuls ---------------------------------------------------------

def nul_st(series, trades, tirages, fee, rng):
    """Entrées au hasard DANS le sens de la tendance Supertrend en cours, mêmes sorties."""
    noms = list(series)
    par_ticker = {t: sum(1 for x in trades if x["ticker"] == t) for t in noms}
    moyennes = []
    for _ in range(tirages):
        rs = []
        for tkr, cnt in par_ticker.items():
            bars, ind = series[tkr]["bars"], series[tkr]["ind"]
            line, d = ind
            faits, essais = 0, 0
            while faits < cnt and essais < cnt * 50:
                essais += 1
                i = rng.randint(30, len(bars) - 80)
                if d[i] == 0 or line[i] is None:
                    continue
                side = "LONG" if d[i] > 0 else "SHORT"
                p = ouvrir(bars, side, line[i], i, False)
                if p is None or p["r"] / p["entree"] < FLOOR:
                    continue
                for k in range(i + 1, len(bars)):
                    s = st_suivre(bars, ind, p, k, False)
                    if s:
                        rs.append(clore(p, s[0], s[1], bars, k, fee, None)["R"])
                        break
                faits += 1
        if rs:
            moyennes.append(statistics.fmean(rs))
    return moyennes


def nul_dn(series, trades, tirages, fee, rng):
    """Même sens, même distance de stop, entrées au hasard, mêmes sorties."""
    gab = [(t["ticker"], t["side"], t["stop_frac"]) for t in trades]
    moyennes = []
    for _ in range(tirages):
        rs = []
        for (tkr, side, sf) in gab:
            bars, ind = series[tkr]["bars"], series[tkr]["ind"]
            i = rng.randint(30, len(bars) - 60)
            e = bars[i]["c"]
            stop = e * (1 - sf) if side == "LONG" else e * (1 + sf)
            p = ouvrir(bars, side, stop, i, False)
            if p is None:
                continue
            for k in range(i + 1, len(bars)):
                s = dn_suivre(bars, ind, p, k, False)
                if s:
                    rs.append(clore(p, s[0], s[1], bars, k, fee, None)["R"])
                    break
        if rs:
            moyennes.append(statistics.fmean(rs))
    return moyennes


# ---- campagne ------------------------------------------------------------

def charger(cache, coin, strat):
    raw = cached(cache, f"c_{coin}_1h.json", lambda: None)
    if not raw or len(raw) < 800:
        return None
    bars = [{"t": int(c["t"]), "o": float(c["o"]), "h": float(c["h"]),
             "l": float(c["l"]), "c": float(c["c"])} for c in raw]
    if strat == "st":
        ind = supertrend(bars)
    else:
        ind = (wilder(true_range(bars), 14), ema([b["c"] for b in bars], 100))
    return {"bars": bars, "ind": ind}


def ligne(nom, m):
    if m is None:
        return f"  {nom:<44} —"
    s = (f"  {nom:<44} n={m['n']:>4}  réussite {m['reussite']*100:5.1f} %  "
         f"E[R] {m['E_R']:+.3f}  PF {m['PF']:.2f}  maxDD {m['max_dd_pct']:+.1f} %")
    return s


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True)
    ap.add_argument("--tirages", type=int, default=2000)
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "resultats.json"))
    args = ap.parse_args()
    rng = random.Random(SEED)
    sortie = {}

    for strat, titre, declare in (
        ("st", "SUPERTREND V3-1B", "n=120  réussite 55,8 %  E[R] +0,222  PF 1,92  maxDD −2,3 %"),
        ("dn", "DONCHIAN B′", "n=193  réussite 29 %    E[R] +0,106  PF 1,24  maxDD −3,7 %"),
    ):
        series = {t: charger(args.cache, t, strat) for t in TICKERS}
        fnds = {t: Funding(cached(args.cache, f"f_{t}.json", lambda: [])) for t in TICKERS}
        print("=" * 100)
        print(f"{titre} — BTC/ETH/SOL 1h, 208 jours")
        print("=" * 100)
        print(f"  {'déclaré par le desk':<44} {declare}")
        print()

        variantes = {}
        for nom, kw in (
            ("correcte · 3,5 bps", dict(fee=0.00035)),
            ("à anticipation · 3,5 bps", dict(fee=0.00035, anticipation=True)),
            ("correcte · entrée barre suivante · 3,5 bps", dict(fee=0.00035, entree_suivante=True)),
            ("correcte · 4,5 bps (taux réel du compte)", dict(fee=0.00045)),
            ("correcte · 4,5 bps + financement", dict(fee=0.00045, fnds=fnds)),
        ):
            tr = portefeuille(series, strat, **kw)
            variantes[nom] = tr
            print(ligne(nom, metriques(tr)))

        base = variantes["correcte · 3,5 bps"]
        m = metriques(base)
        motifs = {}
        for t in base:
            motifs[t["motif"]] = motifs.get(t["motif"], 0) + 1
        print()
        print(f"  motifs de sortie (correcte) : {dict(sorted(motifs.items(), key=lambda x: -x[1]))}")
        par_t = {t: metriques([x for x in base if x["ticker"] == t]) for t in TICKERS}
        print("  par actif (correcte)        : " +
              " · ".join(f"{t} n={v['n']} E[R] {v['E_R']:+.3f}" for t, v in par_t.items() if v))

        nul = (nul_st if strat == "st" else nul_dn)(series, base, args.tirages, 0.00035, rng)
        p = (sum(1 for x in nul if x >= m["E_R"]) + 1) / (len(nul) + 1)
        print()
        print(f"  modèle nul ({len(nul)} tirages)      : E[R] moyen {statistics.fmean(nul):+.3f}  "
              f"(écart-type {statistics.pstdev(nul):.3f})")
        print(f"  stratégie, correcte          : E[R] {m['E_R']:+.3f}   →   p = {p:.4f}   "
              f"(plancher {1/(len(nul)+1):.4f})")

        # hors échantillon : mêmes règles, un actif à la fois
        print()
        print("  hors échantillon — mêmes règles figées, un actif à la fois, correcte, 3,5 bps :")
        hors = []
        for coin in AUTRES:
            s = charger(args.cache, coin, strat)
            if s is None:
                continue
            tr = portefeuille({coin: s}, strat, fee=0.00035)
            mm = metriques(tr)
            if mm and mm["n"] >= 12:
                hors.append((coin, mm))
        pos = sum(1 for _, mm in hors if mm["E_R"] > 0)
        print("   " + " · ".join(f"{c} {mm['E_R']:+.2f}" for c, mm in hors))
        print(f"   → {pos} actifs sur {len(hors)} à E[R] positif · "
              f"E[R] médian {statistics.median(mm['E_R'] for _, mm in hors):+.3f}")
        print()

        sortie[strat] = {
            "declare": declare,
            "variantes": {k: metriques(v) for k, v in variantes.items()},
            "nul": {"tirages": len(nul), "E_R_moyen": statistics.fmean(nul),
                    "ecart_type": statistics.pstdev(nul), "p": p},
            "hors_echantillon": {c: mm for c, mm in hors},
        }

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(sortie, f, indent=1, ensure_ascii=False)
    print(f"résultats écrits dans {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
