#!/usr/bin/env python3
"""Le portage, avec des jambes appariées en BÊTA plutôt qu'en notionnel.

    python3 scripts/portage_neutre.py

**Ce que la mesure a corrigé.** Le portage en coupe a été réfuté (net
−4,58 %, p = 0,53), et j'ai attribué son échec au momentum : « un
financement élevé marque un actif qu'on achète avec levier, le vendre c'est
vendre le momentum ». CETTE EXPLICATION ÉTAIT FAUSSE, et
`diagnostic_portage.py` la mesure : la corrélation en coupe entre le
financement d'un mois et le rendement du même mois est nulle — médiane
−0,013, positive six mois sur douze.

La vraie cause, mesurée sur les onze mois tenus :

    bêta du côté VENDU  (financement élevé)   +1,93
    bêta du côté ACHETÉ (financement bas)     +0,82
    écart des jambes, rapporté au brut 2k     −0,55
    bêta du livre complet, mesuré à part      −0,54

Les actifs qui paient cher sont des alts à FORT BÊTA ; ceux qui paient peu
sont des majeures. Vendre les premiers à notionnel égal contre les seconds
donne mécaniquement un livre très court le marché. La neutralité annoncée
n'a jamais existé — et ce n'est pas une question de sélection, c'est une
question de PONDÉRATION.

**L'hypothèse, déclarée avant de mesurer.** Si on apparie les jambes sur le
bêta au lieu du notionnel, l'exposition au marché tombe, et ce qui reste est
le portage. On pèse donc chaque jambe à l'inverse de son bêta.

**Le bêta est estimé SANS REGARDER L'AVENIR** : à chaque rebalancement, sur
les mois antérieurs seulement. Un bêta calculé sur la période entière
donnerait une couverture que personne n'aurait pu mettre en place, et c'est
la façon la plus discrète de fabriquer un résultat.

**Ce que ce test ne peut pas prouver.** Onze rebalancements, et une
hypothèse née du diagnostic d'un échec sur ces mêmes données. Un résultat
positif vaut candidature à un test hors échantillon, jamais conclusion.
"""

from __future__ import annotations

import argparse
import random
import statistics as st
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from portage_financement import (
    COUT_PAR_JAMBE_BPS,
    charger,
    par_mois,
)

# Un bêta estimé peut être minuscule, voire négatif, sur quelques mois. Peser
# à son inverse donnerait alors un levier absurde sur une jambe. On borne
# donc le poids : la couverture doit rester une correction, pas un pari.
POIDS_MIN, POIDS_MAX = 0.4, 2.5
MOIS_MINIMUM_POUR_UN_BETA = 4


def betas_jusqu_a(mois: list[str], prix: dict, marche: dict,
                  borne: str) -> dict[str, float]:
    """Le bêta de chaque actif, sur les mois STRICTEMENT antérieurs à `borne`."""
    out: dict[str, float] = {}
    series: dict[str, list[tuple[float, float]]] = {}
    for m in mois:
        if m >= borne:
            break
        if m not in marche:
            continue
        for a, r in prix[m].items():
            series.setdefault(a, []).append((marche[m], r))
    for a, pts in series.items():
        if len(pts) < MOIS_MINIMUM_POUR_UN_BETA:
            continue
        xs = [x for x, _ in pts]
        ys = [y for _, y in pts]
        mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
        var = sum((x - mx) ** 2 for x in xs)
        if var:
            out[a] = sum((x - mx) * (y - my) for x, y in zip(xs, ys, strict=True)) / var
    return out


def rejouer_apparie(mois, fin, prix, k, apparier: bool):
    """Rejoue la règle. `apparier` pèse les jambes à l'inverse de leur bêta.

    Tout est rapporté au NOTIONNEL BRUT déployé, poids compris : sans ça,
    une jambe alourdie gonflerait le résultat sans qu'on le voie.
    """
    marche = {m: st.mean(prix[m].values()) for m in mois if prix.get(m)}
    portage = cours = frais = 0.0
    mensuel: list[float] = []
    betas_livre: list[float] = []
    # Les poids réellement appliqués, mois par mois. Une couverture qu'on ne
    # peut pas relire est une couverture qu'on ne peut pas vérifier : c'est
    # le seul endroit où un levier involontaire se verrait.
    poids: list[tuple[float, float]] = []
    avant_v: set[str] = set()
    avant_a: set[str] = set()

    for i in range(1, len(mois)):
        prec, cour = mois[i - 1], mois[i]
        elig = sorted(set(fin[prec]) & set(fin[cour]) & set(prix[cour]))
        if len(elig) < 4 * k:
            continue
        ordre = sorted(elig, key=lambda a: -fin[prec][a])
        vendus, achetes = ordre[:k], ordre[-k:]

        pv = pa = 1.0
        if apparier:
            b = betas_jusqu_a(mois, prix, marche, cour)
            bv = [b[a] for a in vendus if a in b]
            ba = [b[a] for a in achetes if a in b]
            if len(bv) >= k // 2 + 1 and len(ba) >= k // 2 + 1:
                mv, ma = st.mean(bv), st.mean(ba)
                if mv > 0.05 and ma > 0.05:
                    # On égalise l'exposition : poids inversement
                    # proportionnel au bêta de la jambe, puis renormalisé
                    # pour que le notionnel brut reste 2k.
                    pv, pa = 1 / mv, 1 / ma
                    s = (pv + pa) / 2
                    pv, pa = pv / s, pa / s
                    pv = min(max(pv, POIDS_MIN), POIDS_MAX)
                    pa = min(max(pa, POIDS_MIN), POIDS_MAX)

        brut = k * (pv + pa)
        p = (pv * sum(fin[cour][a] for a in vendus)
             - pa * sum(fin[cour][a] for a in achetes)) / brut
        c = (pa * sum(prix[cour][a] for a in achetes)
             - pv * sum(prix[cour][a] for a in vendus)) / brut
        change = (len(set(vendus) - avant_v) + len(set(achetes) - avant_a)
                  + len(avant_v - set(vendus)) + len(avant_a - set(achetes)))
        f = change * COUT_PAR_JAMBE_BPS / 10_000 / (2 * k)

        portage += p
        cours += c
        frais += f
        mensuel.append(p + c - f)
        betas_livre.append(marche.get(cour, 0.0))
        poids.append((pv, pa))
        avant_v, avant_a = set(vendus), set(achetes)

    return {"portage": portage, "cours": cours, "frais": frais,
            "net": portage + cours - frais, "mensuel": mensuel,
            "marche": betas_livre, "poids": poids}


