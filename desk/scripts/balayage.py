#!/usr/bin/env python3
"""Une regle a travers TOUT le panier disponible, a une echelle.

C'est la forme de recherche que le regroupement en familles rend payante, et
c'est l'inverse de ce que fait un balayage de parametres.

    Chercher le meilleur reglage sur une cellule       -> une hypothese,
                                                          payee par la famille
    Chercher les marches ou la MEME regle tient        -> autant d'hypotheses,
                                                          qui se portent l'une
                                                          l'autre

Au rang 1, Benjamini-Hochberg accorde `alpha / m`. Passer SEUL est le cas le
plus dur qui existe. Une regle correcte qui tient sur cinq actifs produit cinq
p bas, et le cinquieme a droit a cinq fois le seuil du premier.

**L'origine est `balayage`, jamais `main`.** Vingt-huit cellules lancees d'un
coup et trois idees tapees a la main ne sont pas le meme espace d'hypotheses ;
les melanger punirait les trois et absoudrait les vingt-huit.

    python scripts/balayage.py --strategie ema_cross --intervalle 1d
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

RACINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RACINE / "src"))

from trading_desk import atelier, transversal  # noqa: E402
from trading_desk.backtest.data import DataUnavailable  # noqa: E402

DONNEES = RACINE / "data"


def actifs_disponibles(intervalle: str) -> list[str]:
    """Les actifs qui ont des barres sur cette echelle, sur cette machine.

    Le panier n'est PAS choisi : c'est tout ce qui existe. Le choisir serait
    une selection, donc une hypothese de plus, et invisible dans le
    denominateur.
    """
    suffixe = f"_{intervalle}_real.json"
    return sorted(p.name[: -len(suffixe)] for p in DONNEES.glob(f"*{suffixe}"))


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--strategie", required=True)
    p.add_argument("--intervalle", default="1d")
    p.add_argument("--actifs", nargs="+", default=None,
                   help="par défaut : tout ce qui a des barres sur l'échelle")
    p.add_argument("--tirages", type=int, default=atelier.TIRAGES_DEFAUT)
    p.add_argument("--equite", type=float, default=1000.0)
    p.add_argument("--max-stop-bps", type=float, default=1600.0)
    p.add_argument("--origine", default="balayage",
                   choices=list(atelier.ORIGINES))
    p.add_argument("--registre", default=None)
    args = p.parse_args()

    actifs = args.actifs or actifs_disponibles(args.intervalle)
    if not actifs:
        print(f"\n  aucun actif avec des barres en {args.intervalle}\n",
              file=sys.stderr)
        return 1
    registre = Path(args.registre) if args.registre else None

    print(f"\n  {args.strategie} — {len(actifs)} actif(s) en "
          f"{args.intervalle}, {args.tirages} tirages, origine "
          f"« {args.origine} »")
    # Le denominateur, annonce AVANT les resultats. Le lire apres, c'est le
    # lire en sachant deja lequel a gagne.
    print(f"  Chaque actif est une hypothese. Le hasard seul en donnera "
          f"{0.05 * len(actifs):.1f} sous alpha = 0,05.\n")
    print("  " + "─" * 72)

    faits = 0
    for actif in actifs:
        debut = time.time()
        try:
            ligne = atelier.essayer(
                args.strategie, actif, args.intervalle,
                tirages=args.tirages, equite=args.equite,
                max_stop_bps=args.max_stop_bps, origine=args.origine)
        except (DataUnavailable, FileNotFoundError) as exc:
            # Un fichier manquant n'est pas un resultat : il n'entre pas au
            # registre, ou il compterait comme une hypothese testee.
            print(f"  {actif:<8} données absentes — non inscrit ({exc})")
            continue
        except ValueError as exc:
            print(f"  {actif:<8} refusé : {exc}")
            continue
        atelier.inscrire(ligne, registre)
        faits += 1
        pv = "—" if ligne["p"] is None else f"{ligne['p']:.4f}"
        print(f"  {actif:<8}{ligne['signature']}  net "
              f"{ligne['net_usd']:>+9.2f}  {ligne['trades']:>4} trades  "
              f"p {pv:>8}  {ligne['verdict'] or '—':<18} "
              f"({time.time() - debut:.0f} s)")

    print("  " + "─" * 72)
    if not faits:
        print("\n  aucune cellule inscrite.\n")
        return 1

    lignes = atelier.dernier_par_signature(atelier.lire(registre))
    c = transversal.coupe(lignes, strategie=args.strategie,
                          intervalle=args.intervalle)
    print(f"\n  LA COUPE\n  {c.phrase}")
    if c.survivantes:
        print(f"  survivantes : {', '.join(c.survivantes)}")
    # Le nombre de marches est la precaution qui empeche de lire « k marches »
    # la ou il y a k cellules correlees. Il s'affiche meme quand il deplait.
    if c.marches is not None and len(c.survivantes) > 1:
        print(f"  {len(c.survivantes)} actifs ne font que "
              f"{c.marches:.1f} marché(s) : une règle qui tient sur des "
              f"actifs qui montent ensemble n'a peut-être tenu qu'une fois.")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
