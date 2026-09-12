#!/usr/bin/env python3
"""Le financement, une fois retiré ce que le rendement du mois explique.

    python3 scripts/portage_residuel.py

**D'où vient cette hypothèse — et l'erreur qui l'a fait naître.** Le portage
en coupe transversale a été mesuré et réfuté : financement encaissé
+13,75 %, effet des prix −17,43 %, net −4,58 %, indiscernable du hasard
(p = 0,53), bêta au marché −0,54. J'ai attribué cet échec au momentum :
« un financement élevé marque un actif que tout le monde achète avec levier,
et le vendre, c'est parier contre ce mouvement ». Cette hypothèse-ci est née
de cette explication-là.

**L'explication était fausse**, et `diagnostic_portage.py` la mesuré :
la corrélation en coupe entre le financement d'un mois et le rendement du
même mois est nulle — médiane −0,013, positive six mois sur douze. La vraie
cause est un écart de bêta entre les jambes (+1,93 contre +0,82), traité par
`portage_neutre.py`.

Le test ci-dessous reste écrit et exécuté tel quel, parce qu'il se défend
sans son histoire d'origine : retirer d'un signal la part qu'un autre
facteur explique est une opération légitime, quelle que soit la raison qui
l'a suggérée. Ce qu'il faut savoir, c'est que la part retirée ici s'avère
être proche de rien.

**La règle, déclarée avant de mesurer.** Chaque mois et en coupe, on
régresse le financement du mois sur le rendement du même mois, et on classe
par le RÉSIDU. Vendre le résidu le plus élevé, c'est vendre ce qui paie cher
SANS que son rendement le justifie.

    financement_i = a + b × rendement_i + résidu_i

La régression est refaite chaque mois : la relation entre financement et
rendement n'a aucune raison d'être stable, et la figer serait introduire un
paramètre ajusté sur l'ensemble de la période.

**Ce que ce test ne peut pas prouver.** L'hypothèse est NÉE du diagnostic
d'un échec sur CES données. Elle est donc dans l'échantillon, et ce dépôt
sait ce que ça vaut : `rsi_continuation` est née de la grille de la même
façon et n'a pas survécu à dix-huit actifs neufs. Un résultat positif ici ne
vaudrait pas conclusion — il vaudrait candidature à un test hors
échantillon. Un résultat négatif, lui, réfute pour de bon.

Onze rebalancements, comme le portage simple. Ils peuvent réfuter.
"""

from __future__ import annotations

import argparse
import random
import statistics as st
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from portage_financement import (
    au_hasard,
    charger,
    par_classement,
    par_mois,
    rejouer,
)


def regression(xs: list[float], ys: list[float]) -> tuple[float, float]:
    """Pente et ordonnée de y = a + b·x, par les moindres carrés.

    Rend une pente nulle si x est constant : sans variance en abscisse, la
    pente n'est pas définie, et la forcer donnerait un résidu arbitraire.
    """
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    var = sum((x - mx) ** 2 for x in xs)
    if var == 0:
        return my, 0.0
    b = sum((x - mx) * (y - my) for x, y in zip(xs, ys, strict=True)) / var
    return my - b * mx, b


def residus_par_mois(mois: list[str], fin: dict, prix: dict) -> dict:
    """Le financement de chaque actif, privé de sa part explicable.

    On régresse EN COUPE, mois par mois : tous les actifs d'un même mois
    entrent dans la même régression. Une régression dans le temps, actif par
    actif, mesurerait autre chose — la sensibilité propre d'un jeton, pas
    l'écart à ses pairs du moment.
    """
    out: dict[str, dict[str, float]] = {}
    for m in mois:
        communs = sorted(set(fin[m]) & set(prix[m]))
        if len(communs) < 8:          # une régression sur quatre points ne dit rien
            continue
        xs = [prix[m][a] for a in communs]
        ys = [fin[m][a] for a in communs]
        a0, b = regression(xs, ys)
        out[m] = {nom: fin[m][nom] - (a0 + b * prix[m][nom]) for nom in communs}
    return out


def par_residu(residus: dict):
    """Vendre le résidu le plus élevé, acheter le plus bas."""
    def choisir(eligibles, _classement, k, mois):
        table = residus.get(mois)
        if not table:
            return [], []
        notes = [a for a in eligibles if a in table]
        if len(notes) < 2 * k:
            return [], []
        ordre = sorted(notes, key=lambda a: -table[a])
        return ordre[:k], ordre[-k:]
    return choisir


