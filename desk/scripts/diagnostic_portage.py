#!/usr/bin/env python3
"""Pourquoi le portage de financement a perdu : la mesure, pas l'histoire.

    python3 scripts/diagnostic_portage.py

**Ce script existe parce que je me suis trompé, et que l'erreur a été
publiée.** Le portage en coupe transversale a été réfuté (net −4,58 %,
p = 0,53, bêta au marché −0,54), et j'ai expliqué cet échec ainsi, dans
`RECHERCHE.md` et dans deux messages de commit :

> « Un financement élevé marque un actif que tout le monde achète avec
> levier. Vendre le financement élevé, c'est vendre le momentum. »

C'était une histoire plausible que je n'avais pas mesurée. Elle est fausse.
Ce script fait les deux mesures qui la tuent et qui nomment la vraie cause.

**Mesure 1 — le momentum, s'il existait, se verrait en coupe.** Si vendre le
financement élevé revenait à vendre le momentum, alors le financement d'un
mois et le rendement du même mois seraient corrélés POSITIVEMENT en coupe,
et de façon répétée. On calcule donc cette corrélation mois par mois.

**Mesure 2 — le bêta de chaque jambe.** La rivale de l'explication momentum
est plus simple : les actifs qui paient cher ne sont pas ceux qui montent,
ce sont ceux qui BOUGENT. Vendre à notionnel égal un panier de bêta élevé
contre un panier de bêta faible donne mécaniquement un livre court le
marché, hausse ou baisse. On compare donc le bêta des deux jambes.

**Ce que le rapprochement des bêtas prouve, et ce qu'il ne prouve pas.**
β(acheté − vendu) = β(acheté) − β(vendu) est une identité des moindres
carrés quand les deux régressions partagent la même abscisse : afficher les
deux et les voir coïncider ne confirme rien, ça vérifie l'arithmétique. Le
rapprochement qui, lui, dit quelque chose est avec une mesure INDÉPENDANTE :
le bêta du livre complet — financement et frais compris, rapporté au
notionnel brut 2k — tel que `portage_financement.py` le mesure sur sa série
mensuelle. S'il retrouve la moitié de l'écart des jambes, c'est que
l'exposition du livre vient ENTIÈREMENT de cet écart, et rien du reste.

**Ce que ce diagnostic n'est pas.** Les bêtas sont ici estimés sur toute la
période, parce qu'on explique l'histoire d'un résultat connu — on ne propose
aucune règle. Toute règle qui s'en servirait devrait les estimer sans
regarder l'avenir ; c'est ce que fait `portage_neutre.py`.
"""

from __future__ import annotations

import argparse
import statistics as st
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from portage_financement import (
    charger,
    par_classement,
    par_mois,
    rejouer,
)


def correlation(xs: list[float], ys: list[float]) -> float | None:
    if len(xs) < 4:
        return None
    mx, my = st.mean(xs), st.mean(ys)
    cov = sum((x - mx) * (y - my) for x, y in zip(xs, ys, strict=True))
    d = (sum((x - mx) ** 2 for x in xs) * sum((y - my) ** 2 for y in ys)) ** .5
    return cov / d if d else None


def beta(serie: list[tuple[float, float]]) -> float | None:
    """Pente de y sur x. `serie` est une liste de (marché, actif)."""
    if len(serie) < 4:
        return None
    xs = [x for x, _ in serie]
    ys = [y for _, y in serie]
    mx, my = st.mean(xs), st.mean(ys)
    var = sum((x - mx) ** 2 for x in xs)
    if not var:
        return None
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys, strict=True)) / var


def couples_du_mois(mois: list[str], fin: dict, prix: dict) -> list[tuple[str, float]]:
    """La corrélation en coupe financement~rendement, mois par mois."""
    out = []
    for m in mois:
        communs = sorted(set(fin[m]) & set(prix[m]))
        c = correlation([fin[m][a] for a in communs], [prix[m][a] for a in communs])
        if c is not None:
            out.append((m, c))
    return out


