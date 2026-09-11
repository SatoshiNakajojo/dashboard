#!/usr/bin/env python3
"""Eprouver sur des actifs JAMAIS vus une hypothese nee de la grille.

    python scripts/hors_echantillon.py --draws 2000

**D'ou vient l'hypothese.** La grille de robustesse n'a retenu aucune
strategie, mais elle a produit un resultat que personne ne cherchait :
`rsi_reversion` perd, et de facon parfaitement reguliere. Ses quatorze
cellules — sept actifs, deux echelles — finissent TOUTES sous leur propre
bras aleatoire, d'un ecart median de 48 $ sur 1000 $. Quatorze signes
identiques sortent par hasard une fois sur huit mille.

Le modele nul prend le meme nombre de trades, avec les memes durees et le
meme dimensionnement : il paie donc les memes frais. L'ecart n'est donc pas
un cout, c'est du signal — oriente a l'envers. D'ou `rsi_continuation`, qui
garde la structure et retourne le sens.

**Pourquoi ce script existe.** Tester cette idee sur la grille serait la
confirmer, pas l'eprouver : c'est la grille qui l'a suggeree. Il faut des
donnees qui n'ont joue aucun role dans sa formulation. Le depot en contient
— une vingtaine d'actifs en daily que la grille n'a jamais touches, sur des
periodes en grande partie differentes. Ce sont eux, et rien qu'eux.

La liste des actifs retenus est CALCULEE, jamais ecrite a la main : tout ce
qui est present en daily, absent de la grille, et assez long. Ecrire la
liste permettrait d'y revenir apres avoir vu les resultats, ce qui est la
facon la plus discrete de truquer un test hors echantillon.

**Le seuil d'historique est fixe AVANT de regarder quoi que ce soit** — 800
barres. Le choisir ensuite reviendrait a garder les actifs qui arrangent.

**Ce que le script mesure vraiment.** Deux choses, et la premiere compte
autant que la seconde :

1. `rsi_reversion` perd-elle AUSSI sur ces actifs-la ? Si oui, le phenomene
   se reproduit hors de l'echantillon qui l'a revele, et ce n'est pas une
   particularite des sept actifs de la grille.
2. `rsi_continuation` gagne-t-elle ? C'est la seule question qui porte de
   l'argent, et c'est la plus fragile : une strategie peut battre son bras
   aleatoire sans jamais couvrir ses propres frais.
"""

from __future__ import annotations

import argparse
import glob
import json
import re
import sys
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from trading_desk.backtest.data import DataUnavailable, load_from_file
from trading_desk.backtest.engine import run_backtest
from trading_desk.backtest.null_model import randomization_test
from trading_desk.backtest.strategies import (
    BASELINES,
    PLAFOND_STOP_CAMPAGNE_BPS,
    parametres,
)
from trading_desk.risk import RiskLimits
from trading_desk.sentinelle.validation import benjamini_hochberg

