#!/usr/bin/env python3
"""Cartographie multi-horizons des declencheurs de la Sentinelle.

    python scripts/valider_declencheurs.py --tirages 2000

Pour chaque (declencheur, actif, intervalle, HORIZON), compare les rendements
qui suivent un declenchement a ceux de dates tirees au hasard — memes sens,
memes effectifs, meme horizon.

**Le balayage d'horizons triple le nombre d'hypotheses**, et c'est la raison
d'etre de la correction : chercher « l'horizon ou l'edge est maximal » revient
a prendre le maximum de plusieurs centaines de tirages bruites, ce qui produit
toujours un gagnant. Benjamini-Hochberg porte donc sur TOUTES les cellules
ensemble, direction et amplitude comptees separement — ce sont deux questions
distinctes, pas deux mesures de la meme.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from trading_desk.backtest.data import DataUnavailable, load_from_file
from trading_desk.sentinelle.triggers import (
    cascade_liquidations,
    funding_extreme,
    pic_de_volume,
    rupture_volatilite,
)
from trading_desk.sentinelle.validation import benjamini_hochberg, evaluer

ACTIFS = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "AVAX"]

# Horizons demandes, exprimes en HEURES puis convertis en barres selon
# l'intervalle. Sur du 1 h, « H+15 min » n'existe pas : la cellule est
# simplement absente plutot que fabriquee par interpolation.
HORIZONS_H = [0.25, 1.0, 4.0, 12.0]
BARRES_PAR_HEURE = {"15m": 4.0, "1h": 1.0, "4h": 0.25, "1d": 1 / 24}


def charger_funding(actif: str, bars) -> list[float] | None:
    """Aligne le funding horaire sur les barres, par horodatage.

    Renvoie `None` plutot qu'un alignement approximatif : un decalage d'une
    heure ferait lire a chaque declenchement le funding d'une autre periode,
    et l'erreur serait invisible dans les resultats.
    """
    chemin = Path(f"data/{actif}_funding.json")
    if not chemin.exists():
        return None
    brut = json.loads(chemin.read_text())
    par_heure = {int(e["time"]) // 3_600_000: float(e["fundingRate"]) for e in brut}
    aligne, manquants = [], 0
    for b in bars:
        valeur = par_heure.get(b.ts_ms // 3_600_000)
        if valeur is None:
            manquants += 1
            valeur = 0.0
        aligne.append(valeur)
    if manquants > len(bars) * 0.2:
        return None
    return aligne


def cellules(intervalles: list[str], tirages: int) -> list:
    out = []
    for intervalle in intervalles:
        par_heure = BARRES_PAR_HEURE[intervalle]
        for actif in ACTIFS:
            try:
                bars = load_from_file(f"data/{actif}_{intervalle}_real.json",
                                      actif, intervalle)
            except (DataUnavailable, FileNotFoundError):
                continue

            declencheurs = {
                "pic_volume": pic_de_volume(bars),
                "cascade_liquidations": cascade_liquidations(bars),
                "rupture_volatilite": rupture_volatilite(bars),
            }
            funding = charger_funding(actif, bars) if intervalle == "1h" else None
            if funding is not None:
                declencheurs["funding_extreme"] = funding_extreme(bars, funding)

            for nom, evenements in declencheurs.items():
                if not evenements:
                    continue
                for heures in HORIZONS_H:
                    barres = round(heures * par_heure)
                    if barres < 1:
                        continue      # horizon sous la resolution disponible
                    r = evaluer(bars, evenements, horizon=barres,
                                horizon_libelle=f"{heures:g}h",
                                declencheur=nom, actif=actif,
                                intervalle=intervalle, tirages=tirages)
                    if r is not None:
                        out.append(r)
                        print(f"    {intervalle:>3} {actif:<5} {nom:<21} "
                              f"H+{heures:<5g} n={r.evenements:<4} "
                              f"dir {r.rendement_moyen_bps:+8.1f} bps "
                              f"(p {r.p_direction:.3f})  "
                              f"amp {r.amplitude_moyenne_bps:7.1f} "
                              f"(p {r.p_amplitude:.3f})", flush=True)
    return out


def rapport(res: list, alpha: float) -> None:
    if not res:
        print("\n  Aucune cellule exploitable.\n")
        return

    for _axe, cle_p, cle_val, cle_nul, titre in (
        ("direction", "p_direction", "rendement_moyen_bps", "nul_direction_bps",
         "DIRECTION — le declencheur predit-il le SENS ? (un edge)"),
        ("amplitude", "p_amplitude", "amplitude_moyenne_bps", "nul_amplitude_bps",
         "AMPLITUDE — predit-il qu'il se PASSE quelque chose ? (l'architecture)"),
    ):
        ps = [getattr(r, cle_p) for r in res]
        garde = benjamini_hochberg(ps, alpha)
        bruts = sum(1 for p in ps if p < alpha)
        survivants = [r for r, g in zip(res, garde, strict=True) if g]

        print(f"\n  {titre}")
        print("  " + "=" * 70)
        print(f"  cellules testees                        {len(res):>6}")
        print(f"  p < {alpha} brut                          {bruts:>6}")
        print(f"  attendues par pur hasard                {len(res) * alpha:>6.1f}")
        print(f"  survivantes apres Benjamini-Hochberg    {len(survivants):>6}")
        if not survivants:
            print(f"  ----> AUCUNE. Les {bruts} cellules a p < {alpha} sont "
                  f"compatibles\n        avec le bruit de {len(res)} tests "
                  "simultanes.")
            continue
        print("  ----> SURVIVANTES :")
        for r in sorted(survivants, key=lambda x: getattr(x, cle_p)):
            print(f"        {r.intervalle:>3} {r.actif:<5} {r.declencheur:<21} "
                  f"H+{r.horizon_libelle:<5} n={r.evenements:<4} "
                  f"{getattr(r, cle_val):+8.1f} bps contre "
                  f"{getattr(r, cle_nul):+7.1f} au hasard "
                  f"(p {getattr(r, cle_p):.4f})")

    # Ou l'effet est-il le plus fort, independamment de sa significativite ?
    # Utile pour la carte demandee, dangereux lu seul : c'est le maximum d'un
    # echantillon bruite tant qu'aucune cellule ne survit a la correction.
    print("\n  CARTE DES HORIZONS — moyenne du rendement signe, tous actifs")
    print("  " + "=" * 70)
    noms = sorted({r.declencheur for r in res})
    horizons = sorted({r.horizon_libelle for r in res},
                      key=lambda h: float(h.rstrip("h")))
    print(f"  {'declencheur':<22}" + "".join(f"{'H+' + h:>12}" for h in horizons))
    print("  " + "-" * 70)
    for nom in noms:
        ligne = f"  {nom:<22}"
        for h in horizons:
            lot = [r for r in res if r.declencheur == nom and r.horizon_libelle == h]
            if lot:
                moy = sum(r.rendement_moyen_bps for r in lot) / len(lot)
                ligne += f"{moy:>+11.1f} "
            else:
                ligne += f"{'—':>12}"
        print(ligne)
    print("\n  Tant qu'aucune cellule ne survit a la correction, ce tableau "
          "cartographie\n  du bruit : son maximum est celui d'un echantillon, "
          "pas celui d'un edge.\n")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--tirages", type=int, default=2000)
    p.add_argument("--intervalles", nargs="+", default=["15m", "1h", "4h"])
    p.add_argument("--horizons-h", type=float, nargs="+", default=None,
                   help="horizons en HEURES. Les changer ouvre une nouvelle "
                        "famille d'hypotheses : la correction porte sur la "
                        "campagne lancee, et deux campagnes ne se lisent pas "
                        "comme une seule.")
    p.add_argument("--alpha", type=float, default=0.05)
    p.add_argument("--out", default=None)
    args = p.parse_args()

    horizons = args.horizons_h or HORIZONS_H
    print(f"\n  Declencheurs sur {len(ACTIFS)} actifs, intervalles "
          f"{', '.join(args.intervalles)}, horizons "
          f"{', '.join(f'{h:g}h' for h in horizons)}\n")
    if args.horizons_h:
        HORIZONS_H[:] = args.horizons_h
    res = cellules(args.intervalles, args.tirages)
    rapport(res, args.alpha)

    if args.out:
        Path(args.out).write_text(json.dumps([r.__dict__ for r in res], indent=1))
        print(f"  Resultats bruts : {args.out}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
