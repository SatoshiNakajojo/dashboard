#!/usr/bin/env python3
"""Fabriquer une strategie, l'essayer, l'inscrire au registre.

    python3 scripts/atelier.py --strategie ema_cross --actifs BTC ETH \
        --intervalles 1d 4h --param fast=10 --param slow=40

    python3 scripts/atelier.py --catalogue      # ce qu'on peut regler

**Ce que fait ce script, et ce qu'il refuse de faire.** Il essaie une ou
plusieurs combinaisons (strategie x parametres x actif x intervalle) contre
le modele nul, et inscrit CHAQUE resultat dans `data/registre_atelier.jsonl`,
en ajout seul. Il ne classe rien, ne selectionne rien, et ne branche rien sur
le desk : c'est l'interface qui lit le registre, et le passage d'un essai a
une regle deployee demande un test hors echantillon et une decision humaine.

**Pourquoi tout est inscrit, y compris les ratages.** Essayer cinquante
combinaisons et garder la meilleure donne, sur du bruit pur, une meilleure
cellule a p ~ 0,02. Le seul chiffre qui rend cette cellule interpretable est
le nombre de combinaisons essayees — et il n'existe que si les ratages sont
la. C'est la meme regle que le journal des deblocages, pour la meme raison :
un registre qu'on peut nettoyer documente les essais dont on se souvient
avec plaisir.

**Le balayage est deliberement facile, et c'est pour ca qu'il compte.**
Lancer douze cellules en une commande est exactement ce qui fabrique des
faux positifs — et exactement ce qu'on veut voir apparaitre dans le
denominateur. Un atelier qui rendrait le balayage penible pousserait a le
faire a la main, hors registre, ce qui est le pire des deux mondes.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from trading_desk import atelier
from trading_desk.backtest.data import DataUnavailable


def _param(txt: str) -> tuple[str, float]:
    if "=" not in txt:
        raise argparse.ArgumentTypeError(f"attendu nom=valeur, recu « {txt} »")
    nom, valeur = txt.split("=", 1)
    try:
        return nom.strip(), float(valeur)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"« {valeur} » n'est pas un nombre") from exc


def afficher_catalogue() -> int:
    cat = atelier.catalogue()
    print("\n  STRATÉGIES ET LEURS PARAMÈTRES RÉGLABLES")
    print("  " + "─" * 70)
    for nom, d in cat["strategies"].items():
        print(f"\n  {nom}\n    {d['resume']}")
        for champ, b in d["parametres"].items():
            borne = f"[{b['min']:g} … {b['max']:g}]"
            print(f"      --param {champ}=<{'entier' if b['entier'] else 'nombre'}>"
                  f"   défaut {b['defaut']:g}   {borne}")
    print("\n  DONNÉES DISPONIBLES SUR CETTE MACHINE")
    print("  " + "─" * 70)
    for actif, intervalles in cat["donnees"].items():
        print(f"    {actif:<10} {' '.join(intervalles)}")
    print()
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--catalogue", action="store_true",
                   help="lister les stratégies, leurs paramètres et les données")
    p.add_argument("--strategie")
    p.add_argument("--actifs", nargs="+", default=["BTC"])
    p.add_argument("--intervalles", nargs="+", default=["1d"])
    p.add_argument("--param", type=_param, action="append", default=[],
                   metavar="NOM=VALEUR",
                   help="réglage d'un paramètre, répétable. Les valeurs sont "
                        "écrêtées à leur plage ; un nom inconnu est ignoré.")
    p.add_argument("--tirages", type=int, default=atelier.TIRAGES_DEFAUT)
    p.add_argument("--equite", type=float, default=1000.0)
    p.add_argument("--max-stop-bps", type=float, default=None)
    p.add_argument("--registre", default=None)
    args = p.parse_args()

    if args.catalogue:
        return afficher_catalogue()
    if not args.strategie:
        print("  --strategie est requis (ou --catalogue)", file=sys.stderr)
        return 2

    registre = Path(args.registre) if args.registre else None
    choix = dict(args.param)
    cellules = [(a, i) for a in args.actifs for i in args.intervalles]

    print(f"\n  {args.strategie} — {len(cellules)} cellule(s), "
          f"{args.tirages} tirages")
    # Le denominateur, annonce AVANT les resultats. Le lire apres, c'est le
    # lire en sachant deja lequel a gagne.
    print("  Chaque cellule est une hypothese de plus. Le registre les "
          "compte toutes.\n")
    print("  " + "─" * 70)

    faits = 0
    for actif, intervalle in cellules:
        debut = time.time()
        try:
            ligne = atelier.essayer(
                args.strategie, actif, intervalle, params=choix,
                tirages=args.tirages, equite=args.equite,
                max_stop_bps=args.max_stop_bps)
        except (DataUnavailable, FileNotFoundError) as exc:
            # Un fichier manquant n'est PAS un resultat de strategie. Il ne
            # doit donc pas entrer au registre : il y compterait comme une
            # hypothese testee et gonflerait le denominateur avec du vide.
            print(f"  {actif:<6}{intervalle:<5} données absentes — "
                  f"non inscrit ({exc})")
            continue
        except ValueError as exc:
            print(f"  {actif:<6}{intervalle:<5} refusé : {exc}")
            continue

        atelier.inscrire(ligne, registre)
        faits += 1
        pv = "—" if ligne["p"] is None else f"{ligne['p']:.4f}"
        print(f"  {actif:<6}{intervalle:<5}{ligne['signature']}  "
              f"net {ligne['net_usd']:>+9.2f}  {ligne['trades']:>4} trades  "
              f"p {pv:>7}  {ligne.get('verdict') or ligne.get('raison_sans_p', '')}"
              f"   ({time.time() - debut:.0f} s)")

    print("  " + "─" * 70)
    total = len(atelier.dernier_par_signature(atelier.lire(registre)))
    print(f"  {faits} essai(s) inscrit(s). Le registre porte maintenant "
          f"{total} combinaison(s) distincte(s).")
    print("  C'est le nombre d'hypotheses sur lequel la correction de "
          "Benjamini-Hochberg\n  porte dans l'interface — pas celui de la "
          "cellule qu'on regarde.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