def beta_au_marche(mensuel: list[float], marche: list[float]) -> tuple[float, float]:
    """Corrélation et bêta du livre au marché. À REGARDER AVANT LE NET.

    C'est la leçon du portage simple : il affichait huit mois positifs sur
    onze, et c'est son bêta de -0,54 — pas son total — qui disait ce qu'il
    était vraiment.
    """
    n = len(mensuel)
    if n < 3:
        return 0.0, 0.0
    mm, mp = st.mean(marche), st.mean(mensuel)
    cov = sum((a - mm) * (b - mp) for a, b in zip(marche, mensuel, strict=True)) / (n - 1)
    vm = st.variance(marche)
    sd = st.stdev(marche) * st.stdev(mensuel)
    return (cov / sd if sd else 0.0), (cov / vm if vm else 0.0)


def marche_mensuel(mois: list[str], prix: dict) -> list[float]:
    """Le marché : moyenne équipondérée des actifs du mois tenu."""
    out = []
    for i in range(1, len(mois)):
        v = list(prix[mois[i]].values())
        out.append(sum(v) / len(v) if v else 0.0)
    return out


def rapport(nom: str, r: dict, marche: list[float], nuls: list[float],
            tirages: int) -> None:
    print(f"\n  {nom}")
    print("  " + "─" * 68)
    print(f"  financement encaissé                {r['portage'] * 100:>+9.2f} %")
    print(f"  effet des prix                      {r['cours'] * 100:>+9.2f} %")
    print(f"  frais                               {-r['frais'] * 100:>+9.2f} %")
    print(f"  NET                                 {r['net'] * 100:>+9.2f} %")
    m = r["mensuel"]
    if len(m) > 1:
        ec = st.stdev(m)
        corr, beta = beta_au_marche(m, marche[:len(m)])
        gagnants = sum(1 for x in m if x > 0)
        print(f"  mois positifs                       {gagnants:>6} / {len(m)}")
        print(f"  écart-type mensuel                  {ec * 100:>9.2f} %")
        # Le bêta AVANT le Sharpe : un livre dit neutre qui porte du bêta
        # n'est pas un portage, quel que soit son Sharpe.
        print(f"  corrélation au marché               {corr:>9.2f}")
        print(f"  bêta au marché                      {beta:>9.2f}")
        if ec:
            print(f"  Sharpe annualisé (approx.)          {st.mean(m) / ec * 12 ** .5:>9.2f}")
    mieux = sum(1 for x in nuls if x >= r["net"])
    p = (mieux + 1) / (tirages + 1)
    print(f"  net moyen du hasard                 {st.mean(nuls) * 100:>+9.2f} %")
    print(f"  p (unilatéral)                      {p:>9.5f}"
          f"   plancher {1 / (tirages + 1):.5f}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--donnees", default="data/carry.json")
    ap.add_argument("--k", type=int, default=5)
    ap.add_argument("--tirages", type=int, default=2000)
    args = ap.parse_args()

    actifs = charger(args.donnees)
    mois, fin, prix = par_mois(actifs)
    marche = marche_mensuel(mois, prix)
    print(f"\n  {len(actifs)} actifs, {len(mois)} mois "
          f"({mois[0]} → {mois[-1]}), {len(mois) - 1} rebalancements")

    residus = residus_par_mois(mois, fin, prix)
    print(f"  régression en coupe sur {len(residus)} mois")

    rng = random.Random(20260912)
    nuls = [rejouer(mois, fin, prix, args.k, au_hasard(rng))["net"]
            for _ in range(args.tirages)]

    rapport("TÉMOIN — classement par le financement brut (déjà réfuté)",
            rejouer(mois, fin, prix, args.k, par_classement), marche, nuls,
            args.tirages)
    rapport("CANDIDAT — classement par le RÉSIDU de financement",
            rejouer(mois, fin, prix, args.k, par_residu(residus)), marche, nuls,
            args.tirages)

    print("\n  " + "─" * 68)
    print("  L'hypothèse est née du diagnostic d'un échec sur CES données.")
    print("  Un résultat positif ne vaudrait pas conclusion, mais candidature")
    print("  à un test hors échantillon. Un négatif réfute pour de bon.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
