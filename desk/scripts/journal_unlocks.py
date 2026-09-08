#!/usr/bin/env python3
"""La seule question qu'aucun test historique ne peut trancher.

    python3 scripts/journal_unlocks.py                  # enregistrer
    python3 scripts/journal_unlocks.py --resoudre       # relever le score

Six contrôles ont survécu : dénominateurs aberrants, jackknife par jeton,
coupe temporelle, neutralisation du marché, décalage calendaire brut, et
décalage calendaire sur le rendement net. C'est tout ce qu'on peut demander
à 852 événements passés.

**Et ils partagent tous le même défaut, qui ne se corrige pas.** Ils ont été
construits, ajustés et relus en connaissant les données. Chaque décision de
méthode — la fenêtre J-7/J-1, les bornes des tranches, la durée de six jours
— a été prise par quelqu'un qui avait déjà vu le résultat, moi. Rien
n'indique que j'aie triché ; tout indique que je ne peux pas le prouver.

Une seule chose le peut : **prédire avant de savoir**.

## Ce que ce journal fait, et pourquoi il est ennuyeux

Il écrit les positions à prendre AVANT que la fenêtre ne s'ouvre, dans un
fichier qui ne se réécrit pas. Puis, des semaines plus tard, il relève ce
qui s'est passé.

C'est délibérément primitif, et deux propriétés comptent plus que le
confort :

**Le journal est en AJOUT SEUL.** Une prédiction inscrite compte, gagnante
ou perdante. Un journal qu'on peut nettoyer ne mesure plus rien — il ne fait
que documenter les trades dont on se souvient avec plaisir.

**La règle est figée dans chaque ligne.** Fenêtre, tranche, couverture,
version : tout est recopié dans l'entrée. Si je change la méthode dans six
semaines, les anciennes prédictions gardent l'ancienne règle et le score
reste comparable. Sans ça, « ajuster légèrement le seuil » suffirait à
transformer rétroactivement un échec en succès.

## Ce qu'il faudra pour conclure

Le résultat historique est de +290 bps par événement sur la tranche 2-5 %,
avec un écart-type de 1 050 bps. Pour distinguer +290 de zéro avec une
confiance raisonnable, il faut de l'ordre de **cinquante à cent
événements** — soit six mois à un an de collecte, au rythme observé.

C'est long, et c'est le prix. Toute conclusion tirée de dix trades sera du
bruit, quelle que soit son allure. Le rapport le dit à chaque relevé plutôt
que de laisser l'enthousiasme faire le calcul.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from trading_desk.backtest.data import fetch_hyperliquid
from trading_desk.sentinelle.triggers import (
    DEBLOCAGE_AVANCE_J,
    DEBLOCAGE_DUREE_J,
    DEBLOCAGE_PART_MAX,
    DEBLOCAGE_PART_MIN,
    deblocages_retenus,
)

JOUR_MS = 86_400_000

# La règle, figée. Toute modification incrémente la VERSION, et les entrées
# des versions antérieures restent jugées sur la leur — sinon « ajuster
# légèrement le seuil » transformerait un échec passé en succès.
VERSION = 2
REFERENCE = "BTC"

# **La règle n'est PAS définie ici.** Elle vient de
# `sentinelle.triggers`, qui en est la seule source. Ce script inscrit des
# positions ; le déclencheur en réveille le desk ; `valider_unlocks.py` les
# a mesurées. Trois lecteurs, une définition.
#
# La duplication n'est pas une crainte théorique, elle a mordu deux fois :
# `poolage` et `decalage_calendaire` ordonnaient différemment la
# déduplication et le filtre de débordement, et la v1 de ce journal a
# inscrit XPL deux fois et un déblocage de 65 % de l'offre. Une copie dérive
# un jour, et la dérive ne se voit jamais dans les chiffres — elle se voit
# des mois plus tard, dans un score hors échantillon qui ne mesure pas la
# stratégie qu'on croyait.
ENTREE_J = -DEBLOCAGE_AVANCE_J
SORTIE_J = ENTREE_J + DEBLOCAGE_DUREE_J


def a_prendre(unlocks: dict, maintenant_ms: int, horizon_j: int,
              univers: set[str] | None = None) -> list[dict]:
    """Les déblocages dont la fenêtre d'entrée s'ouvre dans les jours à venir.

    On ne retient QUE les événements encore à venir. Un déblocage dont
    l'entrée est déjà passée serait une prédiction faite après coup, ce qui
    est exactement ce que ce journal existe pour rendre impossible.

    **Un seul événement par fenêtre et par jeton.** La validation applique
    `sans_chevauchement` : deux déblocages à trois jours d'écart produisent
    des fenêtres qui se recouvrent, donc une position tenue une fois et
    comptée deux. Sans cette règle ici, le journal inscrirait deux lignes
    là où la stratégie validée n'en prend qu'une, et le score hors
    échantillon porterait sur autre chose que ce qui a été mesuré.
    """
    out = []
    for symbole, bruts in sorted(unlocks.items()):
        if univers is not None and symbole not in univers:
            continue
        for e in deblocages_retenus(bruts):
            entree = e["ts_ms"] + ENTREE_J * JOUR_MS
            if not maintenant_ms < entree <= maintenant_ms + horizon_j * JOUR_MS:
                continue
            out.append({
                "version": VERSION, "symbole": symbole,
                "deblocage_ms": e["ts_ms"], "part_offre": e["part_offre"],
                "entree_ms": entree, "sortie_ms": e["ts_ms"] + SORTIE_J * JOUR_MS,
                "sens": "COURT", "reference": REFERENCE,
                "inscrit_ms": maintenant_ms,
            })
    return out


def univers_hyperliquid() -> set[str] | None:
    """Les perpétuels réellement cotés. `None` si l'API est injoignable.

    Un déblocage sur un jeton qu'on ne peut pas vendre à découvert n'est pas
    une position, c'est une ligne dans un fichier. L'inscrire gonflerait le
    journal de prédictions que personne n'aurait pu prendre, et le score
    hors échantillon mesurerait un portefeuille imaginaire.

    En cas d'échec on renvoie `None` plutôt qu'un ensemble vide : un réseau
    coupé ne doit pas se traduire par « aucun jeton n'est cotable ».
    """
    import urllib.request
    try:
        req = urllib.request.Request(
            "https://api.hyperliquid.xyz/info",
            data=json.dumps({"type": "meta"}).encode(),
            headers={"Content-Type": "application/json"})
        meta = json.loads(urllib.request.urlopen(req, timeout=20).read())
        return {a["name"] for a in meta["universe"]}
    except Exception:
        return None


def purger_version(journal: Path, version: int) -> tuple[bool, str]:
    """Retire les entrées d'une version — **et refuse dès qu'une est close**.

    Le principe d'ajout seul existe pour empêcher une chose précise :
    effacer une prédiction parce qu'elle a perdu. Ce refus doit être
    structurel, pas une promesse — donc la fonction vérifie elle-même
    qu'AUCUNE fenêtre de la version visée n'est close. Tant que rien n'est
    arrivé, il n'y a aucun résultat sur lequel sélectionner, et retirer des
    lignes écrites sous une règle mal implémentée ne peut pas flatter le
    score.

    Une seconde après la clôture de la première fenêtre, ce n'est plus vrai
    et la fonction refuse — définitivement.
    """
    if not journal.exists():
        return False, "journal inexistant"
    lignes = [json.loads(x) for x in journal.read_text().splitlines() if x.strip()]
    vises = [x for x in lignes if x["version"] == version]
    if not vises:
        return False, f"aucune entrée en v{version}"
    maintenant = int(time.time() * 1000)
    closes = [x for x in vises if x["sortie_ms"] < maintenant]
    if closes:
        return False, (
            f"REFUS : {len(closes)} fenêtre(s) de la v{version} sont déjà "
            "closes.\n  Leur résultat existe, et le retirer serait "
            "sélectionner sur l'issue.\n  C'est exactement ce que le journal "
            "interdit.")
    restant = [x for x in lignes if x["version"] != version]
    journal.write_text("".join(json.dumps(x, ensure_ascii=False) + "\n"
                               for x in restant))
    return True, f"{len(vises)} entrée(s) v{version} retirées, aucune close"


def inscrire(nouvelles: list[dict], journal: Path) -> int:
    """Ajoute les prédictions absentes. **Jamais de réécriture.**

    La clé d'unicité est (version, jeton, date de déblocage) : relancer le
    script deux fois le même jour ne doit pas dupliquer une position, mais
    ne doit pas non plus effacer ce qui est déjà inscrit.
    """
    lignes = []
    if journal.exists():
        lignes = [json.loads(x) for x in journal.read_text().splitlines() if x.strip()]
    connues = {(x["version"], x["symbole"], x["deblocage_ms"]) for x in lignes}
    ajouts = [n for n in nouvelles
              if (n["version"], n["symbole"], n["deblocage_ms"]) not in connues]
    with journal.open("a") as f:
        for n in ajouts:
            f.write(json.dumps(n, ensure_ascii=False) + "\n")
    return len(ajouts)


def _cloture(symbole: str, jour: int) -> float | None:
    """Le cours de clôture d'un jour UTC, ou `None` s'il n'est pas connu."""
    # Le releve ne doit jamais tomber : un jeton delisté, un reseau coupe ou
    # une reponse inattendue rendent une ligne incalculable, pas le journal
    # entier illisible. `resoudre` compte ces cas et les annonce.
    try:
        bars = fetch_hyperliquid(symbole, "1d", days=400)
    except Exception:
        return None
    for b in bars:
        if b.ts_ms // JOUR_MS == jour:
            return float(b.close)
    return None


