#!/usr/bin/env python3
"""Le portage de financement, en coupe transversale.

    python3 scripts/fetch_carry.py            # collecter d'abord
    python3 scripts/portage_financement.py

**L'idée.** Sur Hyperliquid le financement est positif la plupart du temps :
les longs paient les shorts. Mais un short constant n'est pas un portage, il
porte tout le risque de prix — et sur des actifs dont la volatilité annuelle
dépasse 50 %, un carry de 6 % ne se voit pas.

Ce qui peut être un portage, c'est un ÉCART. Le financement ne paie pas
pareil partout : en février 2026, AVAX encaissait +0,42 % sur le mois quand
SOL en payait 1,35. Vendre le côté qui paie cher et acheter celui qui paie
peu laisse une position dont une bonne part du risque de prix se compense,
puisque ces actifs bougent ensemble.

C'est la corrélation entre cryptos — 0,58 en moyenne, celle qui a ruiné
l'indépendance de la grille de robustesse — qui devient ici un atout.

**La règle, déclarée avant de regarder quoi que ce soit.** Chaque mois : on
classe les actifs par le financement qu'ils ont réellement versé le mois
PRÉCÉDENT ; on vend les K premiers, on achète les K derniers, à notionnel
égal ; on tient un mois. Aucun paramètre n'est ajusté sur le résultat.

**Ce que le script sépare, et c'est le cœur du rapport.** Le résultat se
décompose en trois : ce que le financement a rapporté, ce que le prix a
fait, et ce que les frais ont pris. Un total positif obtenu en perdant sur
le financement et en gagnant sur le prix ne serait pas un portage — ce
serait une position directionnelle déguisée, et elle ne se reproduirait pas.

**Le modèle nul.** Tirer K actifs au hasard de chaque côté, même nombre de
positions, même rotation. Il répond à la seule question qui compte : est-ce
le CLASSEMENT qui rapporte, ou le simple fait d'être short des perpétuels ?

**Ce que ce test ne peut pas prouver.** L'API ne rend qu'un an d'historique
de financement : douze mois, donc onze rebalancements. C'est large en coupe
— soixante actifs — et court dans le temps. Onze observations ne démontrent
rien à elles seules ; elles peuvent en revanche RÉFUTER, et c'est déjà ce
qu'on leur demande.
"""

from __future__ import annotations

import argparse
import json
import random
import statistics as st
import sys
from collections import defaultdict
from pathlib import Path

# Frais : 4,5 bps taker + 3 bps de slippage, le modèle de coût du dépôt.
# Appliqués à chaque ouverture ET fermeture d'une jambe.
COUT_PAR_JAMBE_BPS = 7.5


def charger(chemin: str) -> dict:
    d = json.loads(Path(chemin).read_text())
    return d["actifs"]


# Un mois compte s'il est assez complet. Sans ce seuil, un actif fraîchement
# listé — quatre jours de données — présente une somme de financement
# minuscule, se retrouve classé « le plus bas » et se fait acheter pour une
# raison purement comptable. Le biais serait systématique et invisible : les
# nouveaux actifs arrivent tout le temps, et ils se rangeraient toujours du
# même côté du classement.
JOURS_MINIMUM = 20


def par_mois(actifs: dict) -> tuple[list[str], dict, dict]:
    """Financement sommé et rendement de prix, par actif et par mois."""
    fin: dict[str, dict[str, float]] = defaultdict(dict)
    prix: dict[str, dict[str, float]] = defaultdict(dict)
    for nom, d in actifs.items():
        f: dict[str, float] = defaultdict(float)
        n: dict[str, int] = defaultdict(int)
        for jour, v in d["funding"].items():
            f[jour[:7]] += v
            n[jour[:7]] += 1
        for m, v in f.items():
            if n[m] >= JOURS_MINIMUM:
                fin[m][nom] = v
        # Rendement du mois : première et dernière clôture observées.
        c: dict[str, list[tuple[str, float]]] = defaultdict(list)
        for jour, v in sorted(d["close"].items()):
            c[jour[:7]].append((jour, v))
        for m, serie in c.items():
            if len(serie) >= JOURS_MINIMUM and serie[0][1] > 0:
                prix[m][nom] = serie[-1][1] / serie[0][1] - 1
    mois = sorted(set(fin) & set(prix))
    return mois, fin, prix


def tour(vendus: set[str], achetes: set[str],
         avant_v: set[str], avant_a: set[str], k: int) -> float:
    """Coût du rebalancement, en fraction du notionnel d'une jambe.

    On ne facture que ce qui CHANGE : une position reconduite ne paie rien.
    Facturer l'ensemble à chaque mois surestimerait les frais d'autant que
    le classement est persistant — et c'est justement ce qu'on teste.
    """
    change = len(vendus - avant_v) + len(achetes - avant_a) \
        + len(avant_v - vendus) + len(avant_a - achetes)
    return change * COUT_PAR_JAMBE_BPS / 10_000 / (2 * k)


