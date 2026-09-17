#!/usr/bin/env python3
"""La ferme : les essais de l'atelier en parallele, pour une machine a cœurs.

Ce script existe pour une raison mesuree, pas pour l'elegance. Un modele nul
de randomisation rejoue DEUX MILLE backtests complets par cellule : le
balayage 4 h d'`ema_cross` a pris 552 s pour 26 actifs, mediane 23 s par
cellule. Onze regles sur vingt-six actifs font 1,7 h en sequentiel, et
elargir le catalogue fait passer ca a une nuit.

Le travail se parallelise trivialement : chaque cellule (regle, actif) est
independante des autres. C'est le seul endroit du depot ou plus de cœurs
achete vraiment quelque chose — la grille des saisons, elle, tient en six
secondes et n'a jamais eu besoin d'une machine de plus.

────────────────────────────────────────────────────────────────────────────
  DEUX PROPRIETES QUI NE SONT PAS DES CONFORTS
────────────────────────────────────────────────────────────────────────────

**Le parent seul ecrit au registre.** Les ouvriers rendent des lignes, ils ne
les inscrivent pas. Un fichier en ajout seul ecrit par huit processus finirait
par entrelacer deux lignes au milieu d'un JSON, et une ligne tronquee au
milieu du fichier — pas a la fin — est exactement ce que `atelier.lire` ne
sait pas rattraper.

**La reprise est par SIGNATURE, pas par compteur.** Une ferme tuee a la
troisieme heure doit reprendre ou elle en etait. Elle saute donc les cellules
deja au registre AVEC AU MOINS le nombre de tirages demande : une cellule
inscrite a 600 tirages n'est pas une cellule a 2 000, et la sauter rendrait un
lot dont la resolution varie sans que rien ne le dise.

────────────────────────────────────────────────────────────────────────────
  CE QU'IL NE FAUT PAS EN ATTENDRE
────────────────────────────────────────────────────────────────────────────

Plus de cellules ne rapproche pas d'une decouverte, ca eloigne : chaque
cellule entre au denominateur de son origine. Six balayages ont deja porte
l'origine `balayage` a 157 familles, donc un seuil au rang 1 de 0,00032. La
ferme sert a poser des questions PLUS VITE, pas a en poser plus.

    python scripts/ferme.py --intervalle 4h --coeurs 8
    python scripts/ferme.py --strategies tsmom supertrend --tirages 2000
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

RACINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RACINE / "src"))

from trading_desk import atelier  # noqa: E402
from trading_desk.backtest.data import DataUnavailable  # noqa: E402

DONNEES = RACINE / "data"


def actifs_disponibles(intervalle: str) -> list[str]:
    suffixe = f"_{intervalle}_real.json"
    return sorted(p.name[: -len(suffixe)] for p in DONNEES.glob(f"*{suffixe}"))


def _une_cellule(tache: tuple[str, str, str, int, float, float | None, str]):
    """Un essai, dans un processus ouvrier. Rend la ligne, ne l'inscrit pas."""
    nom, actif, intervalle, tirages, equite, max_stop, origine = tache
    debut = time.time()
    try:
        ligne = atelier.essayer(nom, actif, intervalle, tirages=tirages,
                                equite=equite, max_stop_bps=max_stop,
                                origine=origine)
    except (DataUnavailable, FileNotFoundError) as exc:
        # Un fichier manquant n'est PAS un resultat de strategie : il ne doit
        # pas entrer au registre, ou il y compterait comme une hypothese.
        return (nom, actif, None, f"données absentes ({exc})", time.time() - debut)
    except ValueError as exc:
        return (nom, actif, None, f"refusé : {exc}", time.time() - debut)
    return (nom, actif, ligne, "", time.time() - debut)


