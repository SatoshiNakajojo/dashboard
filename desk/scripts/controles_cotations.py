#!/usr/bin/env python3
"""Cinq façons de faire disparaître l'effet des cotations. Tient-il ?

    python3 scripts/controles_cotations.py

`valider_cotations.py` rend une cellule survivante : vendre à découvert, de
J+1 à J+30, les perpétuels dont le PREMIER JOUR a une amplitude supérieure à
30 %. 53 événements, +1 967 bps nets de BTC contre +82 au hasard, 77 % de
gagnants, p sous le plancher de 20 000 tirages.

**Un effet mesuré n'est pas un effet réel.** C'est une cellule isolée sur
huit, et sa réponse à la dose n'est pas monotone — les deux tranches
d'amplitude plus basses perdent de l'argent. Il faut donc essayer de la tuer,
et chaque contrôle ci-dessous est une façon différente d'y arriver.

**1. Jackknife par actif.** Retirer chaque perpétuel à son tour. Un effet
porté par un ou deux jetons n'est pas un effet, c'est une anecdote.

**2. Coupe temporelle.** Première moitié de la période contre seconde. Un
edge qui n'existe que dans la première est un edge déjà arbitré ; un edge qui
n'existe que dans la seconde est un régime, pas une règle.

**3. Délistés contre encore cotés.** Si l'effet ne vit que chez les jetons
finalement retirés de la cote, il n'est pas tradable : on ne sait pas au
moment d'entrer lesquels le seront. C'est le contrôle le plus sévère de la
série, parce que le biais qu'il cherche est celui que la collecte de cette
étude a précisément permis de voir.

**4. Modèle nul PAR BLOC.** Les trois premiers contrôles partagent la même
faiblesse : leur bras aléatoire tire une date indépendante par événement, ce
qui suppose que 53 cotations sont 53 observations. Elles ne le sont pas — on
cote en grappes, et les grappes tombent dans les mêmes semaines de marché.
Le nul par bloc décale TOUTES les dates du même nombre de jours et préserve
donc la structure calendaire. C'est le contrôle qui a le plus de chances de
tuer l'effet, et c'est pour ça qu'il existe.

**5. Sensibilité au seuil de 30 %.** La borne a été posée d'avance, mais si
l'effet n'existe qu'à 30 % exactement et disparaît à 25 ou 35, ce n'est pas
un seuil, c'est une coïncidence.
"""

from __future__ import annotations

import argparse
import json
import random
import statistics as st
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from valider_cotations import (
    REFERENCE,
    charger,
    evenements,
    rendement,
    serie,
)

DUREE = 30          # la fenetre survivante : J+1 -> J+30
AMPLITUDE = 0.30    # la tranche survivante : premier jour > 30 %


def net(e: dict, btc: dict, jour0: int, duree: int) -> float:
    """Le rendement du SHORT, net de BTC, depuis `jour0`."""
    r, _ = rendement(e["par_jour"], jour0, jour0 + duree)
    rb, _ = rendement(btc, jour0, jour0 + duree)
    return -(r - rb)


def observe(evs: list[dict], btc: dict, duree: int = DUREE) -> dict:
    xs = [net(e, btc, e["jour0"], duree) for e in evs]
    return {"n": len(xs), "moyenne_bps": st.mean(xs) * 10_000,
            "mediane_bps": st.median(xs) * 10_000,
            "gagnants": sum(1 for x in xs if x > 0) / len(xs)}


def nul_independant(evs, btc, tirages, rng, duree=DUREE) -> list[float]:
    """Une date tirée par événement, dans l'histoire du même actif."""
    out = []
    for _ in range(tirages):
        s = 0.0
        for e in evs:
            jours = sorted(e["par_jour"])
            possibles = [j for j in jours if j + duree <= jours[-1]] or jours[:1]
            s += net(e, btc, rng.choice(possibles), duree)
        out.append(s / len(evs))
    return out


# Marge minimale d'historique apres cotation pour qu'un evenement entre dans
# le nul par bloc. Voir `nul_par_bloc` : sans elle, le controle est inerte.
MARGE_BLOC = 100


