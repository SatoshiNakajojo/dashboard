#!/usr/bin/env python3
"""Les déblocages de jetons prédisent-ils quelque chose ?

    python3 scripts/valider_unlocks.py --unlocks data/unlocks.json --tirages 2000

Même barre que les six stratégies et les quatre déclencheurs : modèle nul,
dates tirées au hasard dans l'historique du MÊME jeton, correction de
Benjamini-Hochberg sur toutes les hypothèses ensemble.

## Pourquoi ce candidat, et pas un autre

La campagne des horizons a établi que la fenêtre économiquement viable est
**24 h à 72 h** : en dessous, l'excès d'amplitude est inférieur aux 15 bps
d'un aller-retour ; au-delà de 168 h, il s'évanouit. Un déblocage est un
événement **daté, public, mécanique**, dont l'effet se joue précisément sur
quelques jours. C'est le seul signal restant dont l'horizon naturel coïncide
avec cette fenêtre.

## Les trois hypothèses, posées AVANT la mesure

Ce sont celles de la littérature, pas celles que les données suggéreront :

- **anticipation** : le marché vend AVANT la date, entre J-7 et J-1 ;
- **impact** : l'offre frappe le jour même, J à J+1 ;
- **digestion** : la pression se résorbe après, J+1 à J+3.

Chacune est baissière par hypothèse (`sens = -1`). Tester ensuite « et si
c'était l'inverse » sur les mêmes données serait retourner sa veste après
avoir vu le résultat.

## Ce qui est contrôlé, et pourquoi chaque contrôle compte

**La dérive du jeton.** Les jetons récents baissent en moyenne. Un test
naïf « le prix baisse après un déblocage » mesurerait cette dérive et rien
d'autre. Le bras aléatoire tire ses dates dans l'historique du MÊME jeton :
la dérive est donc dans les deux bras et s'annule.

**La taille du déblocage.** 0,1 % et 20 % de l'offre n'ont rien à voir. Les
mélanger noierait le second dans le premier, donc les événements sont
classés par tranche et chaque tranche testée séparément.

**Le chevauchement.** Deux déblocages à trois jours d'écart produisent des
fenêtres qui se recouvrent, donc des observations quasi identiques comptées
comme indépendantes — ce qui divise artificiellement l'écart-type.
`sans_chevauchement` n'en garde qu'un par fenêtre.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from trading_desk.backtest.data import DataUnavailable, load_from_file
from trading_desk.sentinelle.triggers import Declenchement
from trading_desk.sentinelle.validation import benjamini_hochberg, evaluer

# (nom, décalage en jours par rapport à la date de déblocage, durée en jours)
#
# Le décalage exprime la fenêtre EN AMONT sans code supplémentaire : une
# fenêtre J-7 -> J-1 est un événement placé à J-7 et mesuré sur 6 jours.
# Cela réutilise telle quelle la machinerie déjà testée sur les déclencheurs.
FENETRES = [
    ("anticipation_J-7_J-1", -7, 6),
    ("impact_J_J+1", 0, 1),
    ("digestion_J+1_J+3", 1, 2),
    ("large_J-1_J+3", -1, 4),
]

# Tranches de taille, en part de l'offre en circulation. Bornes rondes,
# posées d'avance et non ajustées après coup.
TRANCHES = [
    ("0,5-2 %", 0.005, 0.02),
    ("2-5 %", 0.02, 0.05),
    ("> 5 %", 0.05, 1e9),
    ("toutes", 0.0, 1e9),
]


def index_par_date(bars) -> dict[int, int]:
    """Jour UTC -> indice de barre. Une barre journalière par jour."""
    return {b.ts_ms // 86_400_000: i for i, b in enumerate(bars)}


def cellules(unlocks: dict, tirages: int, min_evts: int) -> list:
    out = []
    for symbole, evenements in sorted(unlocks.items()):
        try:
            bars = load_from_file(f"data/{symbole}_1d_real.json", symbole, "1d")
        except (DataUnavailable, FileNotFoundError):
            print(f"    {symbole:<8} pas de bougies — ignoré", file=sys.stderr)
            continue
        par_jour = index_par_date(bars)

        for nom_tranche, bas, haut in TRANCHES:
            dans_tranche = [e for e in evenements
                            if bas <= e["part_offre"] < haut]
            if len(dans_tranche) < min_evts:
                continue

            for nom_fenetre, decalage, duree in FENETRES:
                declenchements = []
                for e in dans_tranche:
                    jour = e["ts_ms"] // 86_400_000 + decalage
                    i = par_jour.get(jour)
                    if i is None:
                        # Date hors historique du jeton, ou jour manquant.
                        # L'écarter plutôt que de prendre la barre la plus
                        # proche : un décalage d'un jour sur un événement
                        # daté détruit précisément ce qu'on mesure.
                        continue
                    declenchements.append(
                        Declenchement(i, -1, e["part_offre"], nom_fenetre))
                if len(declenchements) < min_evts:
                    continue

                r = evaluer(bars, declenchements, horizon=duree,
                            horizon_libelle=nom_fenetre, declencheur=nom_tranche,
                            actif=symbole, intervalle="1d", tirages=tirages)
                if r is not None:
                    out.append(r)
                    print(f"    {symbole:<8} {nom_tranche:<9} {nom_fenetre:<22} "
                          f"n={r.evenements:<4} dir {r.rendement_moyen_bps:+8.1f} bps "
                          f"(p {r.p_direction:.3f})  amp {r.amplitude_moyenne_bps:7.1f} "
                          f"(p {r.p_amplitude:.3f})", flush=True)
    return out


def rapport(res: list, alpha: float) -> None:
    if not res:
        print("\n  Aucune cellule exploitable. Vérifiez `data/unlocks.json` "
              "et la présence des bougies.\n")
        return

    for cle_p, cle_val, cle_nul, titre in (
        ("p_direction", "rendement_moyen_bps", "nul_direction_bps",
         "DIRECTION — le déblocage fait-il BAISSER le prix ? (un edge)"),
        ("p_amplitude", "amplitude_moyenne_bps", "nul_amplitude_bps",
         "AMPLITUDE — fait-il BOUGER le prix ? (un réveil)"),
    ):
        ps = [getattr(r, cle_p) for r in res]
        garde = benjamini_hochberg(ps, alpha)
        bruts = sum(1 for p in ps if p < alpha)
        survivants = [r for r, g in zip(res, garde, strict=True) if g]

        print(f"\n  {titre}")
        print("  " + "=" * 70)
        print(f"  cellules testées                        {len(res):>6}")
        print(f"  p < {alpha} brut                          {bruts:>6}")
        print(f"  attendues par pur hasard                {len(res) * alpha:>6.1f}")
        print(f"  survivantes après Benjamini-Hochberg    {len(survivants):>6}")
        if not survivants:
            print(f"  ----> AUCUNE. Les {bruts} cellules à p < {alpha} sont "
                  f"compatibles\n        avec le bruit de {len(res)} tests "
                  "simultanés.")
            continue
        print("  ----> SURVIVANTES :")
        for r in sorted(survivants, key=lambda x: getattr(x, cle_p)):
            print(f"        {r.actif:<8} {r.declencheur:<9} {r.horizon_libelle:<22} "
                  f"n={r.evenements:<4} {getattr(r, cle_val):+8.1f} bps contre "
                  f"{getattr(r, cle_nul):+7.1f} au hasard "
                  f"(p {getattr(r, cle_p):.4f})")

    print("\n  RENDEMENT SIGNÉ MOYEN par fenêtre et par tranche")
    print("  (négatif = le prix baisse, l'hypothèse baissière va dans ce sens)")
    print("  " + "=" * 70)
    fenetres = [f[0] for f in FENETRES]
    print(f"  {'tranche':<11}" + "".join(f"{f.split('_')[0]:>16}" for f in fenetres))
    print("  " + "-" * 70)
    for nom_tranche, _, _ in TRANCHES:
        ligne = f"  {nom_tranche:<11}"
        for f in fenetres:
            lot = [r for r in res if r.declencheur == nom_tranche
                   and r.horizon_libelle == f]
            ligne += (f"{sum(x.rendement_moyen_bps for x in lot) / len(lot):>+15.1f} "
                      if lot else f"{'—':>16}")
        print(ligne)
    print("\n  Tant qu'aucune cellule ne survit à la correction, ce tableau "
          "montre du bruit.\n")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--unlocks", default="data/unlocks.json")
    p.add_argument("--tirages", type=int, default=2000)
    p.add_argument("--alpha", type=float, default=0.05)
    p.add_argument("--min-evenements", type=int, default=10,
                   help="en dessous, aucune conclusion n'est possible et la "
                        "cellule est écartée plutôt que rapportée bruyante")
    p.add_argument("--out", default=None)
    args = p.parse_args()

    chemin = Path(args.unlocks)
    if not chemin.exists():
        print(f"\n  {chemin} introuvable. Lancez d'abord :\n"
              "      python3 scripts/fetch_unlocks.py\n", file=sys.stderr)
        return 2
    unlocks = json.loads(chemin.read_text())
    total = sum(len(v) for v in unlocks.values())
    print(f"\n  {total} déblocages sur {len(unlocks)} jetons, "
          f"{len(FENETRES)} fenêtres × {len(TRANCHES)} tranches\n")

    res = cellules(unlocks, args.tirages, args.min_evenements)
    rapport(res, args.alpha)
    if args.out:
        Path(args.out).write_text(json.dumps([r.__dict__ for r in res], indent=1))
        print(f"  Résultats bruts : {args.out}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
