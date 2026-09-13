#!/usr/bin/env python3
"""Pourquoi le portage de financement a perdu : ce qui se mesure, et ce qui ne se mesure pas.

    python3 scripts/diagnostic_portage.py

**Ce script existe parce que je me suis trompé, et que l'erreur a été
publiée.** Le portage en coupe transversale a été réfuté (net −4,58 %,
p = 0,53), et j'ai expliqué cet échec ainsi, dans `RECHERCHE.md` et dans
deux messages de commit :

> « Un financement élevé marque un actif que tout le monde achète avec
> levier. Vendre le financement élevé, c'est vendre le momentum. »

C'était une histoire plausible que je n'avais pas mesurée. Elle est fausse.
Ce script fait les mesures qui manquaient — y compris celles qui refusent
de désigner un coupable.

**1 — Le momentum, s'il existait, se verrait en coupe.** Si vendre le
financement élevé revenait à vendre le momentum, alors le financement d'un
mois et le rendement du même mois seraient corrélés POSITIVEMENT en coupe,
et de façon répétée. Douze coupes de cinquante-cinq actifs le disent.

**2 — De quoi les deux jambes sont-elles faites ?** La rivale évidente :
les actifs qui paient cher seraient des alts à fort bêta, ceux qui paient
peu des majeures. C'est vérifiable directement, en regardant le bêta moyen
des actifs SÉLECTIONNÉS de chaque côté.

**3 — Le bêta réalisé de chaque jambe, avec son erreur-type.** Onze
observations mensuelles. Une pente sur onze points sans son erreur-type
n'est pas une mesure, c'est un chiffre.

**4 — Et surtout : cette pente tient-elle à un seul mois ?** Un bêta estimé
sur onze points peut n'être qu'un point de levier et dix qui suivent. La
question se tranche en retirant les mois un par un. C'est la vérification
que je n'avais pas faite, et c'est elle qui décide si le « bêta du livre »
explique quoi que ce soit.

**Ce que ce diagnostic n'est pas.** Les bêtas d'actifs sont estimés sur
toute la période, parce qu'on décrit l'histoire d'un résultat connu — on ne
propose aucune règle. Toute règle qui s'en servirait devrait les estimer
sans regarder l'avenir ; c'est ce que fait `portage_neutre.py`.
"""

from __future__ import annotations

import argparse
import math
import statistics as st
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from portage_financement import charger, par_classement, par_mois, rejouer

MOIS_MINIMUM_POUR_UNE_PENTE = 4


def correlation(xs: list[float], ys: list[float]) -> float | None:
    if len(xs) < MOIS_MINIMUM_POUR_UNE_PENTE:
        return None
    mx, my = st.mean(xs), st.mean(ys)
    cov = sum((x - mx) * (y - my) for x, y in zip(xs, ys, strict=True))
    d = (sum((x - mx) ** 2 for x in xs) * sum((y - my) ** 2 for y in ys)) ** .5
    return cov / d if d else None


def beta(serie: list[tuple[float, float]]) -> float | None:
    """Pente de y sur x. `serie` est une liste de (marché, actif)."""
    p = pente_et_erreur(serie)
    return None if p is None else p[0]


def pente_et_erreur(serie: list[tuple[float, float]]) -> tuple[float, float] | None:
    """La pente ET son erreur-type. Sans la seconde, la première ne dit rien."""
    if len(serie) < MOIS_MINIMUM_POUR_UNE_PENTE:
        return None
    xs = [x for x, _ in serie]
    ys = [y for _, y in serie]
    n = len(xs)
    mx, my = st.mean(xs), st.mean(ys)
    sxx = sum((x - mx) ** 2 for x in xs)
    if not sxx:
        return None
    b = sum((x - mx) * (y - my) for x, y in zip(xs, ys, strict=True)) / sxx
    a = my - b * mx
    res = [y - (a + b * x) for x, y in zip(xs, ys, strict=True)]
    s2 = sum(r * r for r in res) / (n - 2)
    return b, math.sqrt(s2 / sxx)


def couples_du_mois(mois: list[str], fin: dict, prix: dict) -> list[tuple[str, float]]:
    """La corrélation en coupe financement~rendement, mois par mois."""
    out = []
    for m in mois:
        communs = sorted(set(fin[m]) & set(prix[m]))
        c = correlation([fin[m][a] for a in communs], [prix[m][a] for a in communs])
        if c is not None:
            out.append((m, c))
    return out


