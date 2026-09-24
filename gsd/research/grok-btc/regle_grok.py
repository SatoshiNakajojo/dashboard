#!/usr/bin/env python3
"""
La règle BTC proposée par Grok — Donchian 25/10, long seul, une fois le
notionnel — reproduite, puis confrontée à un modèle nul, à une grille, aux
dates de départ, et à 2013–2020, période que Grok n'a pas vue.
Le protocole est `PRE-ENREGISTREMENT.md`, commité avant ce fichier.

    PYTHONPATH=<numpy> python3 regle_grok.py --cache /chemin/cache

Le cache reçoit les bougies et le funding d'Hyperliquid et le CSV public de
CoinMetrics. Rien de tout ça n'est commité ; `resultats.json` l'est.

Quatre exécutions de la même règle :
  A  ordres stop intrajournaliers aux niveaux du canal, remplis au pire de
     l'ouverture et du niveau (ce qu'une exécution réelle ferait) ;
  B  signal et exécution à la clôture, canal sur les plus hauts / plus bas ;
  C  signal à la clôture, exécution à l'ouverture suivante ;
  D  clôtures seulement, canal sur les clôtures — la seule version jouable
     sur CoinMetrics, donc celle du modèle nul et du hors échantillon.

Choix fixé avant de voir la grille : le critère « plateau » doit tenir pour
A et pour D en 2020–2026, et pour D en 2013–2020.
"""

from __future__ import annotations

import argparse
import calendar
import csv
import json
import math
import statistics
import time
import urllib.request
from pathlib import Path

import numpy as np

FEE = 0.00045
DAY = 86_400_000
ENTREES = (10, 15, 20, 25, 30, 40, 55, 70, 100)
SORTIES = (5, 10, 15, 20, 30)
DECALAGE_MIN = 30


# ---- données ------------------------------------------------------------------

def _post(body):
    req = urllib.request.Request("https://api.hyperliquid.xyz/info", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=60).read())


def hl_journalier(cache: Path):
    f = cache / "hl_btc_1d.json"
    if not f.exists():
        f.write_text(json.dumps(_post({"type": "candleSnapshot", "req": {
            "coin": "BTC", "interval": "1d", "startTime": 1_500_000_000_000,
            "endTime": int(time.time() * 1000)}})))
    brut = json.loads(f.read_text())
    fin = int(f.stat().st_mtime * 1000)
    closes = [b for b in brut if int(b["t"]) + DAY <= fin]  # la bougie en cours est écartée
    return {k: np.array([float(b[k]) for b in closes]) for k in "ohlc"} | {
        "t": np.array([int(b["t"]) for b in closes])}


def hl_funding(cache: Path, debut_ms: int, fin_ms: int):
    f = cache / "hl_btc_funding.json"
    if not f.exists():
        out, t = [], debut_ms
        while t < fin_ms:
            page = _post({"type": "fundingHistory", "coin": "BTC", "startTime": t, "endTime": fin_ms})
            if not page:
                break
            out += page
            t = int(page[-1]["time"]) + 1
            if len(page) < 500:
                break
        f.write_text(json.dumps(out))
    par_jour: dict[int, float] = {}
    for x in json.loads(f.read_text()):
        j = int(x["time"]) // DAY * DAY
        par_jour[j] = par_jour.get(j, 0.0) + float(x["fundingRate"])
    return par_jour


def coinmetrics(cache: Path):
    f = cache / "cm_btc.csv"
    if not f.exists():
        url = "https://raw.githubusercontent.com/coinmetrics/data/master/csv/btc.csv"
        f.write_bytes(urllib.request.urlopen(url, timeout=180).read())
    t, c = [], []
    for r in csv.DictReader(f.open()):
        if r.get("PriceUSD"):
            t.append(calendar.timegm(time.strptime(r["time"][:10], "%Y-%m-%d")) * 1000)
            c.append(float(r["PriceUSD"]))
    c = np.array(c)
    return {"t": np.array(t), "o": c, "h": c, "l": c, "c": c}