def nul_par_bloc(evs, btc, tirages, rng, duree=DUREE,
                 marge_min: int = MARGE_BLOC) -> tuple[list[float], int, int]:
    """UN décalage pour tout le monde. La structure calendaire est préservée.

    C'est le contrôle qui compte : si vingt cotations tombent la même semaine,
    leurs vingt rendements partagent la même semaine de marché et ne valent
    pas vingt observations. Un nul qui les tire séparément casse cette
    dépendance et rend un p trop petit.

    **LE PIÈGE, et la première version y est tombée.** Le décalage commun est
    borné par le plus court des historiques post-cotation. Un seul actif jeune
    suffit à écraser la plage : avec JELLY, elle valait [0, 25] jours, si bien
    que chaque tirage « au hasard » recouvrait la fenêtre observée et que le
    nul mesurait l'observation elle-même. Il rendait alors p = 0,15 et
    « tuait » l'effet — un faux négatif qui ressemble exactement à un
    contrôle réussi.

    On exige donc `marge_min` jours d'historique après cotation pour entrer
    dans ce contrôle, et on RAPPORTE la plage obtenue : un contrôle dont on
    ne connaît pas l'amplitude ne contrôle rien.
    """
    gardes = []
    for e in evs:
        jours = sorted(e["par_jour"])
        if jours[-1] - duree - e["jour0"] >= marge_min:
            gardes.append(e)
    if len(gardes) < 10:
        return [], 0, len(gardes)

    haut = min(sorted(e["par_jour"])[-1] - duree - e["jour0"] for e in gardes)
    out = []
    for _ in range(tirages):
        d = rng.randint(1, haut)          # jamais 0 : ce serait l'observation
        out.append(sum(net(e, btc, e["jour0"] + d, duree) for e in gardes)
                   / len(gardes))
    return out, haut, len(gardes)


