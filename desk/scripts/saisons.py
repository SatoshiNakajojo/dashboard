#!/usr/bin/env python3
"""Les saisons de marche : la serie, puis la grille strategie x saison.

Le decoupage est FIGE dans `trading_desk/saisons.py`, ecrit et commite avant
qu'une ligne de mesure n'existe. Ce script ne choisit rien — il applique.

    python scripts/saisons.py                      # serie + grille en 4 h
    python scripts/saisons.py --serie              # la serie seule
    python scripts/saisons.py --intervalle 1d      # grille en 1 j
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RACINE / "src"))

from trading_desk import saisonnier as sr  # noqa: E402
from trading_desk import saisons as S  # noqa: E402
from trading_desk.sentinelle.validation import benjamini_hochberg  # noqa: E402

ALPHA = 0.05


def afficher_serie(serie: sr.Serie) -> None:
    d = serie.en_dict()
    print(f"\n  LA SERIE — decoupage version {d['version']}, "
          f"empreinte {d['empreinte']}")
    print("  " + "─" * 74)
    r = d["repartition"]
    print(f"  {d['etiquetees']} barres etiquetees sur {d['barres']}   "
          f"bull {r['bull']} · bear {r['bear']} · range {r['range']}")
    print(f"  {d['plages']} plages, la plus longue {d['plus_longue_plage']} barres")
    # La resolution AVANT les resultats : un criblage aveugle rend un « zero
    # survivant » qui ne dit rien du marche, et il faut le savoir avant de lire.
    etat = "peut voir" if d["criblage_possible"] else "AVEUGLE"
    print(f"  {d['plage_decalages']} decalages utilisables pour "
          f"{d['plage_requise']} requis — le criblage {etat} "
          f"(plancher de p {d['plancher_de_p']:.5f})")
    print()
    for p in serie.plages:
        print(f"    {p.saison:6}{p.barres:5} j   {p.debut} -> {p.fin}"
              f"   jour {p.jour_du_cycle:4} du cycle {p.cycle}")


def afficher_grille(cellules: list[sr.Cellule], intervalle: str) -> None:
    print(f"\n  LA GRILLE — {len(cellules)} cellules, {intervalle}, "
          f"origine « {S.ORIGINE} »")
    # Le denominateur, annonce AVANT les resultats. Le lire apres, c'est le
    # lire en sachant deja laquelle a gagne.
    print(f"  Onze strategies x trois saisons. Le hasard seul donnera "
          f"{ALPHA * S.DENOMINATEUR:.2f} cellule(s) sous alpha = {ALPHA}.")
    print("  " + "─" * 74)
    print(f"  {'strategie':22}{'saison':8}{'trades':>7}{'net':>10}"
          f"{'/trade':>9}{'nul':>9}{'p':>9}")
    lisibles = [c for c in cellules if c.interpretable and c.p is not None]
    for c in sorted(lisibles, key=lambda x: x.p):
        print(f"  {c.strategie:22}{c.saison:8}{c.trades:7}{c.net_usd:+10.1f}"
              f"{c.net_par_trade:+9.2f}{c.nul_moyen:+9.2f}{c.p:9.4f}")

    maigres = len(cellules) - len(lisibles)
    print("  " + "─" * 74)
    print(f"  {maigres} cellule(s) sous {sr.TRADES_MIN_PAR_CELLULE} "
          f"aller-retours : comptees au denominateur, pas interpretables.")

    # La correction porte sur les 33, pas sur les lisibles : retirer les
    # maigres du denominateur la rendrait plus laxiste.
    avec_p = [c for c in cellules if c.p is not None]
    garde = benjamini_hochberg([c.p for c in avec_p], ALPHA)
    sous = [c for c in avec_p if c.p <= ALPHA]
    print(f"  {len(sous)} sous alpha (le hasard en donnerait "
          f"{ALPHA * S.DENOMINATEUR:.2f}) · {sum(garde)} survivante(s) a "
          f"Benjamini-Hochberg sur {len(avec_p)}")
    # Une cellule sous alpha absente du tableau ci-dessus enverrait le lecteur
    # la chercher en vain : le tableau ne montre que les interpretables, et
    # une cellule a deux trades peut tomber sous alpha par nul degenere. On
    # la nomme plutot que de laisser l'ecart se voir sans s'expliquer.
    maigres_sous = [c for c in sous if not c.interpretable]
    for c in maigres_sous:
        print(f"    dont {c.strategie} / {c.saison} a p={c.p:.4f} sur "
              f"{c.trades} aller-retour(s) — hors tableau, nul degenere")
    print()


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--serie", action="store_true", help="la série seule")
    p.add_argument("--intervalle", default="4h",
                   help="l'échelle des STRATÉGIES ; les saisons restent "
                        "journalières (c'est la déclaration)")
    p.add_argument("--actif", default=None)
    p.add_argument("--tirages", type=int, default=None)
    args = p.parse_args()

    serie = sr.serie_de_reference()
    afficher_serie(serie)
    if args.serie:
        return 0
    if not serie.criblage_possible:
        print("\n  criblage aveugle : la grille ne serait pas lisible.\n",
              file=sys.stderr)
        return 1
    afficher_grille(sr.grille(serie=serie, actif=args.actif,
                              intervalle=args.intervalle,
                              tirages=args.tirages), args.intervalle)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