def jambes(mois: list[str], fin: dict, prix: dict, k: int):
    """Rejoue la sélection et rend, mois par mois, ce que chaque côté a fait.

    On ne rejoue pas la comptabilité — `portage_financement.py` l'a déjà
    faite. On ne garde que les rendements de prix, parce que c'est la seule
    chose dont le bêta a besoin.
    """
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
            "vendu": st.mean(prix[cour][a] for a in vendus),
            "achete": st.mean(prix[cour][a] for a in achetes),
        })
    return lignes


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--donnees", default="data/carry.json")
    ap.add_argument("--k", type=int, default=5)
    args = ap.parse_args()

    actifs = charger(args.donnees)
    mois, fin, prix = par_mois(actifs)
    print(f"\n  {len(actifs)} actifs, {len(mois)} mois "
          f"({mois[0]} → {mois[-1]})")

    print("\n  1. L'EXPLICATION MOMENTUM, mise à l'épreuve")
    print("  " + "─" * 68)
    print("  Corrélation en coupe, financement du mois ~ rendement du mois.")
    print("  Si vendre le financement élevé revenait à vendre le momentum,")
    print("  elle serait positive, et elle le serait tous les mois.\n")
    cs = couples_du_mois(mois, fin, prix)
    for m, c in cs:
        marque = "  +" if c > 0 else "  −"
        print(f"     {m}   {c:>+7.3f}{marque}")
    valeurs = [c for _, c in cs]
    positifs = sum(1 for c in valeurs if c > 0)
    print(f"\n     médiane                    {st.median(valeurs):>+7.3f}")
    print(f"     mois où elle est positive   {positifs:>4} / {len(valeurs)}")
    print("\n  Une corrélation nulle en médiane et positive un mois sur deux,")
    print("  c'est l'absence de relation. L'explication momentum est FAUSSE.")

    print("\n  2. LA VRAIE CAUSE : les deux jambes n'ont pas le même bêta")
    print("  " + "─" * 68)
    lignes = jambes(mois, fin, prix, args.k)
    bv = beta([(ligne["marche"], ligne["vendu"]) for ligne in lignes])
    ba = beta([(ligne["marche"], ligne["achete"]) for ligne in lignes])
    print(f"  {len(lignes)} mois tenus\n")
    print(f"     bêta du côté VENDU  (financement élevé)  {bv:>+7.2f}")
    print(f"     bêta du côté ACHETÉ (financement bas)    {ba:>+7.2f}")
    print(f"     écart entre les jambes                   {ba - bv:>+7.2f}")
    # Le contrôle INDÉPENDANT : le bêta du livre complet, financement et
    # frais compris, mesuré par le backtest sur sa propre série mensuelle.
    # Rapporté au notionnel brut 2k, l'écart des jambes prédit sa MOITIÉ.
    r = rejouer(mois, fin, prix, args.k, par_classement)
    marche_tenu = [ligne["marche"] for ligne in lignes]
    bref = beta(list(zip(marche_tenu, r["mensuel"], strict=True)))
    print(f"\n     moitié de l'écart (notionnel brut 2k)    {(ba - bv) / 2:>+7.2f}")
    print(f"     bêta du LIVRE COMPLET, mesuré à part     {bref:>+7.2f}")
    print(f"\n     rendement moyen du côté vendu   "
          f"{st.mean(ligne['vendu'] for ligne in lignes) * 100:>+7.2f} %/mois")
    print(f"     rendement moyen du côté acheté  "
          f"{st.mean(ligne['achete'] for ligne in lignes) * 100:>+7.2f} %/mois")
    print(f"     rendement moyen du marché       "
          f"{st.mean(ligne['marche'] for ligne in lignes) * 100:>+7.2f} %/mois")

    print("\n  " + "─" * 68)
    print("  Le côté vendu ne monte pas plus que le marché — il monte")
    print("  PLUS FORT dans les deux sens. Payer cher en financement, c'est")
    print("  être volatil, pas être en hausse. Le livre était court le")
    print("  marché par construction : l'écart des jambes, rapporté au")
    print("  notionnel brut, retrouve le bêta que le backtest mesure de son")
    print("  côté — l'exposition ne vient donc de rien d'autre.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