def beta_et_correlation(mensuel, marche):
    n = len(mensuel)
    if n < 3:
        return 0.0, 0.0
    mm, mp = st.mean(marche), st.mean(mensuel)
    cov = sum((a - mm) * (b - mp) for a, b in zip(marche, mensuel, strict=True)) / (n - 1)
    sd = st.stdev(marche) * st.stdev(mensuel)
    return (cov / sd if sd else 0.0), (cov / st.variance(marche))


def rapport(nom, r, nuls, tirages):
    print(f"\n  {nom}")
    print("  " + "─" * 68)
    print(f"  financement encaissé                {r['portage'] * 100:>+9.2f} %")
    print(f"  effet des prix                      {r['cours'] * 100:>+9.2f} %")
    print(f"  frais                               {-r['frais'] * 100:>+9.2f} %")
    print(f"  NET                                 {r['net'] * 100:>+9.2f} %")
    m = r["mensuel"]
    corr, beta = beta_et_correlation(m, r["marche"])
    print(f"  mois positifs                       {sum(1 for x in m if x > 0):>6} / {len(m)}")
    # LE BÊTA AVANT LE RESTE : un livre dit neutre qui porte du bêta n'est
    # pas un portage, quel que soit son net.
    print(f"  corrélation au marché               {corr:>9.2f}")
    print(f"  BÊTA AU MARCHÉ                      {beta:>9.2f}")
    if len(m) > 1 and st.stdev(m):
        print(f"  écart-type mensuel                  {st.stdev(m) * 100:>9.2f} %")
        print(f"  Sharpe annualisé (approx.)          "
              f"{st.mean(m) / st.stdev(m) * 12 ** .5:>9.2f}")
    if nuls:
        mieux = sum(1 for x in nuls if x >= r["net"])
        p = (mieux + 1) / (tirages + 1)
        print(f"  p (unilatéral, modèle nul)          {p:>9.5f}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--donnees", default="data/carry.json")
    ap.add_argument("--k", type=int, default=5)
    ap.add_argument("--tirages", type=int, default=2000)
    args = ap.parse_args()

    actifs = charger(args.donnees)
    mois, fin, prix = par_mois(actifs)
    print(f"\n  {len(actifs)} actifs, {len(mois)} mois "
          f"({mois[0]} → {mois[-1]}), {len(mois) - 1} rebalancements")

    # Le modèle nul : mêmes positions, tirées au hasard, sans appariement.
    rng = random.Random(20260912)
    nuls = []
    for _ in range(args.tirages):
        net = 0.0
        av = aa = set()
        for i in range(1, len(mois)):
            prec, cour = mois[i - 1], mois[i]
            elig = sorted(set(fin[prec]) & set(fin[cour]) & set(prix[cour]))
            if len(elig) < 4 * args.k:
                continue
            t = rng.sample(elig, 2 * args.k)
            v, a = t[:args.k], t[args.k:]
            p = (sum(fin[cour][x] for x in v) - sum(fin[cour][x] for x in a))
            c = (sum(prix[cour][x] for x in a) - sum(prix[cour][x] for x in v))
            ch = (len(set(v) - av) + len(set(a) - aa)
                  + len(av - set(v)) + len(aa - set(a)))
            net += (p + c) / (2 * args.k) - ch * COUT_PAR_JAMBE_BPS / 10_000 / (2 * args.k)
            av, aa = set(v), set(a)
        nuls.append(net)

    rapport("TÉMOIN — jambes à notionnel égal (le portage déjà réfuté)",
            rejouer_apparie(mois, fin, prix, args.k, apparier=False),
            nuls, args.tirages)
    rapport("CANDIDAT — jambes appariées en BÊTA",
            rejouer_apparie(mois, fin, prix, args.k, apparier=True),
            nuls, args.tirages)

    print("\n  " + "─" * 68)
    print("  Le bêta est estimé sur les mois ANTÉRIEURS à chaque")
    print("  rebalancement : la couverture est celle qu'on aurait pu poser.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
