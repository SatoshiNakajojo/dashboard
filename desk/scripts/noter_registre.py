#!/usr/bin/env python3
"""Complete le registre de l'atelier avec la note du scorer.

Les lignes inscrites avant que le champ `note` existe n'en portent pas. Les
relancer les renoterait, mais leur **p changerait** : il vient d'un modele nul
aleatoire, et deux tirages ne donnent pas le meme. Or le p est la seule chose
qu'on ne doit jamais recalculer sans raison — c'est lui qui porte le
denominateur du criblage.

Ce script recalcule donc UNIQUEMENT la note, qui est deterministe (memes
barres, memes parametres, meme resultat), et reinscrit la ligne avec son p
d'origine. Le registre reste en ajout seul ; `dernier_par_signature` garde la
version la plus recente de chaque combinaison.
"""

from __future__ import annotations

import argparse
import sys
from decimal import Decimal
from pathlib import Path

RACINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RACINE / "src"))

from trading_desk import atelier  # noqa: E402
from trading_desk.backtest.data import DataUnavailable, load_from_file  # noqa: E402
from trading_desk.backtest.engine import run_backtest  # noqa: E402
from trading_desk.backtest.strategies import BASELINES  # noqa: E402
from trading_desk.risk.limits import RiskLimits  # noqa: E402
from trading_desk.scorer import noter, relief  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--relief", action="store_true",
                   help="mesurer aussi le relief : deux backtests par "
                        "parametre numerique et par cellule. Lent.")
    p.add_argument("--max-stop-bps", type=float, default=1600.0)
    args = p.parse_args()

    essais = atelier.lire()
    lignes = atelier.dernier_par_signature(essais)
    a_faire = [l for l in lignes if not l.get("note")]
    print(f"\n  {len(lignes)} combinaisons au registre · "
          f"{len(a_faire)} sans note\n")
    if not a_faire:
        print("  Rien à faire.\n")
        return 0

    limites = RiskLimits(max_stop_distance_bps=Decimal(str(args.max_stop_bps)))
    faites = 0
    for l in a_faire:
        nom, actif, intervalle = l["strategie"], l["actif"], l["intervalle"]
        if nom not in BASELINES:
            print(f"  {nom:<18} {actif:<4} stratégie inconnue, ignorée")
            continue
        try:
            bars = load_from_file(
                str(RACINE / "data" / f"{actif}_{intervalle}_real.json"),
                actif, intervalle)
        except (DataUnavailable, FileNotFoundError):
            print(f"  {nom:<18} {actif:<4} données absentes, ignorée")
            continue

        equite = float(l.get("equite") or 1000.0)
        obs = run_backtest(bars, BASELINES[nom](**l["parametres"]),
                           limits=limites, interval=intervalle,
                           initial_equity_usd=Decimal(str(equite)))
        r = None
        if args.relief:
            r, _, _ = relief(nom, actif, intervalle, l["parametres"],
                             equite=equite, max_stop_bps=args.max_stop_bps)

        n = noter(obs, bars, equite=equite, relief=r)
        # La ligne est reinscrite AVEC SON P D'ORIGINE. Recalculer le p
        # donnerait une autre valeur, et le registre porterait deux mesures
        # pour une seule hypothese.
        atelier.inscrire({**l, "note": n.en_dict()})
        faites += 1
        marque = "✓" if n.deployable else "✗"
        print(f"  {marque} {nom:<18} {actif:<4} {n.resume()[:88]}")

    print(f"\n  {faites} ligne(s) notée(s).\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
