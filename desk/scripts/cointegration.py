#!/usr/bin/env python3
"""Co-integration d'Engle-Granger, en Python pur.

`docs/strategies-arbitrage-statistique-cointegration.md` propose le pairs
trading : deux actifs individuellement non stationnaires dont une combinaison
lineaire l'est. Le spread oscille alors autour d'une moyenne stable, et c'est
lui qu'on trade — pas les prix.

C'est structurellement different de tout ce qui a ete teste jusqu'ici. Le
retour a la moyenne sur PRIX est un perdant etabli sur ces donnees ; le retour
a la moyenne sur SPREAD est une autre hypothese.

**Question prealable, et elle est eliminatoire** : existe-t-il seulement des
paires co-integrees ? Sans relation stable, la strategie n'a rien a trader.

Implemente sans numpy/scipy/statsmodels, que le depot n'embarque pas :
regression par equations normales, ADF sur les residus, valeurs critiques de
MacKinnon pour le cas a deux variables avec constante.

    python scripts/cointegration.py
"""

from __future__ import annotations

import argparse
import math
import sys
from itertools import combinations
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from trading_desk.backtest.data import DataUnavailable, load_from_file

ASSETS = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "AVAX"]

# Valeurs critiques de MacKinnon pour le test d'Engle-Granger a DEUX variables
# avec constante. Elles ne sont PAS celles d'un ADF ordinaire : l'estimation
# OLS prealable minimise artificiellement la variance des residus et biaise le
# test vers la stationnarite. Utiliser les valeurs standard ferait conclure a
# la co-integration bien trop souvent.
MACKINNON = {0.01: -3.90, 0.05: -3.34, 0.10: -3.04}


def ols(y: list[float], X: list[list[float]]) -> list[float]:
    """Moindres carres par equations normales et elimination de Gauss.

    Suffisant ici : les systemes font au plus quelques colonnes, et une
    dependance a numpy pour inverser une matrice 3x3 ne se justifie pas.
    """
    k = len(X[0])
    xtx = [[sum(X[r][i] * X[r][j] for r in range(len(X))) for j in range(k)]
           for i in range(k)]
    xty = [sum(X[r][i] * y[r] for r in range(len(X))) for i in range(k)]

    for col in range(k):
        pivot = max(range(col, k), key=lambda r: abs(xtx[r][col]))
        if abs(xtx[pivot][col]) < 1e-12:
            return [0.0] * k
        xtx[col], xtx[pivot] = xtx[pivot], xtx[col]
        xty[col], xty[pivot] = xty[pivot], xty[col]
        for r in range(k):
            if r == col:
                continue
            f = xtx[r][col] / xtx[col][col]
            for c in range(col, k):
                xtx[r][c] -= f * xtx[col][c]
            xty[r] -= f * xty[col]
    return [xty[i] / xtx[i][i] for i in range(k)]


def adf_tstat(u: list[float], lags: int = 1) -> float:
    """t de Dickey-Fuller augmente sur les residus.

    Regression de `delta u_t` sur `u_{t-1}` et ses propres retards. Pas de
    constante : les residus d'une regression avec constante sont de moyenne
    nulle par construction, en ajouter une reintroduirait un parametre libre.
    """
    n = len(u)
    if n < lags + 10:
        return 0.0
    y: list[float] = []
    X: list[list[float]] = []
    for t in range(lags + 1, n):
        y.append(u[t] - u[t - 1])
        ligne = [u[t - 1]]
        ligne += [u[t - i] - u[t - i - 1] for i in range(1, lags + 1)]
        X.append(ligne)

    beta = ols(y, X)
    resid = [y[r] - sum(beta[c] * X[r][c] for c in range(len(beta)))
             for r in range(len(y))]
    ddof = len(y) - len(beta)
    if ddof <= 0:
        return 0.0
    s2 = sum(e * e for e in resid) / ddof

    # Variance de phi = s2 * (X'X)^-1[0,0]. On l'obtient en resolvant
    # (X'X) v = e_0, dont la premiere composante est l'element cherche.
    k = len(beta)
    xtx = [[sum(X[r][i] * X[r][j] for r in range(len(X))) for j in range(k)]
           for i in range(k)]
    e0 = [1.0] + [0.0] * (k - 1)
    for col in range(k):
        pivot = max(range(col, k), key=lambda r: abs(xtx[r][col]))
        if abs(xtx[pivot][col]) < 1e-12:
            return 0.0
        xtx[col], xtx[pivot] = xtx[pivot], xtx[col]
        e0[col], e0[pivot] = e0[pivot], e0[col]
        for r in range(k):
            if r == col:
                continue
            f = xtx[r][col] / xtx[col][col]
            for c in range(col, k):
                xtx[r][c] -= f * xtx[col][c]
            e0[r] -= f * e0[col]
    var_phi = s2 * (e0[0] / xtx[0][0])
    return beta[0] / math.sqrt(var_phi) if var_phi > 0 else 0.0


