#!/usr/bin/env python3
"""Génère des candidates et inscrit le LOT ENTIER.

    python scripts/generateur.py --sources
    python scripts/generateur.py --catalogue --actifs BTC,ETH,SOL --intervalles 1h,12h
    python scripts/generateur.py --deriver <empreinte> --quoi parametres
    python scripts/generateur.py --fichier recettes.jsonl
    python scripts/generateur.py --bilan

Le chiffre à lire en premier est `produits`, pas `retenus`.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RACINE / "src"))

from trading_desk import biblio, generateur as gen  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--sources", action="store_true")
    p.add_argument("--catalogue", action="store_true")
    p.add_argument("--deriver", metavar="EMPREINTE")
    p.add_argument("--quoi", choices=gen.DERIVATIONS, default="parametres")
    p.add_argument("--fichier", type=Path)
    p.add_argument("--bilan", action="store_true")
    p.add_argument("--actifs", default="BTC,ETH,SOL")
    p.add_argument("--intervalles", default="1h,4h,12h")
    p.add_argument("--auteur", default="jojo")
    p.add_argument("--inscrire-biblio", action="store_true",
                   help="ajouter aussi les tickets retenus à la bibliothèque")
    a = p.parse_args()

    actifs = [x.strip() for x in a.actifs.split(",") if x.strip()]
    intervalles = [x.strip() for x in a.intervalles.split(",") if x.strip()]

    if a.sources:
        print("\n  Sources, sondées à l'instant\n")
        for s in gen.sources(sonder=True):
            etat = "DISPONIBLE" if s.disponible else "indisponible"
            print(f"  {s.cle:<12} {etat:<14} {s.quoi}")
            print(f"  {'':<12} {'':<14} → {s.motif[:96]}")
        print()
        return 0

    if a.bilan:
        b = gen.bilan()
        print(f"\n  {b['total']['lots']} lot(s) · "
              f"{b['total']['produits']} candidate(s) PRODUITE(S) · "
              f"{b['total']['retenus']} retenue(s) · "
              f"{b['total']['ecartes']} écartée(s)\n")
        for src, d in sorted(b["par_source"].items()):
            print(f"  {src:<12} {d['lots']:>3} lot(s) · {d['produits']:>5} "
                  f"produites · {d['retenus']:>5} retenues")
        print()
        return 0

    if a.catalogue:
        lot = gen.depuis_catalogue(actifs, intervalles, auteur=a.auteur)
    elif a.deriver:
        parent = next((t for t in biblio.lire()
                       if t.empreinte().startswith(a.deriver)), None)
        if parent is None:
            print(f"\n  Aucun ticket d'empreinte « {a.deriver} » "
                  f"dans la bibliothèque.\n")
            return 1
        connus = {t.empreinte() for t in biblio.lire()}
        lot = gen.depuis_derivation(parent, a.quoi, actifs=actifs,
                                    intervalles=intervalles, connus=connus)
    elif a.fichier:
        lot = gen.depuis_fichier(a.fichier, auteur=a.auteur)
    else:
        p.print_help()
        return 1

    gen.inscrire_lot(lot)
    print(f"\n  source « {lot.source} »"
          + (f" · dérivation « {lot.derivation} » de {lot.parent}"
             if lot.derivation else ""))
    print(f"  {lot.produits} produite(s) · {len(lot.tickets)} retenue(s) · "
          f"{lot.ecartes} écartée(s)")
    for motif, n in sorted(lot.motifs_ecart.items()):
        print(f"      {n:>4} — {motif}")

    if a.inscrire_biblio and lot.tickets:
        n, d = biblio.importer(lot.tickets, origine=lot.tickets[0].origine)
        print(f"  bibliothèque : {n} ajouté(s), {d} doublon(s)")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