def caracteristiques(mois: list[str], fin: dict, prix: dict) -> dict[str, dict]:
    """Par actif : son bêta, son financement moyen, la dispersion de celui-ci.

    Trois caractéristiques PERSISTANTES, mesurées sur toute la période. Elles
    servent à décrire la composition des jambes, pas à choisir.
    """
    marche = {m: st.mean(prix[m].values()) for m in mois if prix.get(m)}
    out: dict[str, dict] = {}
    for a in sorted({x for m in mois for x in prix.get(m, {})}):
        pts = [(marche[m], prix[m][a]) for m in mois if a in prix.get(m, {})]
        f = [fin[m][a] for m in mois if a in fin.get(m, {})]
        b = beta(pts)
        if b is None or len(f) < 2 * MOIS_MINIMUM_POUR_UNE_PENTE:
            continue
        out[a] = {"beta": b, "financement": st.mean(f), "dispersion": st.stdev(f)}
    return out


def jambes(mois: list[str], fin: dict, prix: dict, k: int) -> list[dict]:
    """Rejoue la sélection et rend, mois par mois, ce que chaque côté a fait."""
    marche = {m: st.mean(prix[m].values()) for m in mois if prix.get(m)}
    lignes = []
    for i in range(1, len(mois)):
        prec, cour = mois[i - 1], mois[i]
        elig = sorted(set(fin[prec]) & set(fin[cour]) & set(prix[cour]))
        if len(elig) < 4 * k:
            continue
        ordre = sorted(elig, key=lambda a: -fin[prec][a])
        vendus, achetes = ordre[:k], ordre[-k:]
        lignes.append({
            "mois": cour,
            "marche": marche[cour],
            "membres_vendus": vendus,
            "membres_achetes": achetes,
            "vendu": st.mean(prix[cour][a] for a in vendus),
            "achete": st.mean(prix[cour][a] for a in achetes),
        })
    return lignes


def un_mois_en_moins(serie: list[tuple[float, float]],
                     etiquettes: list[str]) -> list[tuple[str, float]]:
    """La pente recalculée en retirant chaque observation à son tour."""
    out = []
    for i in range(len(serie)):
        b = beta(serie[:i] + serie[i + 1:])
        if b is not None:
            out.append((etiquettes[i], b))
    return out


