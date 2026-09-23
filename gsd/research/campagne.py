#!/usr/bin/env python3
"""
Campagne de mesure des deux moteurs du GSD.

Les règles sont dans PRE-ENREGISTREMENT.md, écrit avant ce fichier. Rien ici
ne doit s'en écarter sans que la déviation soit déclarée là-bas.

    python3 research/campagne.py --cache /chemin/cache --out research/resultats.json

Le script écrit après CHAQUE cellule : une écriture finale unique a déjà coûté
une campagne entière au desk lors d'un recyclage de machine.
"""

from __future__ import annotations

import argparse
import bisect
import json
import os
import random
import statistics
import sys
import time
import urllib.error
import urllib.request

API = "https://api.hyperliquid.xyz/info"

# ---- constantes pré-enregistrées -------------------------------------------

IN_SAMPLE = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "AVAX", "LINK", "SUI", "APT"]
INTERVALS = ["15m", "1h", "4h", "12h"]
MIN_BARS = 800
MIN_TRADES = 10
DRAWS = 2000
FEE_ONE_WAY = 0.00045          # taker Hyperliquid, à l'aller et au retour
DONCHIAN_PERIOD = 20
ST_PERIOD, ST_MULT = 10, 3
RR = 1.5
WARMUP = 25                    # `i >= 25` dans readEngines
MS = {"15m": 900_000, "1h": 3_600_000, "4h": 14_400_000, "12h": 43_200_000, "1d": 86_400_000}

SEED = 20260923                # fixé : la campagne est reproductible


# ---- réseau ----------------------------------------------------------------

def post(body: dict, tries: int = 5):
    for k in range(tries):
        try:
            req = urllib.request.Request(
                API, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read())
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            if k == tries - 1:
                raise
            time.sleep(1.5 * (k + 1))


def cached(cache: str, name: str, produce):
    path = os.path.join(cache, name)
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    data = produce()
    os.makedirs(cache, exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f)
    os.replace(tmp, path)
    return data


def fetch_candles(coin: str, interval: str, pages: int = 4) -> list[dict]:
    """Remonte le temps par fenêtres de 5000 barres, jusqu'à épuisement."""
    step = MS[interval]
    end = int(time.time() * 1000)
    out: dict[int, dict] = {}
    for _ in range(pages):
        start = end - 5000 * step
        rows = post({"type": "candleSnapshot",
                     "req": {"coin": coin, "interval": interval, "startTime": start, "endTime": end}})
        if not rows:
            break
        avant = len(out)
        for c in rows:
            out[int(c["t"])] = c
        if len(out) == avant:
            break
        end = min(int(c["t"]) for c in rows) - 1
        time.sleep(0.12)
    return [out[t] for t in sorted(out)]


def fetch_funding(coin: str, start_ms: int) -> list[dict]:
    """Financement horaire réel, paginé vers l'avant."""
    out: dict[int, float] = {}
    t = start_ms
    for _ in range(40):
        rows = post({"type": "fundingHistory", "coin": coin, "startTime": t})
        if not rows:
            break
        avant = len(out)
        for r in rows:
            out[int(r["time"])] = float(r["fundingRate"])
        if len(out) == avant:
            break
        t = max(int(r["time"]) for r in rows) + 1
        if t > time.time() * 1000:
            break
        time.sleep(0.12)
    return [{"t": k, "r": out[k]} for k in sorted(out)]


# ---- indicateurs : port littéral de indicators.ts --------------------------

def true_range(bars):
    out = []
    for i, b in enumerate(bars):
        if i == 0:
            out.append(b["h"] - b["l"])
        else:
            p = bars[i - 1]["c"]
            out.append(max(b["h"] - b["l"], abs(b["h"] - p), abs(b["l"] - p)))
    return out


def wilder(values, period):
    out = [None] * len(values)
    if len(values) < period:
        return out
    prev = sum(values[:period]) / period
    out[period - 1] = prev
    for i in range(period, len(values)):
        prev = (prev * (period - 1) + values[i]) / period
        out[i] = prev
    return out


def atr(bars, period):
    return wilder(true_range(bars), period)