# Les sept actifs de la grille : ceux dont on ne peut RIEN apprendre de neuf.
GRILLE = {"BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "AVAX"}
BARRES_MINIMUM = 800
COUPLE = ("rsi_reversion", "rsi_continuation")


def actifs_hors_grille(interval: str = "1d") -> list[str]:
    """Tout ce qui est en daily, hors grille, et assez long. Calcule."""
    trouves = []
    for chemin in sorted(glob.glob("data/*_real.json")):
        m = re.fullmatch(r"data/([A-Z0-9]+)_(\w+)_real\.json", chemin)
        if not m or m.group(2) != interval or m.group(1) in GRILLE:
            continue
        try:
            bars = load_from_file(chemin, m.group(1), interval)
        except (DataUnavailable, FileNotFoundError, ValueError):
            continue
        if len(bars) >= BARRES_MINIMUM:
            trouves.append(m.group(1))
    return trouves


def verdict(cellules: list[dict], strategie: str, alpha: float = 0.05) -> str:
    testees = [c for c in cellules
               if c["strategie"] == strategie and c["p"] is not None]
    if not testees:
        return f"\n  {strategie} : aucune cellule exploitable.\n"

    garde = benjamini_hochberg([c["p"] for c in testees], alpha)
    survivants = [c for c, k in zip(testees, garde, strict=True) if k]
    sous_hasard = [c for c in testees if c["net_usd"] < c["hasard_moyen"]]
    gagnantes = [c for c in testees if c["net_usd"] > 0]
    plancher = max(1.0 / (c["tirages"] + 1) for c in testees)

    lignes = [
        "",
        f"  {strategie.upper()}  —  {len(testees)} actifs jamais vus par la grille",
        "  " + "─" * 70,
        f"  net > 0                                   {len(gagnantes):>4} / {len(testees)}",
        f"  sous leur propre bras aleatoire           {len(sous_hasard):>4} / {len(testees)}",
        f"  survivantes apres Benjamini-Hochberg      {len(survivants):>4} / {len(testees)}",
        f"  plancher de p                          {plancher:>9.6f}",
        f"  seuil BH au rang 1                     {alpha / len(testees):>9.6f}",
        "  " + "─" * 70,
    ]
    for c in sorted(testees, key=lambda x: x["net_usd"], reverse=True):
        marque = "  <- survit" if c in survivants else ""
        lignes.append(
            f"    {c['actif']:<7}net {c['net_usd']:>+9.2f}   hasard {c['hasard_moyen']:>+8.2f}"
            f"   {c['trades']:>4} trades   p {c['p']:.4f}{marque}")
    return "\n".join(lignes + ["  " + "─" * 70, ""])


def signe(cellules: list[dict], strategie: str) -> str:
    """Combien de cellules du meme cote, et ce que le hasard en donnerait.

    Le test de signe est ce qui a fait naitre l'hypothese ; c'est donc lui
    qu'il faut refaire ici, sur des donnees neuves, avant tout le reste.
    """
    t = [c for c in cellules if c["strategie"] == strategie and c["p"] is not None]
    if not t:
        return ""
    sous = sum(1 for c in t if c["net_usd"] < c["hasard_moyen"])
    n = len(t)
    # binomiale exacte, bilaterale, p = 1/2
    from math import comb
    k = max(sous, n - sous)
    q = 2 * sum(comb(n, i) for i in range(k, n + 1)) / 2 ** n
    return (f"  {strategie:<18} {sous:>2}/{n} sous le hasard   "
            f"test de signe bilateral p = {min(1.0, q):.4f}")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--draws", type=int, default=2000)
    p.add_argument("--equity", type=float, default=1000.0)
    p.add_argument("--interval", default="1d")
    p.add_argument("--out", default="baselines/hors_echantillon.json")
    p.add_argument("--from-json", default=None,
                   help="relire un resultat deja calcule, sans refaire les tirages")
    args = p.parse_args()

    if args.from_json:
        cellules = json.loads(Path(args.from_json).read_text())
    else:
        actifs = actifs_hors_grille(args.interval)
        print(f"\n  {len(actifs)} actifs hors grille, >= {BARRES_MINIMUM} barres :")
        print("    " + " ".join(actifs))
        limits = RiskLimits(
            max_stop_distance_bps=Decimal(str(float(PLAFOND_STOP_CAMPAGNE_BPS))))
        cellules = []
        sortie = Path(args.out)
        for actif in actifs:
            bars = load_from_file(f"data/{actif}_{args.interval}_real.json",
                                  actif, args.interval)
            for nom in COUPLE:
                cls = BASELINES[nom]
                kw = parametres(nom, args.interval)
                obs = run_backtest(bars, cls(**kw), limits=limits,
                                   interval=args.interval,
                                   initial_equity_usd=Decimal(str(args.equity)))
                cell = {"actif": actif, "intervalle": args.interval,
                        "strategie": nom, "net_usd": float(obs.net_pnl_usd),
                        "trades": len(obs.trades), "rejets": obs.rejected_by_risk,
                        "p": None, "percentile": None, "hasard_moyen": None,
                        "tirages": args.draws}
                if obs.trades and args.draws > 0:
                    nul = randomization_test(
                        bars, cls(**kw), obs, draws=args.draws, limits=limits,
                        interval=args.interval,
                        initial_equity_usd=Decimal(str(args.equity)))
                    cell["p"] = float(nul.p_value)
                    cell["percentile"] = float(nul.percentile)
                    cell["hasard_moyen"] = float(nul.null_mean_usd)
                cellules.append(cell)
                # Ecrire apres CHAQUE cellule : une campagne perdue faute
                # d'ecriture finale, ca n'arrive qu'une fois.
                sortie.parent.mkdir(parents=True, exist_ok=True)
                sortie.write_text(json.dumps(cellules, indent=1), encoding="utf-8")
                pp = "  n/a" if cell["p"] is None else f"{cell['p']:.4f}"
                print(f"  {actif:<7}{nom:<18}net {cell['net_usd']:>+9.2f}  "
                      f"{cell['trades']:>4} trades  p {pp}", flush=True)

    for nom in COUPLE:
        print(verdict(cellules, nom))
    print("  TEST DE SIGNE, sur des actifs neufs")
    print("  " + "─" * 70)
    for nom in COUPLE:
        print(signe(cellules, nom))
    print("  " + "─" * 70 + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