def resoudre(journal: Path) -> None:
    """Relève ce que les prédictions closes ont réellement donné.

    Les entrées non résolues ne sont PAS écartées : elles sont comptées et
    annoncées. Un relevé qui ne montre que les positions dont on a pu
    calculer le résultat serait un relevé de survivants.
    """
    if not journal.exists():
        print(f"\n  {journal} n'existe pas encore. Lancez le script sans "
              "`--resoudre` pour inscrire les premières positions.\n")
        return
    lignes = [json.loads(x) for x in journal.read_text().splitlines() if x.strip()]
    maintenant = int(time.time() * 1000)
    closes = [x for x in lignes if x["sortie_ms"] < maintenant]

    print(f"\n  JOURNAL HORS ÉCHANTILLON — règle v{VERSION}")
    print("  " + "=" * 74)
    print(f"  {'positions inscrites':<32} {len(lignes):>6}")
    print(f"  {'dont la fenêtre est close':<32} {len(closes):>6}")
    if not closes:
        print("\n  Rien à relever pour l'instant. C'est normal et c'est le "
              "principe :\n  une prédiction ne compte que lorsqu'elle est "
              "faite avant les faits.\n")
        return

    resultats, manquants = [], 0
    for x in closes:
        e = _cloture(x["symbole"], x["entree_ms"] // JOUR_MS)
        s = _cloture(x["symbole"], x["sortie_ms"] // JOUR_MS)
        if e is None or s is None or e <= 0:
            manquants += 1
            continue
        brut = -1 * (s - e) / e * 10_000
        re_ = _cloture(x["reference"], x["entree_ms"] // JOUR_MS)
        rs = _cloture(x["reference"], x["sortie_ms"] // JOUR_MS)
        net = brut + ((rs - re_) / re_ * 10_000) if re_ and rs and re_ > 0 else None
        resultats.append((x, brut, net))

    print(f"  {'dont le prix est connu':<32} {len(resultats):>6}")
    if manquants:
        print(f"  {'prix indisponibles':<32} {manquants:>6}")
    if not resultats:
        # Toutes les fenêtres closes peuvent être incalculables : jetons
        # délistés, réseau coupé, journal de test. Le relevé doit le dire et
        # s'arrêter là, pas diviser par zéro — un outil qui tombe le jour où
        # l'on veut connaître son score ne sert à rien.
        print("\n  Aucune position n'a pu être valorisée. Vérifiez l'accès à\n"
              "  api.hyperliquid.xyz, puis relancez.\n")
        return
    print("  " + "-" * 74)
    for x, brut, net in resultats[-20:]:
        n = f"{net:>+8.1f}" if net is not None else "       —"
        print(f"  {x['symbole']:<9} {x['part_offre']:>6.1%}  "
              f"brut {brut:>+8.1f}  net {n}  bps")
    if len(resultats) > 20:
        print(f"  … {len(resultats) - 20} plus anciennes non affichées")
    print("  " + "-" * 74)

    bruts = [b for _, b, _ in resultats]
    nets = [n for _, _, n in resultats if n is not None]
    moy = sum(bruts) / len(bruts)
    print(f"  {'moyenne brute':<32} {moy:>+8.1f} bps")
    if nets:
        print(f"  {'moyenne nette de ' + REFERENCE:<32} "
              f"{sum(nets) / len(nets):>+8.1f} bps")
    print(f"  {'part gagnante':<32} "
          f"{sum(1 for b in bruts if b > 0) / len(bruts):>8.1%}")
    print(f"  {'attendu (historique, 2-5 %)':<32} {'+290.4':>8} bps")
    print("  " + "-" * 74)

    # L'ordre de grandeur nécessaire, rappelé à chaque relevé. Sans lui, dix
    # trades gagnants passeraient pour une confirmation.
    besoin = 50
    if len(resultats) < besoin:
        print(f"  VERDICT : AUCUN. {len(resultats)} événements sur ~{besoin} "
              "nécessaires.")
        print("  Avec un écart-type de 1 050 bps, distinguer +290 de zéro")
        print(f"  demande de l'ordre de {besoin} à 100 observations. Tout ce")
        print("  qui se lit ci-dessus est du bruit, quelle que soit son "
              "allure.\n")
    else:
        erreur = (sum((b - moy) ** 2 for b in bruts) / (len(bruts) - 1)) ** 0.5
        erreur /= len(bruts) ** 0.5
        print(f"  moyenne {moy:+.1f} ± {1.96 * erreur:.1f} bps (95 %)")
        print("  L'intervalle contient-il zéro ? Si oui, l'effet n'est pas "
              "confirmé.\n")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--unlocks", default="data/unlocks.json")
    p.add_argument("--journal", default="data/journal_unlocks.jsonl")
    p.add_argument("--horizon", type=int, default=30,
                   help="jours à l'avance pour inscrire les positions")
    p.add_argument("--resoudre", action="store_true",
                   help="relever le résultat des fenêtres closes")
    p.add_argument("--purger-version", type=int, default=None,
                   help="retirer les entrées d'une version dont AUCUNE "
                        "fenêtre n'est close ; refusé sinon")
    args = p.parse_args()

    journal = Path(args.journal)
    if args.resoudre:
        resoudre(journal)
        return 0
    if args.purger_version is not None:
        ok, message = purger_version(journal, args.purger_version)
        print(f"\n  {message}\n")
        return 0 if ok else 1

    chemin = Path(args.unlocks)
    if not chemin.exists():
        print(f"\n  {chemin} introuvable. Lancez d'abord "
              "`python3 scripts/fetch_unlocks.py`.\n", file=sys.stderr)
        return 2
    unlocks = json.loads(chemin.read_text())
    maintenant = int(time.time() * 1000)
    univers = univers_hyperliquid()
    if univers is None:
        print("  API Hyperliquid injoignable : les jetons non cotables ne "
              "peuvent pas\n  être écartés. Réessayez plutôt que d'inscrire "
              "des positions imprenables.\n", file=sys.stderr)
        return 1
    prises = a_prendre(unlocks, maintenant, args.horizon, univers)
    ajouts = inscrire(prises, journal)

    print(f"\n  POSITIONS À VENIR — règle v{VERSION}, "
          f"{args.horizon} prochains jours")
    print("  " + "=" * 74)
    # La règle active, imprimée à chaque exécution. Elle est lue depuis
    # `sentinelle.triggers`, donc ce qui s'affiche est ce qui s'applique —
    # pas une phrase recopiée qui pourrait mentir après une modification.
    print(f"  Vendre à découvert à J{ENTREE_J}, racheter à J{SORTIE_J}, "
          f"adossé à {REFERENCE}.")
    print(f"  Déblocages retenus : de {DEBLOCAGE_PART_MIN:.0%} à "
          f"{DEBLOCAGE_PART_MAX:.0%} de l'offre, un seul par "
          f"{DEBLOCAGE_DUREE_J} jours.\n")
    if not prises:
        print("  Aucun déblocage de plus de 2 % dans la fenêtre.\n")
        return 0
    import datetime as dt
    for x in sorted(prises, key=lambda v: v["entree_ms"]):
        d = dt.datetime.fromtimestamp(x["entree_ms"] / 1000, dt.UTC)
        f = dt.datetime.fromtimestamp(x["sortie_ms"] / 1000, dt.UTC)
        print(f"  {x['symbole']:<9} {x['part_offre']:>6.1%}   "
              f"entrée {d:%Y-%m-%d}   sortie {f:%Y-%m-%d}")
    print("  " + "-" * 74)
    print(f"  {len(prises)} position(s), dont {ajouts} nouvellement inscrite(s) "
          f"dans\n  {journal} (ajout seul).\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