def donchian(bars, period=DONCHIAN_PERIOD):
    """Sur les HAUTS et BAS, comme indicators.ts — pas sur les clôtures."""
    n = len(bars)
    hi: list[float | None] = [None] * n
    lo: list[float | None] = [None] * n
    highs = [b["h"] for b in bars]
    lows = [b["l"] for b in bars]
    for i in range(period - 1, n):
        hi[i] = max(highs[i - period + 1 : i + 1])
        lo[i] = min(lows[i - period + 1 : i + 1])
    return hi, lo


def supertrend(bars, period=ST_PERIOD, mult=ST_MULT):
    n = len(bars)
    a = atr(bars, period)
    line: list[float | None] = [None] * n
    direction = [0] * n
    prev_line = None
    prev_dir = 1
    for i in range(n):
        av = a[i]
        if av is None:
            continue
        hl2 = (bars[i]["h"] + bars[i]["l"]) / 2
        upper = hl2 + mult * av
        lower = hl2 - mult * av
        if prev_line is not None:
            if prev_dir == 1:
                lower = max(lower, prev_line)
            else:
                upper = min(upper, prev_line)
        d = prev_dir
        if prev_line is not None:
            if prev_dir == 1 and bars[i]["c"] < prev_line:
                d = -1
            elif prev_dir == -1 and bars[i]["c"] > prev_line:
                d = 1
        L = lower if d == 1 else upper
        line[i] = L
        direction[i] = d
        prev_line = L
        prev_dir = d
    return line, direction


# ---- le moteur de signal : port littéral de readEngines --------------------

def signals(bars):
    """
    Un signal par barre au plus, Donchian prioritaire.

    Les indicateurs sont causals, donc les calculer une fois sur toute la série
    et évaluer la condition à l'indice i est identique à rejouer readEngines
    avec bars[:i+2]. C'est vérifié par test.
    """
    hi, lo = donchian(bars)
    st_line, st_dir = supertrend(bars)
    out = []
    for i in range(WARMUP, len(bars)):
        px = bars[i]["c"]
        d_hi, d_lo, p_hi, p_lo = hi[i], lo[i], hi[i - 1], lo[i - 1]
        sig = None

        if p_hi is not None and bars[i - 1]["c"] <= p_hi and d_hi is not None and px > p_hi:
            stop = d_lo if d_lo is not None else px * 0.97
            sig = ("LONG", stop, px + (px - stop) * RR, "Donchian")
        elif p_lo is not None and bars[i - 1]["c"] >= p_lo and d_lo is not None and px < p_lo:
            stop = d_hi if d_hi is not None else px * 1.03
            sig = ("SHORT", stop, px - (stop - px) * RR, "Donchian")

        if sig is None:
            sd, sp, sl = st_dir[i], st_dir[i - 1], st_line[i]
            # `0` est falsy en JS : un retournement depuis une direction nulle
            # ne compte pas. Le port le reproduit.
            if sd and sp and sd != sp and sl is not None:
                side = "LONG" if sd == 1 else "SHORT"
                tgt = px + (px - sl) * RR if side == "LONG" else px - (sl - px) * RR
                sig = (side, sl, tgt, "Supertrend")

        if sig is not None:
            out.append((i, *sig))
    return out


# ---- financement -----------------------------------------------------------

class Funding:
    """Somme des taux horaires sur une fenêtre, par préfixes."""

    def __init__(self, rows):
        self.times = [r["t"] for r in rows]
        self.cum = [0.0]
        for r in rows:
            self.cum.append(self.cum[-1] + r["r"])

    def somme(self, t0: int, t1: int) -> float:
        a = bisect.bisect_left(self.times, t0)
        b = bisect.bisect_right(self.times, t1)
        return self.cum[b] - self.cum[a]


# ---- exécution -------------------------------------------------------------