def p_unilateral(observe_: float, nuls: list[float]) -> tuple[float, int]:
    mieux = sum(1 for x in nuls if x >= observe_)
    return (mieux + 1) / (len(nuls) + 1), len(nuls)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--donnees", default="data/cotations.json")
    ap.add_argument("--tirages", type=int, default=5000)
    ap.add_argument("--artefact", default="baselines/cotations.json",
                    help="y inscrire le verdict des contrôles. Sans ça, "
                         "l'interface lirait « 1 survivant » pour une "
                         "cellule que le contrôle par bloc réfute — une "
                         "campagne doit voyager avec ses contrôles.")
    args = ap.parse_args()

    actifs = charger(args.donnees)
    btc = serie(actifs[REFERENCE])
    tous = evenements(actifs, DUREE)
    evs = [e for e in tous if e["amplitude"] >= AMPLITUDE]
    rng = random.Random(20260914)

    base = observe(evs, btc)
    print(f"\n  LA CELLULE À ABATTRE — cotation, amplitude J0 > {AMPLITUDE:.0%}, "
          f"short J+1 → J+{DUREE}")
    print("  " + "─" * 74)
    print(f"  {base['n']} événements · moyenne {base['moyenne_bps']:+.1f} bps · "
          f"médiane {base['mediane_bps']:+.1f} · {base['gagnants']:.0%} gagnants\n")

    # ---------------------------------------------------------------- 1
    print("  1. JACKKNIFE PAR ACTIF — un effet porté par un jeton n'est pas un effet")
    print("  " + "─" * 74)
    pires = []
    for nom in sorted({e["symbole"] for e in evs}):
        reste = [e for e in evs if e["symbole"] != nom]
        if len(reste) < 10:
            continue
        nuls = nul_independant(reste, btc, 400, random.Random(1), DUREE)
        o = observe(reste, btc)
        p, _ = p_unilateral(o["moyenne_bps"] / 10_000, nuls)
        pires.append((p, nom, o["moyenne_bps"], o["n"]))
    pires.sort(reverse=True)
    for p, nom, m, n in pires[:4]:
        print(f"     sans {nom:<10} n={n:<3} moyenne {m:>+8.1f} bps   p={p:.4f}")
    print(f"     … pire exclusion : p = {pires[0][0]:.4f} "
          f"{'— tient' if pires[0][0] < 0.05 else '— NE TIENT PAS'}\n")

    # ---------------------------------------------------------------- 2
    print("  2. COUPE TEMPORELLE — l'effet vit-il des deux côtés ?")
    print("  " + "─" * 74)
    med = st.median([e["jour0"] for e in evs])
    for nom, sous in (("première moitié", [e for e in evs if e["jour0"] <= med]),
                      ("seconde moitié", [e for e in evs if e["jour0"] > med])):
        if len(sous) < 8:
            print(f"     {nom:<16} trop peu d'événements")
            continue
        o = observe(sous, btc)
        nuls = nul_independant(sous, btc, args.tirages, random.Random(2), DUREE)
        p, _ = p_unilateral(o["moyenne_bps"] / 10_000, nuls)
        print(f"     {nom:<16} n={o['n']:<3} moyenne {o['moyenne_bps']:>+8.1f} bps · "
              f"{o['gagnants']:>3.0%} gagnants · p={p:.4f}")
    print()

    # ---------------------------------------------------------------- 3
    print("  3. DÉLISTÉS CONTRE ENCORE COTÉS — l'effet est-il tradable ?")
    print("  " + "─" * 74)
    for nom, sous in (("encore cotés", [e for e in evs if not e["delisté"]]),
                      ("depuis délistés", [e for e in evs if e["delisté"]])):
        if len(sous) < 8:
            print(f"     {nom:<16} n={len(sous)} — trop peu pour conclure")
            continue
        o = observe(sous, btc)
        nuls = nul_independant(sous, btc, args.tirages, random.Random(3), DUREE)
        p, _ = p_unilateral(o["moyenne_bps"] / 10_000, nuls)
        print(f"     {nom:<16} n={o['n']:<3} moyenne {o['moyenne_bps']:>+8.1f} bps · "
              f"{o['gagnants']:>3.0%} gagnants · p={p:.4f}")
    print("     Si l'effet ne vit que chez les délistés, il n'est PAS tradable :")
    print("     on ne sait pas, en entrant, lesquels le seront.\n")

    # ---------------------------------------------------------------- 4
    print("  4. MODÈLE NUL PAR BLOC — le contrôle qui respecte les grappes")
    print("  " + "─" * 74)
    bloc, plage, n_gardes = nul_par_bloc(evs, btc, args.tirages, rng, DUREE)
    sous = [e for e in evs
            if sorted(e["par_jour"])[-1] - DUREE - e["jour0"] >= MARGE_BLOC]
    o_sous = observe(sous, btc)
    indep = nul_independant(evs, btc, args.tirages, random.Random(4), DUREE)
    p_ind, _ = p_unilateral(base["moyenne_bps"] / 10_000, indep)
    print(f"     nul indépendant  moyenne {st.mean(indep) * 10_000:>+8.1f} bps · "
          f"p = {p_ind:.4f}   (53 événements)")
    if bloc:
        p_bloc, _ = p_unilateral(o_sous["moyenne_bps"] / 10_000, bloc)
        print(f"     nul PAR BLOC     moyenne {st.mean(bloc) * 10_000:>+8.1f} bps · "
              f"p = {p_bloc:.4f}   ({n_gardes} événements, décalages de 1 à "
              f"{plage} jours)")
        print(f"     observé sur ce même sous-ensemble : "
              f"{o_sous['moyenne_bps']:>+8.1f} bps · {o_sous['gagnants']:.0%} gagnants")
        print(f"     {'TIENT' if p_bloc < 0.05 else 'NE TIENT PAS'} — "
              "c'est ce p-là qui compte.\n")
    else:
        print("     trop peu d'événements avec assez de marge : contrôle impossible.\n")

    # ---------------------------------------------------------------- 5
    print("  5. SENSIBILITÉ AU SEUIL — 30 % est-il un seuil ou une coïncidence ?")
    print("  " + "─" * 74)
    for seuil in (0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.50):
        sous = [e for e in tous if e["amplitude"] >= seuil]
        if len(sous) < 10:
            print(f"     > {seuil:>4.0%}   n={len(sous):<3} trop peu")
            continue
        o = observe(sous, btc)
        nuls = nul_independant(sous, btc, 800, random.Random(5), DUREE)
        p, _ = p_unilateral(o["moyenne_bps"] / 10_000, nuls)
        barre = "█" * max(0, int(o["moyenne_bps"] / 250))
        print(f"     > {seuil:>4.0%}   n={o['n']:<3} moyenne {o['moyenne_bps']:>+8.1f} bps "
              f"· {o['gagnants']:>3.0%} gagn. · p={p:.4f}  {barre}")
    # ----------------------------------------------------------- l'artefact
    #
    # Le criblage d'une campagne ne connait pas ses controles. Sans ce
    # bloc, `baselines/cotations.json` porterait une cellule survivante,
    # l'interface l'afficherait comme un edge directionnel, et la ligne
    # « edge » du pre-vol passerait au vert — pour un resultat que le
    # controle par bloc refute. Une campagne doit voyager avec ses
    # controles, ou ne pas voyager.
    chemin = Path(args.artefact)
    if chemin.exists() and bloc:
        art = json.loads(chemin.read_text(encoding="utf-8"))
        art["controles"] = {
            "nul_par_bloc": {
                "p": p_bloc,
                "observe_bps": o_sous["moyenne_bps"],
                "nul_bps": st.mean(bloc) * 10_000,
                "evenements": n_gardes,
                "plage_jours": plage,
            },
            "verdict": "refute" if p_bloc >= 0.05 else "tient",
            "raison": (
                "le modèle nul par bloc — un seul décalage pour toutes les "
                "dates, qui préserve les grappes de cotation — rend "
                f"{st.mean(bloc) * 10_000:+.0f} bps contre "
                f"{o_sous['moyenne_bps']:+.0f} observés, p = {p_bloc:.4f}. "
                "Ce n'est pas la cotation qui paie, c'est la classe d'actifs."
            ) if p_bloc >= 0.05 else "l'effet survit au nul par bloc",
        }
        chemin.write_text(json.dumps(art, indent=1, ensure_ascii=False),
                          encoding="utf-8")
        print(f"  Verdict des contrôles inscrit dans {chemin}.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