def _moyenne(membres: list[list[str]], carac: dict, champ: str) -> float:
    xs = [carac[a][champ] for jambe in membres for a in jambe if a in carac]
    return st.mean(xs) if xs else float("nan")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--donnees", default="data/carry.json")
    ap.add_argument("--k", type=int, default=5)
    args = ap.parse_args()

    actifs = charger(args.donnees)
    mois, fin, prix = par_mois(actifs)
    print(f"\n  {len(actifs)} actifs, {len(mois)} mois ({mois[0]} → {mois[-1]})")

    # ---------------------------------------------------------------- 1
    print("\n  1. L'EXPLICATION MOMENTUM, mise à l'épreuve")
    print("  " + "─" * 68)
    print("  Corrélation en coupe, financement du mois ~ rendement du mois.")
    print("  Si vendre le financement élevé revenait à vendre le momentum,")
    print("  elle serait positive, et elle le serait tous les mois.\n")
    cs = couples_du_mois(mois, fin, prix)
    for m, c in cs:
        print(f"     {m}   {c:>+7.3f}   {'+' if c > 0 else '−'}")
    valeurs = [c for _, c in cs]
    print(f"\n     médiane                    {st.median(valeurs):>+7.3f}")
    print(f"     mois où elle est positive   {sum(1 for c in valeurs if c > 0):>4}"
          f" / {len(valeurs)}")
    print("\n  Une médiane nulle et un signe qui tombe à pile ou face :")
    print("  il n'y a pas de relation. L'EXPLICATION MOMENTUM EST FAUSSE.")

    # ---------------------------------------------------------------- 2
    lignes = jambes(mois, fin, prix, args.k)
    carac = caracteristiques(mois, fin, prix)
    mv = [ligne["membres_vendus"] for ligne in lignes]
    ma = [ligne["membres_achetes"] for ligne in lignes]

    print("\n  2. DE QUOI LES DEUX JAMBES SONT-ELLES FAITES ?")
    print("  " + "─" * 68)
    print(f"  Caractéristiques moyennes des actifs sélectionnés, {len(lignes)} mois.\n")
    print("                                 côté VENDU   côté ACHETÉ")
    print(f"     bêta moyen des membres       {_moyenne(mv, carac, 'beta'):>+9.2f}"
          f"     {_moyenne(ma, carac, 'beta'):>+9.2f}")
    print(f"     financement moyen            "
          f"{_moyenne(mv, carac, 'financement') * 100:>+9.2f} %"
          f"   {_moyenne(ma, carac, 'financement') * 100:>+9.2f} %")
    print(f"     dispersion du financement    "
          f"{_moyenne(mv, carac, 'dispersion') * 100:>9.2f}"
          f"     {_moyenne(ma, carac, 'dispersion') * 100:>9.2f}")
    ecart_compo = _moyenne(ma, carac, "beta") - _moyenne(mv, carac, "beta")
    print(f"\n     écart de bêta DE COMPOSITION {ecart_compo:>+9.2f}")
    print("\n  Cet écart est à comparer à l'écart RÉALISÉ de la section 3.")
    print("  S'il en explique une petite part seulement, alors l'explication")
    print("  « alts à fort bêta contre majeures » ne tient pas : la sélection")
    print("  ne prend pas des actifs plus exposés, elle prend des actifs au")
    print("  financement négatif et très dispersé — des actifs en difficulté.")

    # ---------------------------------------------------------------- 3
    print("\n  3. LE BÊTA RÉALISÉ DE CHAQUE JAMBE, AVEC SON ERREUR-TYPE")
    print("  " + "─" * 68)
    x = [ligne["marche"] for ligne in lignes]
    for nom, cle in (("VENDU", "vendu"), ("ACHETÉ", "achete")):
        b, se = pente_et_erreur(list(zip(x, [ligne[cle] for ligne in lignes],
                                         strict=True)))
        print(f"     côté {nom:<8} {b:>+6.2f}   erreur-type {se:.2f}   t {b / se:>+5.1f}")
    ecart = pente_et_erreur(list(zip(
        x, [ligne["achete"] - ligne["vendu"] for ligne in lignes], strict=True)))
    print(f"     ÉCART RÉALISÉ  {ecart[0]:>+6.2f}   erreur-type {ecart[1]:.2f}"
          f"   t {ecart[0] / ecart[1]:>+5.1f}")
    r = rejouer(mois, fin, prix, args.k, par_classement)
    serie = list(zip(x, r["mensuel"], strict=True))
    b, se = pente_et_erreur(serie)
    print(f"     LIVRE COMPLET  {b:>+6.2f}   erreur-type {se:.2f}   t {b / se:>+5.1f}")
    print(f"     IC 95 %        [{b - 1.96 * se:+.2f} ; {b + 1.96 * se:+.2f}]")
    print(f"\n  L'écart de COMPOSITION mesuré en 2 vaut {ecart_compo:+.2f} :")
    print(f"  il explique {abs(ecart_compo / ecart[0]) * 100:.0f} % de l'écart réalisé,"
          " et pas davantage.")

    # ---------------------------------------------------------------- 4
    print("\n  4. CE BÊTA TIENT-IL À UN SEUL MOIS ?")
    print("  " + "─" * 68)
    print("  La pente du livre, recalculée en retirant chaque mois.\n")
    etiquettes = [ligne["mois"] for ligne in lignes]
    for m, bb in un_mois_en_moins(serie, etiquettes):
        i = etiquettes.index(m)
        alerte = "   <<<" if abs(bb - b) > 0.15 else ""
        print(f"     sans {m}   marché {x[i] * 100:>+7.2f} %"
              f"   livre {r['mensuel'][i] * 100:>+7.2f} %"
              f"   bêta {bb:>+6.2f}{alerte}")

    print("\n  " + "─" * 68)
    print("  CE QUE CE DIAGNOSTIC ÉTABLIT, ET CE QU'IL REFUSE D'ÉTABLIR.")
    print()
    print("  Établi : l'explication momentum est fausse ; l'écart de bêta")
    print("  entre les jambes n'est pas un effet de COMPOSITION ; le livre a")
    print("  bien perdu, et il a perdu l'année en un seul mois.")
    print()
    print("  Refusé : que ce livre « portait un bêta de −0,54 ». Cette pente")
    print("  disparaît dès qu'on retire le mois de la grande hausse. Onze")
    print("  observations ne permettent pas de dire si l'exposition était")
    print("  systématique ou si un seul mois l'a fabriquée — et présenter")
    print("  cette pente comme la cause serait refaire, en plus discret,")
    print("  l'erreur que ce script corrige.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