def joue(bars, fnd: Funding, i: int, side: str, stop: float, target: float, max_bars: int | None):
    """
    Entrée à l'ouverture de la barre i+1. Sortie intra-barre : le stop l'emporte
    s'il est touché dans la même barre que la cible.
    """
    j = i + 1
    if j >= len(bars):
        return None
    entree = bars[j]["o"]
    if entree <= 0:
        return None
    stop_frac = abs(entree - stop) / entree
    if not (stop_frac > 0):
        return None

    fin = len(bars) - 1 if max_bars is None else min(len(bars) - 1, j + max_bars)
    sortie, motif = None, "fin_de_serie"
    for k in range(j, fin + 1):
        b = bars[k]
        if side == "LONG":
            if b["l"] <= stop:
                sortie, motif = stop, "stop"
                break
            if b["h"] >= target:
                sortie, motif = target, "cible"
                break
        else:
            if b["h"] >= stop:
                sortie, motif = stop, "stop"
                break
            if b["l"] <= target:
                sortie, motif = target, "cible"
                break
    else:
        k = fin
    if sortie is None:
        sortie = bars[k]["c"]

    brut = (sortie - entree) / entree if side == "LONG" else (entree - sortie) / entree
    fin_t = bars[k]["t"]
    f = fnd.somme(bars[j]["t"], fin_t)
    fin_net = brut - 2 * FEE_ONE_WAY - (f if side == "LONG" else -f)
    return {
        "i": i, "side": side, "entree": entree, "sortie": sortie, "motif": motif,
        "barres": k - j + 1, "stop_frac": stop_frac, "brut": brut,
        "financement": (f if side == "LONG" else -f), "net": fin_net,
        "R": fin_net / stop_frac,
    }


def backtest(bars, fnd, sigs):
    trades, libre_a = [], -1
    for (i, side, stop, target, source) in sigs:
        if i <= libre_a:
            continue
        t = joue(bars, fnd, i, side, stop, target, None)
        if t is None:
            continue
        t["source"] = source
        trades.append(t)
        libre_a = i + t["barres"]
    return trades


def modele_nul(bars, fnd, trades, draws, rng):
    """
    Même nombre de trades, même sens, même distance de stop, même 1,5 R —
    entrées tirées au hasard. Le nul paie donc les mêmes frais et subit le même
    financement : ce qui reste de l'écart est du signal, pas du coût.
    """
    lo_i, hi_i = WARMUP, len(bars) - 3
    if hi_i <= lo_i:
        return None
    gabarits = [(t["side"], t["stop_frac"], t["barres"]) for t in trades]
    moyennes = []
    for _ in range(draws):
        rs = []
        for (side, sf, nb) in gabarits:
            i = rng.randint(lo_i, hi_i)
            e = bars[i + 1]["o"]
            if e <= 0:
                continue
            stop = e * (1 - sf) if side == "LONG" else e * (1 + sf)
            tgt = e * (1 + RR * sf) if side == "LONG" else e * (1 - RR * sf)
            t = joue(bars, fnd, i, side, stop, tgt, nb * 4)
            if t is not None:
                rs.append(t["R"])
        if rs:
            moyennes.append(statistics.fmean(rs))
    return moyennes


def benjamini_hochberg(pvals, alpha=0.05):
    m = len(pvals)
    ordonne = sorted(range(m), key=lambda k: pvals[k])
    survivants, seuils = [], {}
    kmax = 0
    for rang, k in enumerate(ordonne, start=1):
        seuils[k] = alpha * rang / m
        if pvals[k] <= seuils[k]:
            kmax = rang
    for rang, k in enumerate(ordonne, start=1):
        if rang <= kmax:
            survivants.append(k)
    return survivants, seuils


