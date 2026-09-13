#!/usr/bin/env python3
"""Le financement d'un actif comparé au SIEN, pas à celui des autres.

    python3 scripts/portage_relatif.py

**D'où vient cette hypothèse : d'une cause mesurée, pas d'une histoire.**
Le portage en coupe transversale a été réfuté (net −4,58 %, p = 0,53), et
`diagnostic_portage.py` en nomme la cause :

    bêta du côté VENDU  (financement élevé)   +1,93
    bêta du côté ACHETÉ (financement bas)     +0,82

Classer par le NIVEAU de financement, c'est classer par bêta. La raison est
mécanique : un alt volatil paie cher en permanence, une majeure paie peu en
permanence. Le niveau de financement d'un actif est d'abord une
CARACTÉRISTIQUE PERSISTANTE de cet actif, et seulement ensuite un signal.

`portage_neutre.py` a essayé de corriger ça par la pondération — apparier
les jambes en bêta — et le bêta n'est tombé que de −0,54 à −0,44 : un bêta
estimé sur quelques mois est trop bruité pour couvrir quoi que ce soit.

**L'hypothèse d'ici attaque la même cause par l'autre bout : la SÉLECTION.**
Si le niveau de financement est une caractéristique persistante de l'actif,
il suffit de la retrancher. On classe donc chaque actif par l'écart entre le
financement qu'il vient de verser et CE QU'IL VERSE D'HABITUDE :

    signal_i = financement_i(mois précédent) − moyenne de ses mois antérieurs

Ce qui reste n'est plus « quels actifs paient cher », c'est « quels actifs
paient cher POUR EUX ». La part persistante — celle qui porte le bêta —
disparaît par construction, sans estimer aucun bêta.

**Ce que ce script mesure d'abord, et c'est le vrai test.** Pas le net : le
BÊTA DES DEUX JAMBES. Si l'hypothèse est juste, l'écart +1,93 / +0,82 doit
se resserrer nettement. C'est une prédiction faite avant de regarder, et
elle est réfutable : si l'écart ne bouge pas, le mécanisme identifié par le
diagnostic n'est pas celui qu'on croit, et il faudra le réécrire.

**La moyenne ne regarde que le passé.** À chaque rebalancement, elle porte
sur les mois STRICTEMENT antérieurs au mois de classement. Il faut donc
MOIS_MINIMUM_D_HISTORIQUE mois avant de pouvoir classer, ce qui coûte le
début de la période.

**Le témoin est rejoué sur LA MÊME FENÊTRE.** Le candidat démarre plus tard
que le portage simple ; le comparer au témoin sur douze mois quand il n'en
joue que huit comparerait deux périodes, pas deux règles.

**Ce que ce test ne peut pas prouver.** Huit rebalancements au mieux, sur
les mêmes données qui ont produit l'hypothèse. Un résultat positif ne
vaudrait que candidature à un test hors échantillon. Un résultat négatif,
lui, réfute — et la prédiction sur les bêtas, elle, est vérifiable
indépendamment du net.
"""

from __future__ import annotations

import argparse
import random
import statistics as st
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from diagnostic_portage import beta
from portage_financement import au_hasard, charger, par_classement, par_mois, rejouer

# Trois mois pour dire « ce qu'il verse d'habitude ». En dessous, la moyenne
# est celle d'un ou deux points et le signal n'est que du bruit ; au-dessus,
# on perd des rebalancements sur une série qui n'en compte que douze.
MOIS_MINIMUM_D_HISTORIQUE = 3


def par_ecart_a_soi(fin: dict, mois: list[str]):
    """Classer par l'écart au niveau habituel de l'actif lui-même.

    La moyenne de référence ne porte que sur les mois STRICTEMENT antérieurs
    au mois de classement : inclure le mois qu'on classe reviendrait à se
    comparer à une moyenne qui se contient elle-même, et inclure les mois
    suivants serait purement et simplement lire l'avenir.
    """
    def choisir(eligibles, classement, k, mois_de_classement):
        notes = {}
        for a in eligibles:
            passe = [fin[m][a] for m in mois
                     if m < mois_de_classement and a in fin.get(m, {})]
            if len(passe) < MOIS_MINIMUM_D_HISTORIQUE:
                continue
            notes[a] = classement[a] - st.mean(passe)
        if len(notes) < 2 * k:
            return [], []
        ordre = sorted(notes, key=lambda a: -notes[a])
        return ordre[:k], ordre[-k:]
    return choisir


def premier_mois_jouable(mois: list[str], fin: dict, prix: dict, k: int) -> str:
    """Le premier mois TENU par le candidat.

    Le témoin sera rejoué à partir de là, et pas avant.
    """
    choisir = par_ecart_a_soi(fin, mois)
    for i in range(1, len(mois)):
        prec, cour = mois[i - 1], mois[i]
        elig = sorted(set(fin[prec]) & set(fin[cour]) & set(prix[cour]))
        if len(elig) < 4 * k:
            continue
        v, _a = choisir(elig, fin[prec], k, prec)
        if v:
            return cour
    return mois[-1]


