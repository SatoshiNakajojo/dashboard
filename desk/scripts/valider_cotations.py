#!/usr/bin/env python3
"""La cotation d'un perpétuel est-elle un événement tradable ?

    python3 scripts/fetch_cotations.py        # collecter d'abord
    python3 scripts/valider_cotations.py

════════════════════════════════════════════════════════════════════════════
  L'HYPOTHÈSE, ÉCRITE AVANT D'AVOIR REGARDÉ LE MOINDRE RENDEMENT
════════════════════════════════════════════════════════════════════════════

Un perpétuel nouvellement coté attire un flux spéculatif ACHETEUR. Trois
raisons, et elles sont mécaniques plutôt que psychologiques :

1. l'attention — une cotation est un événement annoncé, relayé, cherché ;
2. le levier est disponible dès la première minute, alors que l'emprunt
   nécessaire pour vendre à découvert du spot ne l'est pas ;
3. il n'existe pas encore de position à liquider, donc pas de vendeur naturel.

**L'hypothèse est que ce flux DÉCROÎT**, et donc que le rendement des
semaines qui suivent la cotation est négatif. `sens = -1` : on vend.

C'est la même forme que la seule règle validée de ce dépôt — un événement à
date connue, un déséquilibre d'offre ou de demande, et une fenêtre. Ce n'est
pas une coïncidence : les quatre-vingt-quatre cellules de la grille de
robustesse ont montré qu'un motif de prix ne suffit pas, et la seule chose
qui ait survécu était un événement daté.

**Les deux fenêtres, fixées d'avance** — on n'en testera pas une troisième
après avoir vu les deux premières :

    J+1 → J+7      la première semaine, hors premier jour
    J+1 → J+30     le premier mois

**Pourquoi le premier jour est exclu.** Son ouverture n'est pas exécutable :
on ne connaît l'existence du perpétuel qu'une fois coté, et la première bougie
est une enchère de découverte de prix. On entre à la CLÔTURE de J+0, ce qui
est une décision qu'on aurait pu prendre.

**La variable de dose, fixée d'avance** : l'amplitude du premier jour,
`(haut − bas) / clôture`. Plus le premier jour est violent, plus l'attention
spéculative est forte, donc plus il y a à décroître. Trois tranches aux bornes
rondes, posées avant de mesurer : moins de 15 %, de 15 à 30 %, plus de 30 %.

════════════════════════════════════════════════════════════════════════════
  CE QUI REND CE TEST DIFFÉRENT DES PRÉCÉDENTS
════════════════════════════════════════════════════════════════════════════

**Il n'a pas de biais du survivant, et c'est la première fois.** `RECHERCHE.md`
porte la réserve, sur le portage : « l'univers est choisi par le volume
d'aujourd'hui ; ceux qui sont morts pendant l'année sont absents ». Ici,
l'API publie les 56 perpétuels délistés ET sert leur historique complet.
L'univers est donc reconstitué tel qu'il était, pas tel qu'il a survécu.

Cela compte doublement pour CETTE hypothèse : un perpétuel coté puis délisté
est exactement le cas où la décroissance post-cotation serait la plus forte.
L'exclure — ce que fait n'importe quelle étude bâtie sur l'univers du jour —
retirerait précisément les événements qui portent l'effet.

**La date de cotation n'est pas la date de la première bougie pour tout le
monde.** Les majeures ont un historique antérieur à l'exchange lui-même : BTC,
ETH, ATOM, BNB, DOGE et LTC commencent toutes le 2020-08-19, ce qui est une
reprise de données et non une cotation. On ne retient donc que les
perpétuels dont la première bougie tombe après `SEUIL_COTATION`, date
choisie franchement après l'ouverture de l'exchange pour qu'une première
bougie ne puisse plus signifier autre chose qu'une mise en cotation.

**Un perpétuel qui ne s'échange pas est ÉCARTÉ.** L'exchange publie des
bougies avant que quoi que ce soit ne se négocie — prix de marque, volume nul.
Un tiers des cotations sont dans ce cas le jour même. Ce ne sont pas des prix
auxquels on peut entrer, et les garder fabrique des rendements qui n'existent
pas. Le filtre exige donc un volume non nul le jour d'entrée et un volume
médian non nul sur la fenêtre. Il ne regarde aucun rendement.

**Une fenêtre tronquée par un délistage est GARDÉE.** L'actif coté puis
retiré en trois semaines est un événement, pas une donnée manquante ; le
rendement est mesuré jusqu'à sa dernière clôture. Les écarter reviendrait à
exclure les pires, ce qui jouerait CONTRE l'hypothèse d'une baisse — le test
est donc conservateur dans ce sens aussi, et le script compte ces cas à part.

════════════════════════════════════════════════════════════════════════════
  LE MODÈLE NUL
════════════════════════════════════════════════════════════════════════════

Pour chaque événement, une date tirée au hasard dans l'histoire DU MÊME
ACTIF, et la même fenêtre mesurée à partir d'elle. La question posée est donc
« la fenêtre post-cotation est-elle différente d'une fenêtre ordinaire de ce
même actif ? », et non « le prix a-t-il baissé ? » — un actif qui décline
toute sa vie donnerait la seconde réponse sans qu'il y ait rien à trader.

Le rendement est aussi mesuré NET DE BTC sur exactement la même fenêtre, et
le bras aléatoire subit la même soustraction : ne neutraliser que l'observé
fabriquerait un écart qui ne dirait rien.

**Ce que ce test ne peut pas prouver.** Il porte sur un seul exchange et une
seule époque, et la cotation sur Hyperliquid n'est pas la première cotation
du jeton dans l'absolu. Un résultat positif vaudrait candidature à un journal
hors échantillon, jamais conclusion — c'est la règle du dépôt, et elle a déjà
servi une fois.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import random
import statistics as st
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from trading_desk.sentinelle.validation import benjamini_hochberg

JOUR_MS = 86_400_000

# L'exchange a ouvert ses perpetuels en 2023. On prend une marge franche :
# apres cette date, une premiere bougie ne peut plus etre une reprise de
# donnees anterieures, seulement une mise en cotation.
SEUIL_COTATION = dt.date(2023, 7, 1)

# Fenetres, en jours apres la cloture du premier jour. Fixees d'avance.
FENETRES = [("J+1_J+7", 7), ("J+1_J+30", 30)]

# Tranches d'amplitude du premier jour, bornes rondes posees d'avance.
TRANCHES = [
    ("< 15 %", 0.0, 0.15),
    ("15-30 %", 0.15, 0.30),
    ("> 30 %", 0.30, 1e9),
]

REFERENCE = "BTC"

# ────────────────────────────────────────────────────────────────────────────
# LE FILTRE DE NÉGOCIABILITÉ, et pourquoi il n'était pas là au premier jet.
#
# L'exchange publie des bougies AVANT que le perpétuel ne s'échange : prix de
# marque, volume nul. Sur les 154 cotations retenues, **49 — soit 32 % — ont
# un volume nul le jour de leur cotation**, et 23 % ont un volume médian nul
# sur leur première semaine.
#
# Ce ne sont pas des prix auxquels on peut entrer, et les laisser entrer
# fabrique des rendements qui n'existent pas. Le cas limite mesuré : PANDORA,
# +3 823 % sur sept jours, volume nul sur les huit premiers. À lui seul, cet
# événement déplaçait la moyenne des 154 de vingt-cinq points de pourcentage.
#
# Le filtre est une exigence d'EXÉCUTABILITÉ, pas un réglage : il ne regarde
# aucun rendement. Il a été ajouté après avoir constaté l'existence des
# bougies à volume nul, et le script le dit plutôt que de faire comme si la
# première version n'avait jamais tourné.
# ────────────────────────────────────────────────────────────────────────────


def charger(chemin: str) -> dict:
    return json.loads(Path(chemin).read_text(encoding="utf-8"))["actifs"]


def serie(actif: dict) -> dict[int, dict]:
    """Les bougies indexées par jour UTC."""
    return {b["t"] // JOUR_MS: b for b in actif["bougies"]}


def rendement(par_jour: dict[int, dict], debut: int, fin: int) -> tuple[float, bool]:
    """Rendement de clôture à clôture entre deux jours UTC.

    Rend aussi si la fenêtre a été TRONQUÉE — l'actif a cessé de coter avant
    la fin. On prend alors la dernière clôture connue : c'est ce qu'un
    opérateur aurait obtenu, et l'écarter retirerait les pires cas.
    """
    if debut not in par_jour:
        return 0.0, False
    c0 = par_jour[debut]["c"]
    if c0 <= 0:
        return 0.0, False
    if fin in par_jour:
        return par_jour[fin]["c"] / c0 - 1, False
    posterieurs = [j for j in par_jour if debut < j <= fin]
    if not posterieurs:
        return 0.0, False
    return par_jour[max(posterieurs)]["c"] / c0 - 1, True


def evenements(actifs: dict, duree_max: int) -> list[dict]:
    """Les cotations retenues, avec leur amplitude de premier jour."""
    dernier_jour = max(a["derniere_ms"] for a in actifs.values()) // JOUR_MS
    out = []
    for nom, a in actifs.items():
        premier = a["premiere_ms"] // JOUR_MS
        date = dt.datetime.fromtimestamp(premier * JOUR_MS / 1000, dt.UTC).date()
        if date < SEUIL_COTATION:
            continue                      # reprise de donnees, pas une cotation
        # Il faut que la fenetre la plus longue ait eu le temps de se derouler
        # DANS LE PASSE. Sans ca, les cotations recentes entreraient avec une
        # fenetre systematiquement tronquee par le present, ce qui n'est pas
        # un delistage mais un manque de recul.
        if premier + duree_max > dernier_jour:
            continue
        par_jour = serie(a)
        b0 = par_jour.get(premier)
        if not b0 or b0["c"] <= 0:
            continue
        # Négociabilité : il faut pouvoir entrer, et pouvoir sortir.
        if b0["v"] <= 0:
            continue
        fenetre = [par_jour[j]["v"] for j in range(premier, premier + duree_max + 1)
                   if j in par_jour]
        if not fenetre or st.median(fenetre) <= 0:
            continue
        amplitude = (b0["h"] - b0["l"]) / b0["c"]
        out.append({
            "symbole": nom, "jour0": premier, "date": str(date),
            "amplitude": amplitude, "delisté": a["delisté"],
            "par_jour": par_jour,
        })
    return out


def tranche_de(amplitude: float) -> str:
    for nom, bas, haut in TRANCHES:
        if bas <= amplitude < haut:
            return nom
    return TRANCHES[-1][0]


def mesurer(evs: list[dict], duree: int, btc: dict[int, dict],
            tirages: int, rng: random.Random) -> dict:
    """Observé et modèle nul, bruts et nets de BTC, pour une fenêtre."""
    obs_brut, obs_net, tronquees = [], [], 0
    nuls_brut = [0.0] * tirages
    nuls_net = [0.0] * tirages

    for e in evs:
        jours = sorted(e["par_jour"])
        d = e["jour0"]
        r, tronque = rendement(e["par_jour"], d, d + duree)
        tronquees += int(tronque)
        rb, _ = rendement(btc, d, d + duree)
        obs_brut.append(-r)                 # sens = -1 : on VEND
        obs_net.append(-(r - rb))

        # Le bras aleatoire : une date tiree dans l'histoire du MEME actif,
        # assez tot pour que la fenetre tienne dans ce qu'on connait de lui.
        possibles = [j for j in jours if j + duree <= jours[-1]]
        if not possibles:
            possibles = jours[:1]
        for k in range(tirages):
            d2 = rng.choice(possibles)
            r2, _ = rendement(e["par_jour"], d2, d2 + duree)
            rb2, _ = rendement(btc, d2, d2 + duree)
            nuls_brut[k] += -r2
            nuls_net[k] += -(r2 - rb2)

    n = len(evs)
    if not n:
        return {}
    moy_brut, moy_net = st.mean(obs_brut), st.mean(obs_net)
    nb = [x / n for x in nuls_brut]
    nn = [x / n for x in nuls_net]
    return {
        "n": n, "tronquees": tronquees,
        "brut_bps": moy_brut * 10_000,
        "net_bps": moy_net * 10_000,
        "hasard_brut_bps": st.mean(nb) * 10_000,
        "hasard_net_bps": st.mean(nn) * 10_000,
        "mediane_net_bps": st.median(obs_net) * 10_000,
        "part_gagnante": sum(1 for x in obs_net if x > 0) / n,
        # p unilateral : combien de tirages font AUSSI BIEN que l'observe.
        "p_brut": (sum(1 for x in nb if x >= moy_brut) + 1) / (tirages + 1),
        "p_net": (sum(1 for x in nn if x >= moy_net) + 1) / (tirages + 1),
        "tirages": tirages,
    }


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--donnees", default="data/cotations.json")
    p.add_argument("--tirages", type=int, default=2000)
    p.add_argument("--alpha", type=float, default=0.05)
    p.add_argument("--min-evenements", type=int, default=12)
    p.add_argument("--out", default=None)
    args = p.parse_args()

    actifs = charger(args.donnees)
    btc = serie(actifs[REFERENCE])
    duree_max = max(d for _, d in FENETRES)
    evs = evenements(actifs, duree_max)

    print(f"\n  {len(actifs)} perpétuels collectés, "
          f"{sum(1 for a in actifs.values() if a['delisté'])} délistés.")
    print(f"  {len(evs)} cotations retenues depuis {SEUIL_COTATION} "
          f"(dont {sum(1 for e in evs if e['delisté'])} depuis délistées).")
    print(f"  Modèle nul : {args.tirages} tirages, plancher de p "
          f"{1 / (args.tirages + 1):.5f}.\n")
    if len(evs) < args.min_evenements:
        print("  Trop peu d'événements pour conclure quoi que ce soit.\n")
        return 1

    rng = random.Random(20260914)
    lignes = []
    for nom_f, duree in FENETRES:
        for nom_t, bas, haut in [*TRANCHES, ("toutes", -1.0, 1e9)]:
            sous = [e for e in evs if bas <= e["amplitude"] < haut] \
                if nom_t != "toutes" else evs
            if len(sous) < args.min_evenements:
                continue
            r = mesurer(sous, duree, btc, args.tirages, rng)
            r.update({"fenetre": nom_f, "tranche": nom_t})
            lignes.append(r)

    print("  RENDEMENT DE LA VENTE À DÉCOUVERT APRÈS COTATION")
    print("  (positif = le prix a baissé, donc le short gagne)")
    print("  " + "─" * 84)
    print(f"  {'fenêtre':<10} {'tranche':<9} {'n':>4} {'brut':>9} {'net BTC':>9} "
          f"{'hasard':>9} {'médiane':>9} {'gagn.':>6} {'p net':>8}")
    print("  " + "─" * 84)
    for r in lignes:
        print(f"  {r['fenetre']:<10} {r['tranche']:<9} {r['n']:>4} "
              f"{r['brut_bps']:>+9.1f} {r['net_bps']:>+9.1f} "
              f"{r['hasard_net_bps']:>+9.1f} {r['mediane_net_bps']:>+9.1f} "
              f"{r['part_gagnante']:>5.0%} {r['p_net']:>8.4f}")

    ps = [r["p_net"] for r in lignes]
    garde = benjamini_hochberg(ps, args.alpha)
    survivants = [r for r, g in zip(lignes, garde, strict=True) if g]
    bruts = sum(1 for x in ps if x < args.alpha)

    print("  " + "─" * 84)
    print(f"  {len(lignes)} tests · {bruts} à p < {args.alpha} · "
          f"{len(lignes) * args.alpha:.1f} attendus par pur hasard · "
          f"**{len(survivants)} survivant(s)** après Benjamini-Hochberg")
    plancher = 1 / (args.tirages + 1)
    seuil1 = args.alpha / len(lignes)
    print(f"  plancher de p {plancher:.5f} · seuil BH au rang 1 {seuil1:.5f}"
          + ("  → le criblage POUVAIT voir" if plancher < seuil1
             else "  → AVEUGLE, augmenter --tirages"))
    tronquees = sum(r["tronquees"] for r in lignes if r["tranche"] == "toutes")
    print(f"  fenêtres tronquées par un délistage : {tronquees}")

    if survivants:
        print("\n  Ce qui survit :")
        for r in sorted(survivants, key=lambda x: x["p_net"]):
            print(f"    {r['fenetre']:<10} {r['tranche']:<9} n={r['n']:<4} "
                  f"net {r['net_bps']:>+8.1f} bps contre "
                  f"{r['hasard_net_bps']:>+7.1f} au hasard, p={r['p_net']:.4f}")
        print("\n  Un survivant DANS l'échantillon vaut candidature à un journal")
        print("  hors échantillon, jamais conclusion. C'est la règle du dépôt.")
    else:
        print("\n  AUCUN. L'hypothèse de décroissance post-cotation est réfutée")
        print("  sur ces données, et c'est un résultat : elle dit où ne pas")
        print("  mettre d'argent.")

    if args.out:
        Path(args.out).write_text(json.dumps({
            "hypothese": "la cotation d'un perpetuel est suivie d'une baisse (sens = -1)",
            "seuil_cotation": str(SEUIL_COTATION),
            "tirages": args.tirages, "alpha": args.alpha,
            "evenements": len(evs),
            "cellules": [{k: v for k, v in r.items() if k != "par_jour"}
                         for r in lignes],
        }, indent=1, ensure_ascii=False), encoding="utf-8")
        print(f"\n  Résultats bruts : {args.out}")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