def fenetre(b, debut_ms, fin_ms):
    m = (b["t"] >= debut_ms) & (b["t"] <= fin_ms)
    return {k: v[m] for k, v in b.items()}


def ms(date):
    return calendar.timegm(time.strptime(date, "%Y-%m-%d")) * 1000


def jour(t):
    return time.strftime("%d/%m/%Y", time.gmtime(t / 1000))


# ---- la règle -----------------------------------------------------------------

def jouer(b, N, M, mode, depuis=0, funding=None, fee=FEE):
    """Équité quotidienne à la clôture, exposition de clôture à clôture, trades.

    Les canaux utilisent les barres AVANT `depuis` comme historique : la règle
    démarre à plat à `depuis`, et le comptant aussi.
    """
    o, h, l, c, t = b["o"], b["h"], b["l"], b["c"], b["t"]
    n = len(c)
    haut = h if mode in "ABC" else c
    bas = l if mode in "ABC" else c
    E, u = 1.0, 0.0
    ent_px = ent_i = ent_E = None
    eq = np.ones(n)
    expo = np.zeros(n)  # 1 si la position est tenue de la clôture t-1 à la clôture t
    trades = []
    attente = None      # mode C : ordre à exécuter à l'ouverture suivante

    def entrer(px, i):
        nonlocal E, u, ent_px, ent_i, ent_E
        u, ent_px, ent_i, ent_E = E * (1 - fee) / px, px, i, E

    def sortir(px, i):
        nonlocal E, u, ent_px, ent_i
        E = u * px * (1 - fee)
        trades.append({"entree": int(t[ent_i]), "sortie": int(t[i]), "px_e": ent_px, "px_s": px,
                       "r": E / ent_E - 1, "jours": i - ent_i})
        u, ent_px, ent_i = 0.0, None, None

    for i in range(n):
        tenu_veille = u > 0
        if funding is not None and tenu_veille:
            u *= 1 - funding.get(int(t[i]), 0.0)
        if i >= depuis and i >= max(N, M):
            H = haut[i - N:i].max()
            L = bas[i - M:i].min()
            if mode == "A":
                if u > 0 and l[i] <= L:
                    sortir(min(o[i], L), i)
                elif u == 0 and h[i] >= H:
                    entrer(max(o[i], H), i)
            elif mode in "BD":
                if u > 0 and c[i] < L:
                    sortir(c[i], i)
                elif u == 0 and c[i] > H:
                    entrer(c[i], i)
            elif mode == "C":
                if attente == "sortie" and u > 0:
                    sortir(o[i], i)
                elif attente == "entree" and u == 0:
                    entrer(o[i], i)
                attente = None
                if u > 0 and c[i] < L:
                    attente = "sortie"
                elif u == 0 and c[i] > H:
                    attente = "entree"
        expo[i] = 1.0 if tenu_veille else 0.0
        eq[i] = u * c[i] if u > 0 else E
    ouvert = None
    if u > 0:
        ouvert = {"entree": int(t[ent_i]), "px_e": ent_px, "r_latent": u * c[-1] / ent_E - 1}
    return eq[depuis:] / eq[depuis], expo[depuis:], trades, ouvert


def comptant(b, depuis=0, fee=FEE):
    c = b["c"][depuis:]
    return c / c[0] * (1 - fee)


def repli(eq):
    return float((eq / np.maximum.accumulate(eq) - 1).min())


def mesures(eq, t):
    ans = (t[-1] - t[0]) / DAY / 365.25
    tcac = eq[-1] ** (1 / ans) - 1 if ans > 0 else 0.0
    dd = repli(eq)
    return {"total": float(eq[-1] - 1), "tcac": float(tcac), "repli": dd,
            "mar": float(tcac / abs(dd)) if dd < 0 else float("inf")}


