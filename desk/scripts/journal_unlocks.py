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

JOUR_MS = 86_400_000

# La règle, figée. Toute modification incrémente la VERSION, et les entrées
# des versions antérieures restent jugées sur la leur — sinon « ajuster
# légèrement le seuil » transformerait un échec passé en succès.
VERSION = 1
ENTREE_J, SORTIE_J = -7, -1
TRANCHE_MIN, TRANCHE_MAX = 0.02, 1e9      # 2 % et plus : les deux tranches qui survivent
REFERENCE = "BTC"


def a_prendre(unlocks: dict, maintenant_ms: int, horizon_j: int) -> list[dict]:
    """Les déblocages dont la fenêtre d'entrée s'ouvre dans les jours à venir.

    On ne retient QUE les événements encore à venir. Un déblocage dont
    l'entrée est déjà passée serait une prédiction faite après coup, ce qui
    est exactement ce que ce journal existe pour rendre impossible.
    """
    out = []
    for symbole, bruts in sorted(unlocks.items()):
        for e in bruts:
            if not TRANCHE_MIN <= e["part_offre"] < TRANCHE_MAX:
                continue
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
    args = p.parse_args()

    journal = Path(args.journal)
    if args.resoudre:
        resoudre(journal)
        return 0

    chemin = Path(args.unlocks)
    if not chemin.exists():
        print(f"\n  {chemin} introuvable. Lancez d'abord "
              "`python3 scripts/fetch_unlocks.py`.\n", file=sys.stderr)
        return 2
    unlocks = json.loads(chemin.read_text())
    maintenant = int(time.time() * 1000)
    prises = a_prendre(unlocks, maintenant, args.horizon)
    ajouts = inscrire(prises, journal)

    print(f"\n  POSITIONS À VENIR — règle v{VERSION}, "
          f"{args.horizon} prochains jours")
    print("  " + "=" * 74)
    print(f"  Vendre à découvert à J-7, racheter à J-1, adossé à "
          f"{REFERENCE}.\n")
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