def deja_fait(registre: Path | None, tirages: int) -> set[str]:
    """Les signatures deja au registre a AU MOINS `tirages` tirages."""
    faites = set()
    for ligne in atelier.dernier_par_signature(atelier.lire(registre)):
        if int(ligne.get("tirages") or 0) >= tirages:
            faites.add(str(ligne.get("signature")))
    return faites


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--strategies", nargs="+", default=None)
    p.add_argument("--actifs", nargs="+", default=None)
    p.add_argument("--intervalle", default="4h")
    p.add_argument("--tirages", type=int, default=atelier.TIRAGES_DEFAUT)
    p.add_argument("--equite", type=float, default=1000.0)
    p.add_argument("--max-stop-bps", type=float, default=1600.0)
    p.add_argument("--origine", default="balayage", choices=list(atelier.ORIGINES))
    p.add_argument("--coeurs", type=int, default=0,
                   help="0 = tous les cœurs disponibles moins un")
    p.add_argument("--registre", default=None)
    p.add_argument("--reprendre", action="store_true", default=True)
    p.add_argument("--tout-refaire", dest="reprendre", action="store_false",
                   help="ne saute rien, même ce qui est déjà au registre")
    args = p.parse_args()

    registre = Path(args.registre) if args.registre else None
    noms = args.strategies or sorted(atelier.BASELINES)
    actifs = args.actifs or actifs_disponibles(args.intervalle)
    if not actifs:
        print(f"\n  aucun actif en {args.intervalle}\n", file=sys.stderr)
        return 1

    dispo = len(os.sched_getaffinity(0)) if hasattr(os, "sched_getaffinity") \
        else (os.cpu_count() or 1)
    # Un cœur laisse libre : sur le VPS, le desk et l'enregistreur tournent en
    # meme temps, et une ferme qui prend tout les ferait rater des messages.
    coeurs = args.coeurs if args.coeurs > 0 else max(1, dispo - 1)

    faites = deja_fait(registre, args.tirages) if args.reprendre else set()
    taches, sautees = [], 0
    for nom in noms:
        for actif in actifs:
            sig = atelier.signature(nom, actif, args.intervalle,
                                    atelier.defauts(nom, args.intervalle))
            if sig in faites:
                sautees += 1
                continue
            taches.append((nom, actif, args.intervalle, args.tirages,
                           args.equite, args.max_stop_bps, args.origine))

    print(f"\n  FERME — {len(noms)} règle(s) × {len(actifs)} actif(s) en "
          f"{args.intervalle}, {args.tirages} tirages, origine « {args.origine} »")
    print(f"  {coeurs} cœur(s) sur {dispo} · {len(taches)} cellule(s) à faire"
          + (f", {sautees} déjà au registre" if sautees else ""))
    # Le denominateur, annonce AVANT les resultats. Chaque cellule entre au
    # denominateur de son origine : la ferme va plus vite, elle ne rend pas
    # les decouvertes plus faciles.
    print(f"  Chaque cellule est une hypothèse de plus sous « {args.origine} ».\n")
    if not taches:
        print("  Rien à faire.\n")
        return 0

    debut, faits, vides = time.time(), 0, 0
    print("  " + "─" * 74)
    with ProcessPoolExecutor(max_workers=coeurs) as pool:
        futurs = {pool.submit(_une_cellule, t): t for t in taches}
        for k, fut in enumerate(as_completed(futurs), 1):
            nom, actif, ligne, motif, duree = fut.result()
            if ligne is None:
                vides += 1
                print(f"  [{k:4}/{len(taches)}] {nom:20}{actif:<8} {motif}")
                continue
            # SEUL le parent ecrit : un JSONL en ajout ecrit par huit
            # processus finirait par entrelacer deux lignes.
            atelier.inscrire(ligne, registre)
            faits += 1
            pv = "—" if ligne["p"] is None else f"{ligne['p']:.4f}"
            print(f"  [{k:4}/{len(taches)}] {nom:20}{actif:<8}"
                  f"net {ligne['net_usd']:>+9.2f}  {ligne['trades']:>4} tr."
                  f"  p {pv:>8}  {ligne['verdict'] or '—':<18} ({duree:.0f} s)")

    ecoule = time.time() - debut
    print("  " + "─" * 74)
    print(f"\n  {faits} inscrite(s), {vides} sans donnée, en "
          f"{ecoule/60:.1f} min ({ecoule/max(1, len(taches)):.1f} s/cellule "
          f"en moyenne, {coeurs} cœurs)")
    print(f"  Le registre porte maintenant "
          f"{len(atelier.dernier_par_signature(atelier.lire(registre)))} "
          f"combinaison(s) distincte(s).\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