def par_annee(eq, t):
    out, ref = {}, eq[0]
    annees = [time.gmtime(x / 1000).tm_year for x in t]
    for i, a in enumerate(annees):
        if i + 1 == len(annees) or annees[i + 1] != a:
            out[a] = float(eq[i] / ref - 1)
            ref = eq[i]
    return out


# ---- le modèle nul : décalage circulaire du calendrier d'exposition -------------

def decalage(c, expo, fee=FEE):
    lr = np.log(c[1:] / c[:-1])
    e = expo[1:]
    frais = -math.log(1 - fee)
    T = len(lr)

    def stat(x):
        transitions = int(np.abs(np.diff(np.concatenate([x, x[:1]]))).sum())
        chemin = np.cumsum(x * lr) - frais * np.cumsum(np.abs(np.diff(np.concatenate([[x[-1]], x]))))
        return float(chemin[-1]), repli(np.exp(np.concatenate([[0.0], chemin]))), transitions

    s_obs, dd_obs, _ = stat(e)
    ks = range(DECALAGE_MIN, T - DECALAGE_MIN + 1)
    s = np.array([stat(np.roll(e, k))[0] for k in ks])
    dd = np.array([stat(np.roll(e, k))[1] for k in ks])
    return {
        "observe_log": s_obs, "hasard_log_moyen": float(s.mean()),
        "p_rendement": float((np.sum(s >= s_obs) + 1) / (len(s) + 1)),
        "repli_observe": dd_obs, "repli_hasard_median": float(np.median(dd)),
        "p_repli": float((np.sum(dd >= dd_obs) + 1) / (len(dd) + 1)),
        "decalages": len(s), "plancher": 1 / (len(s) + 1),
    }


# ---- rapport ------------------------------------------------------------------

