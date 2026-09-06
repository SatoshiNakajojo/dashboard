#!/usr/bin/env python3
"""L'effet de déblocage est établi. Est-il *exploitable* ?

    python3 scripts/economie_unlocks.py --unlocks data/unlocks.json

Cinq contrôles statistiques ont survécu, décalage calendaire compris. Cela
répond à « l'effet existe-t-il ? » et **à rien d'autre**. Un effet réel et
un effet exploitable sont deux choses différentes, et la distance entre les
deux a tué plus de stratégies que les faux positifs.

Ce script pose les trois questions qui restent. Aucune ne se règle par un
test de significativité, et deux d'entre elles peuvent tuer le résultat.

## 1. La moyenne est-elle portée par une poignée de coups ?

+236 bps de moyenne sur 852 événements ne dit pas si l'on gagne souvent un
peu ou rarement beaucoup. Le tableau par jeton montrait des valeurs comme
USUAL +1335 bps et EIGEN +925 bps : si l'effet disparaît en retirant les 5 %
meilleurs, ce n'est pas un edge, c'est un billet de loterie — et un billet
de loterie demande un capital et une patience que ce desk n'a pas.

## 2. Combien de paris INDÉPENDANTS cela fait-il vraiment ?

Le décalage calendaire vient d'établir que les événements sont groupés dans
le calendrier. Ce qui était une objection statistique devient ici une
contrainte d'allocation : on ne prend pas 852 positions indépendantes, on
prend une poignée de positions par semaine, et les semaines sont l'unité de
décision. Le rendement par SEMAINE, portefeuille équipondéré, est le seul
chiffre qui décrit ce qu'un compte vivrait.

## 3. Que reste-t-il après les coûts ?

Deux postes, de natures très différentes.

**Le financement est mesurable**, et il n'est pas un coût : une position
courte *reçoit* le financement quand il est positif, ce qui est le cas
habituel sur des perpétuels d'altcoins où le flux est acheteur. Sur six
jours et 144 paiements horaires, ce n'est pas un détail. Il est donc lu sur
l'API Hyperliquid, pas estimé.

**L'écart et le glissement ne le sont pas** : le carnet historique n'existe
pas, l'enregistreur ne le collecte que depuis aujourd'hui. Les inventer
serait pire que de les ignorer. Ce script les traite donc en **paramètre**
et répond à la question renversée : *jusqu'à quel coût aller-retour l'edge
survit-il ?* Un seuil de rentabilité se compare à un carnet réel ; une
hypothèse de coût inventée ne se compare à rien.
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from trading_desk.backtest.data import DataUnavailable, load_from_file

JOUR_MS = 86_400_000
HEURE_MS = 3_600_000

# La fenêtre qui a survécu aux cinq contrôles, et elle seule. Mesurer les
# coûts d'une autre fenêtre reviendrait à chiffrer une stratégie qui n'a
# jamais été validée.
DECALAGE, DUREE = -7, 6

TRANCHES = [("0,5-2 %", 0.005, 0.02), ("2-5 %", 0.02, 0.05),
            ("> 5 %", 0.05, 1e9), ("toutes", 0.0, 1e9)]


def index_par_date(bars) -> dict[int, int]:
    return {b.ts_ms // JOUR_MS: i for i, b in enumerate(bars)}


def sans_chevauchement(indices: list[int], horizon: int) -> list[int]:
    gardes, dernier = [], -10**9
    for i in sorted(indices):
        if i - dernier >= horizon:
            gardes.append(i)
            dernier = i
    return gardes


def evenements(unlocks: dict, bas: float, haut: float) -> list[dict]:
    """Le MÊME ensemble d'événements que celui qui a donné +236 bps.

    Reconstruit ici plutôt qu'importé : `valider_unlocks` mélange la
    construction et la mesure, et un écart silencieux entre les deux
    ensembles chiffrerait les coûts d'une stratégie différente de celle qui
    a été validée. `test_les_deux_scripts_voient_les_memes_evenements`
    verrouille l'égalité.
    """
    out = []
    for symbole, bruts in sorted(unlocks.items()):
        try:
            bars = load_from_file(f"data/{symbole}_1d_real.json", symbole, "1d")
        except (DataUnavailable, FileNotFoundError):
            continue
        par_jour = index_par_date(bars)
        candidats = []
        for e in bruts:
            if not bas <= e["part_offre"] < haut:
                continue
            i = par_jour.get(e["ts_ms"] // JOUR_MS + DECALAGE)
            if i is not None:
                candidats.append(i)
        # Dédupliquer AVANT d'écarter les fenêtres qui débordent la série.
        # L'ordre inverse promeut un événement que le vrai calendrier
        # masquait : si A déborde et que B tombe trois jours plus tard, B
        # reste contaminé par A, qui a bien eu lieu — l'écarter est correct,
        # le garder mesurerait deux déblocages et en attribuerait un.
        for i in sans_chevauchement(candidats, DUREE):
            if i + DUREE >= len(bars):
                continue
            depart = float(bars[i].close)
            if depart <= 0:
                continue
            # `sens = -1` : POSITIF = le prix a baissé = le short gagne.
            brut = -1 * (float(bars[i + DUREE].close) - depart) / depart * 10_000
            out.append({
                "symbole": symbole, "brut_bps": brut,
                "debut_ms": bars[i].ts_ms, "fin_ms": bars[i + DUREE].ts_ms,
                "semaine": bars[i].ts_ms // (7 * JOUR_MS),
                "part_offre": e["part_offre"],
            })
    return out


# --------------------------------------------------------------------------
#  Le financement, lu et non estimé
# --------------------------------------------------------------------------

def _appel(payload: dict, essais: int = 3):
    for n in range(essais):
        try:
            req = urllib.request.Request(
                "https://api.hyperliquid.xyz/info", data=json.dumps(payload).encode(),
                headers={"Content-Type": "application/json"})
            return json.loads(urllib.request.urlopen(req, timeout=20).read())
        except urllib.error.HTTPError as exc:
            # 429 et 5xx sont transitoires ; un 400 ne le sera jamais et
            # réessayer ne ferait que retarder le message utile.
            if exc.code not in (408, 429) and exc.code < 500:
                raise
        except (urllib.error.URLError, TimeoutError):
            pass
        if n + 1 < essais:
            time.sleep(2 ** n)
    return None


def financement(evts: list[dict], cache: Path) -> tuple[int, int]:
    """Somme du financement horaire sur la fenêtre de chaque événement.

    **Une position courte REÇOIT le financement quand il est positif** — la
    convention Hyperliquid est que les acheteurs paient les vendeurs. Le
    signe compte plus que la magnitude : se tromper transformerait un revenu
    en charge et déplacerait la conclusion de plusieurs dizaines de points de
    base dans le mauvais sens.

    Le cache est sur disque parce que la mesure coûte ~850 requêtes : sans
    lui, chaque relance de l'analyse re-sollicite l'API pour des données qui
    ne changent jamais — l'historique de financement est du passé.
    """
    connu: dict[str, float] = {}
    if cache.exists():
        connu = json.loads(cache.read_text())

    manquants = [e for e in evts if f"{e['symbole']}:{e['debut_ms']}" not in connu]
    if manquants:
        print(f"  financement : {len(manquants)} fenêtres à lire sur l'API "
              f"({len(evts) - len(manquants)} déjà en cache)…", file=sys.stderr)
    echecs = 0
    for n, e in enumerate(manquants):
        cle = f"{e['symbole']}:{e['debut_ms']}"
        h = _appel({"type": "fundingHistory", "coin": e["symbole"],
                    "startTime": e["debut_ms"], "endTime": e["fin_ms"]})
        if h is None:
            echecs += 1
            continue
        # Absence de données et somme nulle ne sont pas la même chose : un
        # jeton non listé à l'époque doit être écarté, pas compté à zéro.
        connu[cle] = (sum(float(x["fundingRate"]) for x in h) * 10_000
                      if h else None)
        if n % 50 == 49:
            cache.write_text(json.dumps(connu))
            print(f"    {n + 1}/{len(manquants)}", file=sys.stderr)
    cache.write_text(json.dumps(connu))

    couverts = 0
    for e in evts:
        f = connu.get(f"{e['symbole']}:{e['debut_ms']}")
        e["financement_bps"] = f
        couverts += f is not None
    return couverts, echecs


# --------------------------------------------------------------------------
#  Les trois questions
# --------------------------------------------------------------------------

def distribution(evts: list[dict], champ: str) -> None:
    v = sorted(e[champ] for e in evts if e.get(champ) is not None)
    if len(v) < 20:
        print("     échantillon insuffisant.\n")
        return
    moy = statistics.mean(v)
    coupe = int(len(v) * 0.05)
    sans_haut = v[:-coupe] if coupe else v
    print(f"  {'n':<28} {len(v):>10}")
    print(f"  {'moyenne':<28} {moy:>+10.1f} bps")
    print(f"  {'médiane':<28} {statistics.median(v):>+10.1f} bps")
    print(f"  {'écart-type':<28} {statistics.pstdev(v):>10.1f} bps")
    print(f"  {'part gagnante':<28} {sum(1 for x in v if x > 0) / len(v):>10.1%}")
    print(f"  {'sans les 5 % meilleurs':<28} {statistics.mean(sans_haut):>+10.1f} bps"
          f"   ({coupe} retirés)")
    if statistics.mean(sans_haut) <= 0 < moy:
        print("  ----> BILLET DE LOTERIE : tout l'effet tient dans la queue "
              "haute.")
    print()


def par_semaine(evts: list[dict], champ: str) -> list[float]:
    """Le rendement d'un portefeuille équipondéré, semaine par semaine.

    C'est la seule unité qui décrit ce qu'un compte vivrait. Raisonner par
    événement supposerait 852 paris indépendants ; le décalage calendaire
    vient d'établir qu'ils ne le sont pas.
    """
    groupes: dict[int, list[float]] = {}
    for e in evts:
        if e.get(champ) is not None:
            groupes.setdefault(e["semaine"], []).append(e[champ])
    return [statistics.mean(v) for _, v in sorted(groupes.items())]


def rentabilite(evts: list[dict], champ: str) -> None:
    """Jusqu'à quel coût aller-retour l'edge survit-il ?

    La question est renversée à dessein. Une hypothèse de coût inventée ne
    se compare à rien ; un seuil se compare au carnet réel, que
    l'enregistreur collecte à partir d'aujourd'hui.
    """
    sem = par_semaine(evts, champ)
    if len(sem) < 10:
        print("     trop peu de semaines.\n")
        return
    moy = statistics.mean(sem)
    ec = statistics.pstdev(sem) or 1e-9
    print(f"  {'semaines distinctes':<28} {len(sem):>10}")
    print(f"  {'rendement moyen / semaine':<28} {moy:>+10.1f} bps")
    print(f"  {'part de semaines gagnantes':<28} "
          f"{sum(1 for x in sem if x > 0) / len(sem):>10.1%}")
    print(f"  {'Sharpe annualisé (52 sem.)':<28} "
          f"{moy / ec * (52 ** 0.5):>10.2f}")
    print()
    print(f"  {'coût A/R':>10}  {'net / semaine':>14}  {'Sharpe':>8}")
    print("  " + "-" * 40)
    for cout in (0, 10, 25, 50, 100, 150):
        net = moy - cout
        print(f"  {cout:>8} bps  {net:>+11.1f} bps  "
              f"{net / ec * (52 ** 0.5):>8.2f}")
    print("  " + "-" * 40)
    print(f"  Seuil de rentabilité : {moy:.0f} bps d'aller-retour.")
    print("  Au-delà, la stratégie perd de l'argent quelle que soit sa "
          "significativité.\n")


def neutraliser(evts: list[dict], reference: str = "BTC") -> int:
    """Le rendement d'une position courte sur le jeton, ADOSSÉE à un achat
    de la référence pour le même notionnel.

    Ce n'est pas un raffinement statistique, c'est **une autre stratégie**.
    136 semaines distinctes sur environ 130 semaines de données : la version
    nue est courte sur des altcoins pratiquement chaque semaine de la
    période. Son résultat contient donc une exposition courte permanente au
    marché, qui a rapporté ou coûté indépendamment des déblocages.

    La version adossée n'a pas cette exposition. Elle est plus chère — deux
    jambes, donc deux allers-retours — mais c'est la seule dont le résultat
    est attribuable aux déblocages.

    Convention identique à `marche_neutre` : `-1 * (jeton - référence)`.
    """
    try:
        marche = load_from_file(f"data/{reference}_1d_real.json", reference, "1d")
    except (DataUnavailable, FileNotFoundError):
        return 0
    par_jour = index_par_date(marche)
    faits = 0
    for e in evts:
        j0 = par_jour.get(e["debut_ms"] // JOUR_MS)
        j1 = par_jour.get(e["fin_ms"] // JOUR_MS)
        if j0 is None or j1 is None:
            e["neutre_bps"] = None
            continue
        d = float(marche[j0].close)
        if d <= 0:
            e["neutre_bps"] = None
            continue
        ref = (float(marche[j1].close) - d) / d
        e["neutre_bps"] = e["brut_bps"] + ref * 10_000
        faits += 1
    return faits


def vecu(evts: list[dict], champ: str, titre: str, fraction: float) -> None:
    """Ce qu'un compte aurait VÉCU, et non ce que la moyenne raconte.

    Un Sharpe de 1,8 à 76 % de volatilité annualisée est un chiffre
    parfaitement compatible avec une perte de moitié du capital en chemin.
    La moyenne ne dit pas dans quel ordre les semaines sont arrivées, et
    c'est l'ordre qui décide si une stratégie est tenable : le repli maximal
    et la plus longue série perdante sont ce qui fait abandonner, pas
    l'espérance.

    Les rendements sont COMPOSÉS, parce qu'un compte compose. Les additionner
    surestimerait le résultat et sous-estimerait le repli.
    """
    sem = par_semaine(evts, champ)
    if len(sem) < 10:
        print("     trop peu de semaines.\n")
        return
    capital, sommet, repli, serie, pire_serie = 1.0, 1.0, 0.0, 0, 0
    courbe = []
    for r in sem:
        capital *= 1 + fraction * r / 10_000
        courbe.append(capital)
        sommet = max(sommet, capital)
        repli = max(repli, 1 - capital / sommet)
        serie = serie + 1 if r <= 0 else 0
        pire_serie = max(pire_serie, serie)

    # La pire semaine s'affiche EN IMPACT SUR LE CAPITAL, pas en rendement
    # brut de la stratégie. Sous un titre qui annonce « 25 % du capital »,
    # un « -20 % » brut se lit comme une perte d'un cinquième du compte
    # alors qu'elle en coûte un vingtième — l'erreur de lecture la plus
    # coûteuse que ce rapport puisse provoquer.
    print(f"  {titre}  (notionnel = {fraction:.0%} du capital par semaine)")
    print(f"  {'capital final':<30} {capital:>10.2f} x")
    print(f"  {'repli maximal':<30} {repli:>10.1%}")
    print(f"  {'pire semaine, sur le capital':<30} "
          f"{fraction * min(sem) / 10_000:>10.1%}")
    print(f"  {'  (rendement brut ce jour-là)':<30} "
          f"{min(sem) / 10_000:>10.1%}")
    print(f"  {'plus longue série perdante':<30} {pire_serie:>7} semaines")
    if repli > 0.5:
        print("  ----> INTENABLE à ce notionnel : personne ne traverse "
              f"un repli de {repli:.0%}.")
    print()


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--unlocks", default="data/unlocks.json")
    p.add_argument("--cache", default="data/financement_cache.json")
    p.add_argument("--sans-financement", action="store_true",
                   help="sauter les ~850 requêtes API et ne chiffrer que le brut")
    p.add_argument("--fraction", type=float, default=0.25,
                   help="part du capital engagée chaque semaine ; 1.0 = tout")
    p.add_argument("--reference", default="BTC",
                   help="l'actif de la jambe longue, pour la version adossée")
    p.add_argument("--tranche", default="2-5 %",
                   help="la tranche à chiffrer ; « toutes » mélange les tailles")
    args = p.parse_args()

    chemin = Path(args.unlocks)
    if not chemin.exists():
        print(f"\n  {chemin} introuvable. Lancez d'abord "
              "`python3 scripts/fetch_unlocks.py`.\n", file=sys.stderr)
        return 2
    unlocks = json.loads(chemin.read_text())

    bornes = {t[0]: (t[1], t[2]) for t in TRANCHES}
    if args.tranche not in bornes:
        print(f"  tranche inconnue. Au choix : {list(bornes)}", file=sys.stderr)
        return 2
    evts = evenements(unlocks, *bornes[args.tranche])
    if not evts:
        print("  aucun événement.", file=sys.stderr)
        return 1

    print(f"\n  ÉCONOMIE DU DÉBLOCAGE — tranche « {args.tranche} », "
          f"fenêtre J-7 → J-1")
    print("  " + "=" * 74)
    print(f"  {len(evts)} événements sur "
          f"{len({e['symbole'] for e in evts})} jetons.")
    print("  (POSITIF = le prix a baissé = la position COURTE gagne.)\n")

    print("  1. DISTRIBUTION — un edge, ou un billet de loterie ?")
    print("  " + "-" * 74)
    distribution(evts, "brut_bps")

    champ = "brut_bps"
    if not args.sans_financement:
        couverts, echecs = financement(evts, Path(args.cache))
        print("  2. FINANCEMENT — mesuré, pas estimé")
        print("  " + "-" * 74)
        print(f"  {'fenêtres couvertes':<28} {couverts:>10} / {len(evts)}")
        if echecs:
            print(f"  {'requêtes en échec':<28} {echecs:>10}")
        recus = [e["financement_bps"] for e in evts
                 if e.get("financement_bps") is not None]
        if recus:
            print(f"  {'reçu par le short, médiane':<28} "
                  f"{statistics.median(recus):>+10.1f} bps")
            print(f"  {'reçu par le short, moyenne':<28} "
                  f"{statistics.mean(recus):>+10.1f} bps")
            print("  Un financement positif est un REVENU pour une position "
                  "courte.\n")
            for e in evts:
                f = e.get("financement_bps")
                e["net_bps"] = e["brut_bps"] + f if f is not None else None
            champ = "net_bps"
            print("  1bis. DISTRIBUTION, financement inclus")
            print("  " + "-" * 74)
            distribution(evts, champ)
        else:
            print("  Aucune donnée de financement — on reste sur le brut.\n")

    print("  3. RENTABILITÉ — la semaine est l'unité de décision")
    print("  " + "-" * 74)
    rentabilite(evts, champ)

    print("  4. CE QU'UN COMPTE AURAIT VÉCU")
    print("  " + "-" * 74)
    vecu(evts, champ, "Vente à découvert nue", args.fraction)
    if neutraliser(evts, args.reference):
        # La version adossée n'est pas une variante : c'est la seule dont le
        # résultat est attribuable aux déblocages plutôt qu'à une exposition
        # courte permanente au marché.
        print(f"  Adossée à un achat de {args.reference} — sans exposition "
              "au marché")
        print("  " + "-" * 74)
        for e in evts:
            f = e.get("financement_bps")
            e["neutre_net_bps"] = (
                e["neutre_bps"] + f
                if e.get("neutre_bps") is not None and f is not None else None)
        colonne = "neutre_net_bps" if champ == "net_bps" else "neutre_bps"
        distribution(evts, colonne)
        rentabilite(evts, colonne)
        vecu(evts, colonne, "Position adossée", args.fraction)
    else:
        print(f"  data/{args.reference}_1d_real.json introuvable : "
              "impossible de séparer l'edge de l'exposition au marché.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