def engle_granger(y: list[float], x: list[float], lags: int = 1) -> tuple[float, float]:
    """Renvoie (beta de couverture, t de l'ADF sur les residus)."""
    coeffs = ols(y, [[1.0, xi] for xi in x])
    alpha, beta = coeffs[0], coeffs[1]
    resid = [y[i] - alpha - beta * x[i] for i in range(len(y))]
    return beta, adf_tstat(resid, lags)


def main() -> int:
    ap = argparse.ArgumentParser(description="Paires co-integrees d'Engle-Granger")
    ap.add_argument("--interval", default="1d")
    ap.add_argument("--lags", type=int, default=1)
    ap.add_argument("--log", action="store_true",
                    help="regresser les log-prix plutot que les prix")
    ap.add_argument("--in-sample-only", action="store_true",
                    help="sauter la verification hors echantillon (a eviter)")
    args = ap.parse_args()

    series: dict[str, list[float]] = {}
    for a in ASSETS:
        try:
            bars = load_from_file(f"data/{a}_{args.interval}_real.json", a, args.interval)
        except (DataUnavailable, FileNotFoundError):
            continue
        series[a] = [math.log(float(b.close)) if args.log else float(b.close)
                     for b in bars]

    n = min(len(v) for v in series.values())
    for a in series:
        series[a] = series[a][-n:]

    print(f"\n  CO-INTEGRATION — {args.interval}, {len(series)} actifs, "
          f"{n} barres alignees")
    print(f"  Valeurs critiques de MacKinnon : "
          f"1 % {MACKINNON[0.01]}  ·  5 % {MACKINNON[0.05]}  ·  10 % {MACKINNON[0.10]}")
    print("  " + "-" * 56)
    print(f"  {'paire':<14}{'beta':>10}{'t (ADF)':>10}   verdict")
    print("  " + "-" * 56)

    resultats = []
    for a, b in combinations(sorted(series), 2):
        beta, t = engle_granger(series[a], series[b], args.lags)
        resultats.append((a, b, beta, t))

    cointegrees = 0
    for a, b, beta, t in sorted(resultats, key=lambda r: r[3]):
        if t <= MACKINNON[0.01]:
            v, cointegrees = "co-integree (1 %)", cointegrees + 1
        elif t <= MACKINNON[0.05]:
            v, cointegrees = "co-integree (5 %)", cointegrees + 1
        elif t <= MACKINNON[0.10]:
            v = "limite (10 %)"
        else:
            v = ""
        print(f"  {a + '/' + b:<14}{beta:>10.3f}{t:>10.3f}   {v}")

    total = len(resultats)
    print("  " + "-" * 56)
    print(f"  {cointegrees}/{total} paires co-integrees a 5 %")
    print(f"  attendues par pur hasard : {0.05 * total:.1f}")
    if args.in_sample_only:
        print()
        return 0

    # La verification qui decide. Le code du document ajuste le beta sur toute
    # la serie puis trade sur cette meme serie : le ratio de couverture connait
    # donc le futur. Une relation « co-integree » ainsi mesuree peut n'avoir
    # jamais existe en temps reel.
    candidates = [(a, b) for a, b, _, t in resultats if t <= MACKINNON[0.05]]
    if not candidates:
        print(f"\n  Rien a verifier : aucune candidate sur {total} tests.\n")
        return 0

    moitie = n // 2
    print(f"\n  HORS ECHANTILLON — beta calibre sur les {moitie} premieres")
    print(f"  barres, residus testes sur les {n - moitie} suivantes")
    print("  " + "-" * 56)
    print(f"  {'paire':<14}{'t plein':>10}{'t hors ech.':>14}   tient ?")
    print("  " + "-" * 56)

    tiennent = 0
    for a, b in candidates:
        t_plein = next(t for x, y, _, t in resultats if (x, y) == (a, b))
        calib = ols(series[a][:moitie], [[1.0, v] for v in series[b][:moitie]])
        dehors = [series[a][i] - calib[0] - calib[1] * series[b][i]
                  for i in range(moitie, n)]
        t_out = adf_tstat(dehors, args.lags)
        ok = t_out <= MACKINNON[0.05]
        tiennent += ok
        print(f"  {a + '/' + b:<14}{t_plein:>10.3f}{t_out:>14.3f}   "
              f"{'oui' if ok else 'NON'}")

    print("  " + "-" * 56)
    print(f"  {tiennent}/{len(candidates)} tiennent hors echantillon")
    if not tiennent:
        print("\n  Aucune relation ne survit a un beta qui ne connait pas le")
        print("  futur. Les co-integrations mesurees en plein echantillon")
        print("  etaient un artefact : le pairs trading n'a rien a trader ici.")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