def fenetre(mois: list[str], depuis: str) -> list[str]:
    """Les mois à partir de `depuis`, plus celui qui précède pour classer."""
    i = mois.index(depuis)
    return mois[i - 1:]


def betas_des_jambes(mois, fin, prix, k, choisir):
    """Le bêta de chaque jambe. LA mesure de ce script.

    Le marché est la moyenne équipondérée des actifs du mois tenu — la même
    définition que partout ailleurs dans cette série de scripts.
    """
    marche = {m: st.mean(prix[m].values()) for m in mois if prix.get(m)}
    lignes = []
    for i in range(1, len(mois)):
        prec, cour = mois[i - 1], mois[i]
        elig = sorted(set(fin[prec]) & set(fin[cour]) & set(prix[cour]))
        if len(elig) < 4 * k:
            continue
        vendus, achetes = choisir(elig, fin[prec], k, prec)
        if not vendus:
            continue
        lignes.append((marche[cour],
                       st.mean(prix[cour][a] for a in vendus),
                       st.mean(prix[cour][a] for a in achetes)))
    if len(lignes) < 4:
        return None, None, len(lignes)
    bv = beta([(m, v) for m, v, _ in lignes])
    ba = beta([(m, a) for m, _, a in lignes])
    return bv, ba, len(lignes)


def rapport(nom, r, nuls, tirages, bv, ba, n):
    print(f"\n  {nom}")
    print("  " + "─" * 68)
    # LE BÊTA DES JAMBES D'ABORD : c'est la prédiction qu'on teste, et la
    # regarder après le net serait la regarder en sachant déjà le résultat.
    if bv is not None:
        print(f"  bêta du côté VENDU                  {bv:>+9.2f}")
        print(f"  bêta du côté ACHETÉ                 {ba:>+9.2f}")
        print(f"  ÉCART ENTRE LES JAMBES              {ba - bv:>+9.2f}")
    else:
        print(f"  bêta des jambes : {n} mois, trop peu pour une pente")
    print(f"  financement encaissé                {r['portage'] * 100:>+9.2f} %")
    print(f"  effet des prix                      {r['cours'] * 100:>+9.2f} %")
    print(f"  frais                               {-r['frais'] * 100:>+9.2f} %")
    print(f"  NET                                 {r['net'] * 100:>+9.2f} %")
    m = r["mensuel"]
    print(f"  mois positifs                       {sum(1 for x in m if x > 0):>6} / {len(m)}")
    if len(m) > 1 and st.stdev(m):
        print(f"  écart-type mensuel                  {st.stdev(m) * 100:>9.2f} %")
    if nuls:
        mieux = sum(1 for x in nuls if x >= r["net"])
        p = (mieux + 1) / (tirages + 1)
        print(f"  p (unilatéral, modèle nul)          {p:>9.5f}"
              f"   plancher {1 / (tirages + 1):.5f}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--donnees", default="data/carry.json")
    ap.add_argument("--k", type=int, default=5)
    ap.add_argument("--tirages", type=int, default=2000)
    args = ap.parse_args()

    actifs = charger(args.donnees)
    tous, fin, prix = par_mois(actifs)
    depuis = premier_mois_jouable(tous, fin, prix, args.k)
    mois = fenetre(tous, depuis)
    print(f"\n  {len(actifs)} actifs, {len(tous)} mois d'historique "
          f"({tous[0]} → {tous[-1]})")
    print(f"  fenêtre commune : {depuis} → {mois[-1]}, "
          f"{len(mois) - 1} rebalancements")
    print(f"  (le candidat a besoin de {MOIS_MINIMUM_D_HISTORIQUE} mois "
          f"d'historique par actif avant de pouvoir classer)")

    # Le signal du candidat se calcule sur TOUT l'historique disponible
    # avant le mois de classement, pas seulement sur la fenêtre jouée.
    ecart = par_ecart_a_soi(fin, tous)

    rng = random.Random(20260912)
    nuls = [rejouer(mois, fin, prix, args.k, au_hasard(rng))["net"]
            for _ in range(args.tirages)]

    for nom, choisir in (
        ("TÉMOIN — classement par le NIVEAU de financement", par_classement),
        ("CANDIDAT — classement par l'ÉCART AU NIVEAU HABITUEL", ecart),
    ):
        bv, ba, n = betas_des_jambes(mois, fin, prix, args.k, choisir)
        rapport(nom, rejouer(mois, fin, prix, args.k, choisir),
                nuls, args.tirages, bv, ba, n)

    print("\n  " + "─" * 68)
    print("  La prédiction déclarée avant de mesurer : l'écart entre les")
    print("  jambes doit se resserrer, parce que retrancher le niveau")
    print("  habituel de chaque actif retire la part persistante — celle")
    print("  qui porte le bêta. Le net vient après, et sur huit")
    print("  rebalancements il ne peut que réfuter.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