# Tout est exprimé en fraction du NOTIONNEL BRUT — la somme des deux côtés.
# Poser k longs et k shorts d'une unité chacun, c'est déployer 2k. Rapporter
# le résultat à k au lieu de 2k doublerait tous les chiffres sans rien
# changer à la réalité, et c'est exactement le genre de convention flatteuse
# qu'on ne remarque plus une fois écrite.


def rejouer(mois: list[str], fin: dict, prix: dict, k: int,
            choisir) -> dict:
    """Rejoue la règle mois par mois. `choisir` rend (vendus, achetes)."""
    portage = cours = frais = 0.0
    mensuel: list[float] = []
    avant_v: set[str] = set()
    avant_a: set[str] = set()

    for i in range(1, len(mois)):
        precedent, courant = mois[i - 1], mois[i]
        # Seuls les actifs connus AUX DEUX dates sont éligibles : classer
        # sur un mois puis tenir un actif dont on n'a pas le prix reviendrait
        # à choisir après coup ceux qui ont survécu.
        eligibles = sorted(set(fin[precedent]) & set(fin[courant]) & set(prix[courant]))
        if len(eligibles) < 4 * k:
            continue
        vendus, achetes = choisir(eligibles, fin[precedent], k)

        p = (sum(fin[courant][a] for a in vendus)
             - sum(fin[courant][a] for a in achetes)) / (2 * k)
        c = (sum(prix[courant][a] for a in achetes)
             - sum(prix[courant][a] for a in vendus)) / (2 * k)
        f = tour(set(vendus), set(achetes), avant_v, avant_a, k)

        portage += p
        cours += c
        frais += f
        mensuel.append(p + c - f)
        avant_v, avant_a = set(vendus), set(achetes)

    return {"portage": portage, "cours": cours, "frais": frais,
            "net": portage + cours - frais, "mensuel": mensuel}


def par_classement(eligibles, classement, k):
    ordre = sorted(eligibles, key=lambda a: -classement[a])
    return ordre[:k], ordre[-k:]


def au_hasard(rng):
    def choisir(eligibles, _classement, k):
        tire = rng.sample(eligibles, 2 * k)
        return tire[:k], tire[k:]
    return choisir


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--donnees", default="data/carry.json")
    p.add_argument("--k", type=int, default=5,
                   help="actifs par côté. 5 sur 60, soit environ un décile.")
    p.add_argument("--tirages", type=int, default=2000)
    args = p.parse_args()

    actifs = charger(args.donnees)
    mois, fin, prix = par_mois(actifs)
    print(f"\n  {len(actifs)} actifs, {len(mois)} mois "
          f"({mois[0]} → {mois[-1]}), {len(mois) - 1} rebalancements")

    r = rejouer(mois, fin, prix, args.k, par_classement)
    if not r["mensuel"]:
        print("\n  Aucun mois exploitable : pas assez d'actifs communs.")
        return 1

    print(f"\n  PORTAGE DE FINANCEMENT — vendre le top {args.k}, "
          f"acheter le bottom {args.k}")
    print("  " + "─" * 68)
    print(f"  financement encaissé                {r['portage'] * 100:>+9.2f} %")
    print(f"  effet des prix                      {r['cours'] * 100:>+9.2f} %")
    print(f"  frais                               {-r['frais'] * 100:>+9.2f} %")
    print("  " + "─" * 68)
    print(f"  NET sur la période                  {r['net'] * 100:>+9.2f} %"
          "   (du notionnel brut)")
    m = r["mensuel"]
    print(f"  mois positifs                       {sum(1 for x in m if x > 0):>6} / {len(m)}")
    if len(m) > 1:
        ec = st.stdev(m)
        print(f"  écart-type mensuel                  {ec * 100:>9.2f} %")
        if ec:
            print(f"  Sharpe annualisé (approx.)          {st.mean(m) / ec * 12 ** .5:>9.2f}")

    # Le modèle nul : le classement, ou juste le fait d'être en position ?
    rng = random.Random(20260911)
    nuls = [rejouer(mois, fin, prix, args.k, au_hasard(rng))["net"]
            for _ in range(args.tirages)]
    mieux = sum(1 for x in nuls if x >= r["net"])
    pval = (mieux + 1) / (args.tirages + 1)
    print("\n  MODÈLE NUL — mêmes positions, tirées au hasard")
    print("  " + "─" * 68)
    print(f"  net moyen du hasard                 {st.mean(nuls) * 100:>+9.2f} %")
    print(f"  p (unilatéral)                      {pval:>9.5f}"
          f"   plancher {1 / (args.tirages + 1):.5f}")
    print("  " + "─" * 68)
    print("\n  Onze rebalancements ne démontrent rien à eux seuls. Ils peuvent")
    print("  réfuter, et c'est ce qu'on leur demande.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