# ---- campagne --------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--draws", type=int, default=DRAWS)
    ap.add_argument("--intervals", default=",".join(INTERVALS))
    args = ap.parse_args()

    intervals = [x for x in args.intervals.split(",") if x]
    rng = random.Random(SEED)

    univers = cached(args.cache, "meta.json", lambda: post({"type": "meta"}))["universe"]
    noms = [a["name"] for a in univers]
    hors = [n for n in noms if n not in IN_SAMPLE][:10]
    actifs = [(n, "in") for n in IN_SAMPLE] + [(n, "hors") for n in hors]

    resultat = {
        "genere": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "graine": SEED,
        "tirages": args.draws,
        "plancher_p": 1.0 / (args.draws + 1),
        "frais_bps_aller": FEE_ONE_WAY * 10000,
        "in_sample": IN_SAMPLE,
        "hors_echantillon": hors,
        "intervalles": intervals,
        "cellules": [],
        "exclues": [],
    }
    print(f"in-sample       : {' '.join(IN_SAMPLE)}")
    print(f"hors-échantillon: {' '.join(hors)}   (calculé depuis l'ordre de listing HL)")
    print(f"plancher de p   : {resultat['plancher_p']:.6f}\n")

    def ecrire():
        tmp = args.out + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(resultat, f, indent=1)
        os.replace(tmp, args.out)

    for coin, groupe in actifs:
        for iv in intervals:
            tag = f"{coin} {iv}"
            try:
                raw = cached(args.cache, f"c_{coin}_{iv}.json", lambda: fetch_candles(coin, iv))
            except Exception as e:
                resultat["exclues"].append({"cellule": tag, "raison": f"bougies: {e}"})
                ecrire()
                continue
            bars = [{"t": int(c["t"]), "o": float(c["o"]), "h": float(c["h"]),
                     "l": float(c["l"]), "c": float(c["c"])} for c in raw]
            if len(bars) < MIN_BARS:
                resultat["exclues"].append({"cellule": tag, "raison": f"{len(bars)} barres < {MIN_BARS}"})
                print(f"  {tag:<12} écartée — {len(bars)} barres")
                ecrire()
                continue
            try:
                frows = cached(args.cache, f"f_{coin}.json", lambda: fetch_funding(coin, bars[0]["t"]))
            except Exception:
                frows = []
            fnd = Funding(frows)

            sigs = signals(bars)
            trades = backtest(bars, fnd, sigs)
            if len(trades) < MIN_TRADES:
                resultat["exclues"].append({"cellule": tag, "raison": f"{len(trades)} trades < {MIN_TRADES}"})
                print(f"  {tag:<12} écartée — {len(trades)} trades")
                ecrire()
                continue

            Rs = [t["R"] for t in trades]
            nets = [t["net"] for t in trades]
            moyenne = statistics.fmean(Rs)
            nul = modele_nul(bars, fnd, trades, args.draws, rng)
            if not nul:
                p = None
            else:
                p = (sum(1 for m in nul if m >= moyenne) + 1) / (len(nul) + 1)

            cell = {
                "cellule": tag, "coin": coin, "interval": iv, "groupe": groupe,
                "barres": len(bars), "signaux": len(sigs), "trades": len(trades),
                "R_moyen": moyenne,
                "R_total": sum(Rs),
                "net_total_pct": sum(nets) * 100,
                "taux_reussite": sum(1 for t in trades if t["net"] > 0) / len(trades),
                "frais_pct": len(trades) * 2 * FEE_ONE_WAY * 100,
                "financement_pct": sum(t["financement"] for t in trades) * 100,
                "duree_mediane_barres": statistics.median(t["barres"] for t in trades),
                "part_donchian": sum(1 for t in trades if t["source"] == "Donchian") / len(trades),
                "p_nul": p,
                "nul_R_moyen": statistics.fmean(nul) if nul else None,
            }
            resultat["cellules"].append(cell)
            ecrire()
            marque = "" if p is None or p > 0.05 else "  <-- p<0.05 brut"
            print(f"  {tag:<12} {len(trades):>4} trades · R moyen {moyenne:+.4f} · "
                  f"nul {cell['nul_R_moyen']:+.4f} · p {p:.5f}{marque}")

    # ---- correction de multiplicité ----
    cells = [c for c in resultat["cellules"] if c["p_nul"] is not None]
    if cells:
        pv = [c["p_nul"] for c in cells]
        surv, seuils = benjamini_hochberg(pv)
        for k, c in enumerate(cells):
            c["seuil_bh"] = seuils[k]
            c["survivante"] = k in surv
        resultat["verdict"] = {
            "cellules_testees": len(cells),
            "p_brut_sous_0.05": sum(1 for p in pv if p <= 0.05),
            "attendu_par_hasard": 0.05 * len(cells),
            "survivantes_bh": [cells[k]["cellule"] for k in surv],
            "plancher_p": resultat["plancher_p"],
            "seuil_bh_rang_1": 0.05 / len(cells),
            "plancher_sous_le_seuil": resultat["plancher_p"] < 0.05 / len(cells),
        }
    ecrire()
    print(f"\nrésultats écrits dans {args.out}")


if __name__ == "__main__":
    sys.exit(main())