def pct(x):
    return f"{x * 100:+.0f} %"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path)
    ap.add_argument("--sortie", type=Path, default=Path(__file__).with_name("resultats.json"))
    args = ap.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    R: dict = {}

    hl = hl_journalier(args.cache)
    t0, t1 = int(hl["t"][0]), int(hl["t"][-1])
    fund = hl_funding(args.cache, ms("2024-01-01"), t1 + DAY)
    print(f"Hyperliquid BTC 1d : {len(hl['c'])} barres closes, {jour(t0)} → {jour(t1)}")

    # 1. Reproduction ------------------------------------------------------------
    bh = comptant(hl)
    print("\n1. REPRODUCTION — 25/10, frais 4,5 bps par côté")
    print(f"   annoncé par Grok      comptant +613 %, repli −77 % · règle +901 %, +710 % après funding, "
          f"repli −34 %, expo 37 %, réussite 43 %, trade médian −1,9 %")
    mb = mesures(bh, hl["t"])
    print(f"   comptant              total {pct(mb['total'])}  repli {pct(mb['repli'])}")
    R["reproduction"] = {"comptant": mb}
    for mode in "ABC":
        eq, ex, tr, ouv = jouer(hl, 25, 10, mode)
        m = mesures(eq, hl["t"])
        eqf, _, trf, _ = jouer(hl, 25, 10, mode, funding=fund)
        rs = [x["r"] for x in tr]
        ligne = {**m, "total_apres_funding": float(eqf[-1] - 1), "expo": float(ex.mean()),
                 "trades": len(tr), "reussite": sum(r > 0 for r in rs) / len(rs),
                 "trade_median": statistics.median(rs), "ouvert": ouv,
                 "annees": par_annee(eq, hl["t"])}
        R["reproduction"][mode] = ligne
        print(f"   variante {mode}            total {pct(m['total'])}  après funding {pct(ligne['total_apres_funding'])}  "
              f"repli {pct(m['repli'])}  expo {ligne['expo'] * 100:.0f} %  trades {len(tr)}  "
              f"réussite {ligne['reussite'] * 100:.0f} %  médian {ligne['trade_median'] * 100:+.1f} %"
              + (f"  (position ouverte depuis le {jour(ouv['entree'])})" if ouv else ""))
    ann_bh = par_annee(bh, hl["t"])
    R["reproduction"]["annees_comptant"] = ann_bh
    print("   par année   comptant  " + "  ".join(f"{a}:{pct(v)}" for a, v in ann_bh.items()))
    for mode in "ABC":
        print(f"               règle {mode}   " + "  ".join(
            f"{a}:{pct(v)}" for a, v in R["reproduction"][mode]["annees"].items()))

    # 2. Modèle nul, 2020–2026 (descriptif) ---------------------------------------
    eqD, exD, trD, _ = jouer(hl, 25, 10, "D")
    nul_is = decalage(hl["c"], exD)
    R["nul_2020_2026"] = nul_is
    print("\n2. TIMING CONTRE LE HASARD, 2020–2026 (descriptif : Grok a choisi ses paramètres ici)")
    print(f"   version clôture (D) : total {pct(mesures(eqD, hl['t'])['total'])}  "
          f"— rendement log {nul_is['observe_log']:+.2f} contre {nul_is['hasard_log_moyen']:+.2f} en moyenne "
          f"pour {nul_is['decalages']} décalages · p = {nul_is['p_rendement']:.3f} · repli {pct(nul_is['repli_observe'])} "
          f"contre {pct(nul_is['repli_hasard_median'])} médian, p = {nul_is['p_repli']:.3f}")

    # 3. Hors échantillon 2013–2020 ------------------------------------------------
    cm = coinmetrics(args.cache)
    commun = fenetre(cm, t0, min(t1, int(cm["t"][-1])))
    hl_commun = fenetre(hl, t0, int(commun["t"][-1]))
    fid_cm = mesures(jouer(commun, 25, 10, "D")[0], commun["t"])
    fid_hl = mesures(jouer(hl_commun, 25, 10, "D")[0], hl_commun["t"])
    R["fidelite_coinmetrics"] = {"coinmetrics": fid_cm, "hyperliquid": fid_hl,
                                 "periode": [jour(commun["t"][0]), jour(commun["t"][-1])]}
    print(f"\n3. HORS ÉCHANTILLON — fidélité de CoinMetrics sur la période commune "
          f"{jour(commun['t'][0])} → {jour(commun['t'][-1])}, version D :")
    print(f"   Hyperliquid total {pct(fid_hl['total'])} repli {pct(fid_hl['repli'])} · "
          f"CoinMetrics total {pct(fid_cm['total'])} repli {pct(fid_cm['repli'])}")
    R["hors_echantillon"] = {}
    for debut, verdict in (("2013-01-01", True), ("2015-01-01", False), ("2017-01-01", False)):
        oos = fenetre(cm, ms(debut) - 150 * DAY, ms("2020-08-18"))
        d = int(np.searchsorted(oos["t"], ms(debut)))
        eq, ex, tr, _ = jouer(oos, 25, 10, "D", depuis=d)
        tt = oos["t"][d:]
        m, mb = mesures(eq, tt), mesures(comptant(oos, d), tt)
        nul = decalage(oos["c"][d:], ex)
        rs = [x["r"] for x in tr]
        R["hors_echantillon"][debut] = {"regle": m, "comptant": mb, "nul": nul, "expo": float(ex.mean()),
                                        "trades": len(tr), "reussite": sum(r > 0 for r in rs) / len(rs),
                                        "annees": par_annee(eq, tt), "annees_comptant": par_annee(comptant(oos, d), tt),
                                        "entre_dans_le_verdict": verdict}
        print(f"   depuis le {jour(ms(debut))}{'' if verdict else ' (sensibilité)'} : règle total {pct(m['total'])} "
              f"repli {pct(m['repli'])} MAR {m['mar']:.2f} · comptant total {pct(mb['total'])} repli {pct(mb['repli'])} "
              f"MAR {mb['mar']:.2f} · expo {ex.mean() * 100:.0f} % · {len(tr)} trades · p timing = {nul['p_rendement']:.3f} "
              f"(plancher {nul['plancher']:.4f}) · p repli = {nul['p_repli']:.3f}")
    oos13 = R["hors_echantillon"]["2013-01-01"]
    print("   par année (2013→)  règle    " + "  ".join(f"{a}:{pct(v)}" for a, v in oos13["annees"].items()))
    print("                      comptant " + "  ".join(f"{a}:{pct(v)}" for a, v in oos13["annees_comptant"].items()))

    # 4. Grille --------------------------------------------------------------------
    print("\n4. GRILLE — part des combinaisons qui battent le comptant en MAR")
    R["grille"] = {}
    hl_g = hl
    d_hl = 100
    cm_g = fenetre(cm, ms("2013-01-01") - 150 * DAY, ms("2020-08-18"))
    d_cm = int(np.searchsorted(cm_g["t"], ms("2013-01-01")))
    for nom, b, d, mode in (("2020-2026 A", hl_g, d_hl, "A"), ("2020-2026 D", hl_g, d_hl, "D"),
                            ("2013-2020 D", cm_g, d_cm, "D")):
        tt = b["t"][d:]
        mar_bh = mesures(comptant(b, d), tt)["mar"]
        cases = {}
        for N in ENTREES:
            for M in SORTIES:
                cases[f"{N}/{M}"] = mesures(jouer(b, N, M, mode, depuis=d)[0], tt)["mar"]
        bat = sum(v > mar_bh for v in cases.values()) / len(cases)
        rang = sorted(cases.values(), reverse=True).index(cases["25/10"]) + 1
        R["grille"][nom] = {"mar_comptant": mar_bh, "part_qui_bat": bat, "rang_25_10": rang,
                            "cases": cases, "evaluation_depuis": jour(tt[0])}
        print(f"   {nom} (évaluée depuis le {jour(tt[0])}) : {bat * 100:.0f} % battent le comptant "
              f"(MAR {mar_bh:.2f}) · 25/10 au rang {rang} sur {len(cases)} · MAR 25/10 = {cases['25/10']:.2f}")
        entete = "        " + "".join(f"{M:>7}" for M in SORTIES)
        print(entete)
        for N in ENTREES:
            print(f"   {N:>4} " + "".join(f"{cases[f'{N}/{M}']:>7.2f}" for M in SORTIES))

    # 5. Dates de départ -----------------------------------------------------------
    print("\n5. DATES DE DÉPART (variante A) — la règle bat-elle le comptant au " + jour(t1) + " ?")
    departs = []
    for a in range(2020, 2026):
        for mo in range(1, 13):
            s = ms(f"{a}-{mo:02d}-01")
            if s < ms("2020-09-01") or s > ms("2025-09-01"):
                continue
            d = int(np.searchsorted(hl["t"], s))
            eq, _, _, _ = jouer(hl, 25, 10, "A", depuis=d)
            bh_s = comptant(hl, d)
            departs.append({"depart": jour(s), "regle": float(eq[-1] - 1), "comptant": float(bh_s[-1] - 1),
                            "repli_regle": repli(eq), "repli_comptant": repli(bh_s)})
    R["departs"] = departs
    part = sum(x["regle"] > x["comptant"] for x in departs) / len(departs)
    print(f"   {sum(x['regle'] > x['comptant'] for x in departs)} départs mensuels sur {len(departs)} "
          f"({part * 100:.0f} %) finissent devant le comptant en rendement ; "
          f"{sum(x['repli_regle'] > x['repli_comptant'] for x in departs)} ont un repli plus faible.")
    for a in range(2020, 2026):
        ds = [x for x in departs if x["depart"].endswith(str(a))]
        if ds:
            print(f"   départs en {a} : devant dans {sum(x['regle'] > x['comptant'] for x in ds)} cas sur {len(ds)}")

    args.sortie.write_text(json.dumps(R, indent=1, ensure_ascii=False, default=float))
    print(f"\nrésultats écrits dans {args.sortie}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
