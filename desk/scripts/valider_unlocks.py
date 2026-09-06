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
from trading_desk.sentinelle.validation import (
    benjamini_hochberg,
    evaluer,
    sans_chevauchement,
)

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
    print("  (POSITIF = le prix a BAISSÉ : l'hypothèse baissière est vérifiée.")
    print("   Le signe est déjà retourné par `sens = -1`, il ne faut donc PAS")
    print("   lire ce tableau comme un rendement de marché.)")
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


def poolage(unlocks: dict, tirages: int, min_evts: int, alpha: float) -> None:
    """Le même test, mais sur TOUS les jetons ensemble.

    **Pourquoi ce second test, et pourquoi ce n'est pas du p-hacking.**

    L'hypothèse posée d'avance est « un déblocage fait baisser le prix » —
    un effet COMMUN à tous les jetons, pas un effet propre à SUI ou à GMT.
    Or le test précédent l'évalue jeton par jeton, puis corrige sur 269
    cellules. Si l'effet est réel mais modeste, chaque jeton pris isolément
    manque de puissance, aucune cellule ne passe le seuil, et la correction
    conclut « rien » sur une hypothèse qu'elle n'a jamais testée sous sa
    forme réelle.

    Mettre les événements en commun teste la MÊME hypothèse avec la
    puissance qui lui correspond : 16 tests (4 fenêtres × 4 tranches) au lieu
    de 269, et des effectifs de plusieurs centaines d'événements.

    Ce n'est pas un second essai après un échec : c'est le test correctement
    spécifié, et le premier était sous-dimensionné. Ce qui SERAIT du
    p-hacking, ce serait de changer l'hypothèse — de tester « et si le prix
    montait » après avoir vu le signe.

    Le contrôle de la dérive reste intact : chaque tirage nul se fait dans
    l'historique DU MÊME jeton que l'événement qu'il remplace.
    """
    import random

    series: dict[str, list] = {}
    for symbole in unlocks:
        try:
            series[symbole] = load_from_file(
                f"data/{symbole}_1d_real.json", symbole, "1d")
        except (DataUnavailable, FileNotFoundError):
            continue

    lignes = []
    for nom_tranche, bas, haut in TRANCHES:
        for nom_fenetre, decalage, duree in FENETRES:
            # (barres du jeton, indice d'entrée) pour chaque événement retenu
            evts: list[tuple[list, int]] = []
            for symbole, bruts in unlocks.items():
                bars = series.get(symbole)
                if not bars:
                    continue
                par_jour = index_par_date(bars)
                candidats = []
                for e in bruts:
                    if not bas <= e["part_offre"] < haut:
                        continue
                    i = par_jour.get(e["ts_ms"] // 86_400_000 + decalage)
                    if i is not None:
                        candidats.append(Declenchement(i, -1, e["part_offre"], ""))
                for d in sans_chevauchement(candidats, duree):
                    if d.index + duree < len(bars):
                        evts.append((bars, d.index))
            if len(evts) < min_evts:
                continue

            def rend(bars, i, h=duree):
                depart = float(bars[i].close)
                if depart <= 0:
                    return None
                return -1 * (float(bars[i + h].close) - depart) / depart * 10_000

            observes = [r for bars, i in evts if (r := rend(bars, i)) is not None]
            if len(observes) < min_evts:
                continue
            moyenne = sum(observes) / len(observes)

            alea = random.Random(20260906)
            nuls = []
            for _ in range(tirages):
                tir = []
                for bars, _i in evts:
                    j = alea.randrange(0, len(bars) - duree - 1)
                    r = rend(bars, j)
                    if r is not None:
                        tir.append(r)
                if tir:
                    nuls.append(sum(tir) / len(tir))
            if not nuls:
                continue
            pval = (sum(1 for x in nuls if x >= moyenne) + 1) / (len(nuls) + 1)
            lignes.append((nom_tranche, nom_fenetre, len(observes), moyenne,
                           sum(nuls) / len(nuls), pval))

    if not lignes:
        print("\n  Poolage : aucun groupe assez fourni.\n")
        return

    garde = benjamini_hochberg([x[5] for x in lignes], alpha)
    print("\n  TEST POOLÉ — tous les jetons ensemble, même hypothèse")
    print("  " + "=" * 74)
    print("  (POSITIF = le prix a BAISSÉ. Chaque tirage nul est pris dans")
    print("   l'historique du MÊME jeton, la dérive reste donc contrôlée.)")
    print(f"\n  {'tranche':<10} {'fenêtre':<22} {'n':>5} {'observé':>10} "
          f"{'hasard':>9} {'p':>8}  BH")
    print("  " + "-" * 74)
    for (tranche, fenetre, n, obs, nul, pval), g in zip(lignes, garde, strict=True):
        print(f"  {tranche:<10} {fenetre:<22} {n:>5} {obs:>+9.1f} "
              f"{nul:>+9.1f} {pval:>8.4f}  {'OUI' if g else '—'}")
    survivants = sum(garde)
    print("  " + "-" * 74)
    print(f"  {len(lignes)} tests, {sum(1 for x in lignes if x[5] < alpha)} à "
          f"p < {alpha}, {len(lignes) * alpha:.1f} attendus par hasard, "
          f"**{survivants} survivant(s)** après BH\n")


def marche_neutre(unlocks: dict, tirages: int, alpha: float,
                  reference: str = "BTC") -> None:
    """Le même test, sur le rendement RELATIF AU MARCHÉ.

    **Le confondant que le modèle nul ne contrôle pas.** Les déblocages ne
    sont pas répartis au hasard dans le calendrier : beaucoup de projets
    débloquent mensuellement, souvent autour des mêmes dates. Les 852
    événements de 68 jetons se concentrent donc sur un petit nombre de
    semaines communes.

    Or le bras aléatoire tire ses dates DANS CHAQUE JETON, ce qui contrôle la
    dérive propre au jeton mais **pas le marché**. Si les semaines de gros
    déblocages sont aussi des semaines où tout le marché crypto baisse, on
    mesure le marché et on l'appelle « effet de déblocage ».

    Le remède est direct : mesurer le rendement du jeton **moins** celui de
    la référence sur exactement la même fenêtre. Ce qui reste est propre au
    jeton. Si l'effet survit, il n'est pas un effet de marché ; s'il
    disparaît, c'en était un depuis le début.

    Le bras aléatoire subit la même soustraction, aux mêmes dates tirées :
    ne neutraliser qu'un seul des deux bras fabriquerait un écart qui ne
    dirait rien.
    """
    import random

    try:
        marche = load_from_file(f"data/{reference}_1d_real.json", reference, "1d")
    except (DataUnavailable, FileNotFoundError):
        print(f"\n  Neutralisation impossible : data/{reference}_1d_real.json "
              "introuvable.\n")
        return
    ref_par_jour = {b.ts_ms // 86_400_000: i for i, b in enumerate(marche)}

    series: dict[str, list] = {}
    for symbole in unlocks:
        try:
            series[symbole] = load_from_file(
                f"data/{symbole}_1d_real.json", symbole, "1d")
        except (DataUnavailable, FileNotFoundError):
            continue

    DECALAGE, DUREE = -7, 6

    def exces(bars, i):
        """Rendement du jeton moins celui de la référence, même fenêtre.

        `None` si la référence ne couvre pas ces dates — écarter plutôt que
        de neutraliser par zéro, ce qui reviendrait à compter l'événement
        comme si le marché n'avait pas bougé.
        """
        depart = float(bars[i].close)
        if depart <= 0 or i + DUREE >= len(bars):
            return None
        jeton = (float(bars[i + DUREE].close) - depart) / depart
        j0 = ref_par_jour.get(bars[i].ts_ms // 86_400_000)
        j1 = ref_par_jour.get(bars[i + DUREE].ts_ms // 86_400_000)
        if j0 is None or j1 is None:
            return None
        d_ref = float(marche[j0].close)
        if d_ref <= 0:
            return None
        ref = (float(marche[j1].close) - d_ref) / d_ref
        return -1 * (jeton - ref) * 10_000

    print(f"\n  NEUTRALISATION DU MARCHÉ — rendement relatif à {reference}")
    print("  " + "=" * 74)
    print("  (Les déblocages se groupent dans le calendrier. Sans cette")
    print("   correction, quelques mauvaises semaines de marché suffiraient")
    print("   à produire l'effet observé.)\n")
    print(f"  {'tranche':<10} {'n':>5} {'brut':>9} {'net du marché':>15} "
          f"{'hasard net':>12} {'p':>9}  BH")
    print("  " + "-" * 74)

    lignes = []
    for nom_tranche, bas, haut in TRANCHES:
        evts = []
        for symbole, bruts in unlocks.items():
            bars = series.get(symbole)
            if not bars:
                continue
            par_jour = index_par_date(bars)
            candidats = []
            for e in bruts:
                if not bas <= e["part_offre"] < haut:
                    continue
                i = par_jour.get(e["ts_ms"] // 86_400_000 + DECALAGE)
                if i is not None and i + DUREE < len(bars):
                    candidats.append(Declenchement(i, -1, e["part_offre"], ""))
            evts += [(bars, d.index) for d in sans_chevauchement(candidats, DUREE)]

        obs = [v for bars, i in evts if (v := exces(bars, i)) is not None]
        bruts_v = []
        for bars, i in evts:
            depart = float(bars[i].close)
            if depart > 0 and i + DUREE < len(bars):
                bruts_v.append(-1 * (float(bars[i + DUREE].close) - depart)
                               / depart * 10_000)
        if len(obs) < 30:
            continue
        moyenne = sum(obs) / len(obs)
        brut = sum(bruts_v) / len(bruts_v) if bruts_v else float("nan")

        alea = random.Random(20260906)
        nuls = []
        for _ in range(tirages):
            tir = [v for bars, _ in evts
                   if (v := exces(bars, alea.randrange(0, len(bars) - DUREE - 1)))
                   is not None]
            if tir:
                nuls.append(sum(tir) / len(tir))
        if not nuls:
            continue
        pval = (sum(1 for x in nuls if x >= moyenne) + 1) / (len(nuls) + 1)
        lignes.append((nom_tranche, len(obs), brut, moyenne,
                       sum(nuls) / len(nuls), pval))

    if not lignes:
        print("     aucun groupe assez fourni.\n")
        return
    garde = benjamini_hochberg([x[5] for x in lignes], alpha)
    for (t, n, brut, net, nul, pval), g in zip(lignes, garde, strict=True):
        print(f"  {t:<10} {n:>5} {brut:>+8.1f} {net:>+14.1f} {nul:>+11.1f} "
              f"{pval:>9.4f}  {'OUI' if g else '—'}")
    print("  " + "-" * 74)
    if sum(garde):
        print(f"  {sum(garde)} tranche(s) survivent APRÈS neutralisation du marché.")
        print("  L'effet est donc propre aux jetons, pas au marché crypto.\n")
    else:
        print("  AUCUNE tranche ne survit après neutralisation.")
        print("  L'effet mesuré était celui du MARCHÉ, pas celui des")
        print("  déblocages : ils se groupent sur les mêmes semaines.\n")


def robustesse(unlocks: dict, tirages: int, alpha: float) -> None:
    """Trois épreuves qui peuvent tuer un effet apparemment solide.

    Un résultat qui survit à une correction pour tests multiples n'est pas
    encore un résultat. Il reste trois façons ordinaires de se tromper, et
    chacune a sa contre-épreuve :

    **Un dénominateur aberrant.** Six jetons affichent une part d'offre
    supérieure à 100 % — presque toujours l'artefact « deuxième déblocage
    après un premier minuscule ». Un edge qui disparaît quand on les écarte
    n'en est pas un.

    **Un ou deux jetons qui portent tout.** 852 événements sur 68 jetons,
    mais si USUAL et EIGEN font le résultat à eux seuls, ce n'est pas un
    effet de marché, c'est une anecdote. Le jackknife retire chaque jeton
    tour à tour et regarde le pire cas.

    **Un effet daté.** Le plus décisif des trois. Si l'effet n'existait que
    dans la première moitié de la période, il aurait été arbitré depuis — et
    le trader aujourd'hui perdrait de l'argent. On coupe donc à la médiane
    des dates et on regarde les deux moitiés SÉPARÉMENT. C'est la seule
    épreuve qui parle de l'avenir plutôt que du passé.
    """
    import random
    import statistics

    series: dict[str, list] = {}
    for symbole in unlocks:
        try:
            series[symbole] = load_from_file(
                f"data/{symbole}_1d_real.json", symbole, "1d")
        except (DataUnavailable, FileNotFoundError):
            continue

    # La cellule la plus fournie et la plus significative : « toutes », J-7/J-1.
    DECALAGE, DUREE = -7, 6

    def evenements_de(symbole: str, part_max: float, depuis=None, jusqu=None):
        bars = series.get(symbole)
        if not bars:
            return []
        par_jour = index_par_date(bars)
        candidats = []
        for e in unlocks[symbole]:
            if e["part_offre"] > part_max or e["part_offre"] < 0.005:
                continue
            if depuis is not None and e["ts_ms"] < depuis:
                continue
            if jusqu is not None and e["ts_ms"] >= jusqu:
                continue
            i = par_jour.get(e["ts_ms"] // 86_400_000 + DECALAGE)
            if i is not None and i + DUREE < len(bars):
                candidats.append(Declenchement(i, -1, e["part_offre"], ""))
        return [(bars, d.index) for d in sans_chevauchement(candidats, DUREE)]

    def mesurer(evts, graine=20260906):
        if len(evts) < 30:
            return None
        def rend(bars, i):
            depart = float(bars[i].close)
            if depart <= 0:
                return None
            return -1 * (float(bars[i + DUREE].close) - depart) / depart * 10_000
        obs = [r for bars, i in evts if (r := rend(bars, i)) is not None]
        if len(obs) < 30:
            return None
        moyenne = sum(obs) / len(obs)
        alea = random.Random(graine)
        nuls = []
        for _ in range(tirages):
            tir = [r for bars, _ in evts
                   if (r := rend(bars, alea.randrange(0, len(bars) - DUREE - 1)))
                   is not None]
            if tir:
                nuls.append(sum(tir) / len(tir))
        if not nuls:
            return None
        p = (sum(1 for x in nuls if x >= moyenne) + 1) / (len(nuls) + 1)
        return len(obs), moyenne, sum(nuls) / len(nuls), p

    print("\n  ÉPREUVES DE ROBUSTESSE — fenêtre J-7/J-1, toutes tranches")
    print("  " + "=" * 74)

    # 1. Le garde-fou sur le dénominateur
    print("\n  1. Dénominateurs aberrants")
    for plafond, libelle in ((3.0, "≤ 300 % (défaut)"), (1.0, "≤ 100 %"),
                             (0.5, "≤ 50 %"), (0.25, "≤ 25 %")):
        evts = [e for s in unlocks for e in evenements_de(s, plafond)]
        r = mesurer(evts)
        if r is None:
            print(f"     {libelle:<18} échantillon insuffisant")
            continue
        n, obs, nul, p = r
        print(f"     {libelle:<18} n={n:<4} {obs:+8.1f} contre {nul:+7.1f} "
              f"au hasard   p = {p:.4f}"
              + ("   OK" if p < alpha else "   <- l'effet disparaît"))

    # 2. Jackknife par jeton
    print("\n  2. Jackknife — un jeton porte-t-il tout le résultat ?")
    complet = mesurer([e for s in unlocks for e in evenements_de(s, 3.0)])
    if complet:
        ps = []
        for exclu in unlocks:
            evts = [e for s in unlocks if s != exclu for e in evenements_de(s, 3.0)]
            r = mesurer(evts)
            if r:
                ps.append((r[3], exclu, r[1]))
        ps.sort(reverse=True)
        print(f"     complet          p = {complet[3]:.4f}")
        print(f"     pire exclusion   p = {ps[0][0]:.4f}  (sans {ps[0][1]}, "
              f"effet {ps[0][2]:+.1f} bps)")
        print(f"     médiane          p = {statistics.median(x[0] for x in ps):.4f}")
        print("     " + ("OK — aucun jeton n'est indispensable"
                         if ps[0][0] < alpha
                         else f"<- retirer {ps[0][1]} suffit à tuer l'effet"))

    # 3. La coupe temporelle
    print("\n  3. Coupe temporelle — l'effet existe-t-il ENCORE ?")
    toutes_dates = sorted(e["ts_ms"] for s in unlocks for e in unlocks[s]
                          if e["part_offre"] >= 0.005)
    if toutes_dates:
        milieu = toutes_dates[len(toutes_dates) // 2]
        import datetime as dt
        coupe = dt.datetime.fromtimestamp(milieu / 1000, dt.UTC).date()
        for libelle, depuis, jusqu in (("avant " + str(coupe), None, milieu),
                                       ("après " + str(coupe), milieu, None)):
            evts = [e for s in unlocks for e in evenements_de(s, 3.0, depuis, jusqu)]
            r = mesurer(evts)
            if r is None:
                print(f"     {libelle:<22} échantillon insuffisant")
                continue
            n, obs, nul, p = r
            print(f"     {libelle:<22} n={n:<4} {obs:+8.1f} contre {nul:+7.1f} "
                  f"   p = {p:.4f}"
                  + ("   OK" if p < alpha else "   <- absent sur cette moitié"))
        print("\n     Un effet présent AVANT et absent APRÈS a été arbitré :")
        print("     le trader d'aujourd'hui perdrait de l'argent à le suivre.")
    print()


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--unlocks", default="data/unlocks.json")
    p.add_argument("--tirages", type=int, default=2000)
    p.add_argument("--alpha", type=float, default=0.05)
    p.add_argument("--min-evenements", type=int, default=10,
                   help="en dessous, aucune conclusion n'est possible et la "
                        "cellule est écartée plutôt que rapportée bruyante")
    p.add_argument("--out", default=None)
    p.add_argument("--reference", default="BTC",
                   help="actif de référence pour neutraliser le marché")
    p.add_argument("--robustesse", action="store_true",
                   help="les trois épreuves qui peuvent tuer un effet : "
                        "dénominateurs aberrants, jackknife par jeton, et "
                        "coupe temporelle")
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
    poolage(unlocks, args.tirages, args.min_evenements * 3, args.alpha)
    if args.robustesse:
        robustesse(unlocks, args.tirages, args.alpha)
        marche_neutre(unlocks, args.tirages, args.alpha, args.reference)
    if args.out:
        Path(args.out).write_text(json.dumps([r.__dict__ for r in res], indent=1))
        print(f"  Résultats bruts : {args.out}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
