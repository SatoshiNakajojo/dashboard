#!/usr/bin/env python3
"""Le journal hors échantillon des règles de prix figées.

    python3 scripts/journal_regles.py              # inscrire les signaux du jour
    python3 scripts/journal_regles.py --resoudre   # relever ce qui est clos

**Le même dispositif que pour les déblocages, et pour la même raison.** Les
règles de `regles_figees.py` ont été choisies en connaissant les données :
leurs paramètres sortent d'un balayage sur l'historique. Aucun contrôle
statistique ne répare ça. Une seule chose le peut — prédire avant de savoir.

**Ce que ce script écrit, et quand.** À la clôture de la barre N, il demande
à chaque règle figée ce qu'elle veut faire à la barre N+1, et l'inscrit. Le
prix d'entrée n'est donc PAS connu au moment de l'inscription : on écrit la
décision, pas son résultat. C'est ce décalage d'une barre qui rend la
prédiction vérifiable, et c'est exactement ce que fait le moteur de backtest
— une décision prise à la clôture s'exécute à l'ouverture suivante.

**Le fichier est en AJOUT SEUL.** Un signal inscrit compte, gagnant ou
perdant. La règle et sa version sont recopiées dans chaque ligne : si les
paramètres changent un jour, les anciennes prédictions restent jugées sur
l'ancienne règle, et le journal distingue les deux régimes au lieu de les
mélanger.

**Ce script ne trade pas.** Il écrit un fichier. C'est `PiloteRegles` qui le
lit, et c'est le pupitre qui décide si le risque autorise l'entrée.
"""

from __future__ import annotations

import argparse
import json
import statistics as st
import sys
import time
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from trading_desk.backtest.data import (
    DataUnavailable,
    fetch_hyperliquid,
    load_from_file,
)
from trading_desk.backtest.engine import run_backtest
from trading_desk.backtest.strategies import BASELINES
from trading_desk.risk.limits import RiskLimits
from trading_desk.sentinelle.regles_figees import (
    DENOMINATEUR,
    FIGE_LE,
    REGLES,
    VERSION,
    empreinte_du_registre,
)

JOURNAL = "data/journal_regles.jsonl"
INTERVAL_MS = {"1d": 86_400_000, "4h": 14_400_000, "1h": 3_600_000}

# Assez de barres pour que les indicateurs les plus longs soient chauds. Le
# moteur de backtest exige `warmup + 2` ; on prend large, un indicateur tiede
# rend un signal qui n'est pas celui de la regle.
BARRES_MIN = 400


def decision(regle, bars) -> dict | None:
    """Ce que la règle veut faire à la barre SUIVANTE, vu de la dernière clôture.

    **On appelle LE MOTEUR DE BACKTEST**, et on lit la décision qu'il avait en
    attente à la dernière clôture. C'est la garantie qui compte : le journal
    hors échantillon mesure exactement la règle qui a été backtestée, parce
    que c'est le même chemin de code.

    Une première version re-simulait l'état de position de son côté. Elle
    dérivait : 10 ouvertures manquées sur 56 pour `turtle_breakout`, parce
    qu'elle ignorait les sorties au STOP et se croyait encore en position. Un
    journal qui mesure une autre règle que celle qu'on a validée ne mesure
    rien, et rien ne l'aurait signalé.
    """
    o = run_backtest(bars, BASELINES[regle.strategie](**regle.parametres),
                     limits=RiskLimits(), interval=regle.intervalle,
                     initial_equity_usd=Decimal("1000"))
    if o.decision_suivante is None:
        return None
    sens, stop, cible = o.decision_suivante
    return {"sens": sens,
            "stop_strategie": str(stop) if stop is not None else None,
            "cible": str(cible) if cible is not None else None,
            "note": f"{regle.strategie} {regle.actif} {regle.intervalle}"}


def charger_barres(regle, hors_ligne: bool) -> list:
    chemin = Path(f"data/{regle.actif}_{regle.intervalle}_real.json")
    if hors_ligne or not _reseau():
        if not chemin.exists():
            raise DataUnavailable(f"{chemin} absent et réseau indisponible")
        return load_from_file(str(chemin), regle.actif, regle.intervalle)
    return fetch_hyperliquid(regle.actif, regle.intervalle, days=500,
                             cache_dir=".cache")


def _reseau() -> bool:
    import urllib.error
    import urllib.request
    try:
        req = urllib.request.Request(
            "https://api.hyperliquid.xyz/info",
            data=json.dumps({"type": "meta"}).encode(),
            headers={"Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=10).read(1)
        return True
    except (urllib.error.URLError, TimeoutError, OSError):
        return False


def lire(journal: Path) -> list[dict]:
    if not journal.exists():
        return []
    out = []
    for ligne in journal.read_text(encoding="utf-8").splitlines():
        ligne = ligne.strip()
        if not ligne:
            continue
        try:
            out.append(json.loads(ligne))
        except ValueError:
            continue
    return out


def inscrire(nouvelles: list[dict], journal: Path) -> int:
    """Ajoute ce qui manque. **Jamais de réécriture.**

    La clé d'unicité est (version, règle, barre décidée) : relancer le script
    deux fois le même jour ne duplique rien, et n'efface rien non plus.
    """
    connues = {(x["version"], x["regle"], x["barre_ms"]) for x in lire(journal)}
    ajouts = [n for n in nouvelles
              if (n["version"], n["regle"], n["barre_ms"]) not in connues]
    journal.parent.mkdir(parents=True, exist_ok=True)
    with journal.open("a", encoding="utf-8") as f:
        for n in ajouts:
            f.write(json.dumps(n, ensure_ascii=False) + "\n")
    return len(ajouts)


def resoudre(journal: Path) -> int:
    """Le relevé. Il ne conclut rien, il compte — et rappelle ce qu'il faut."""
    entrees = lire(journal)
    if not entrees:
        print("\n  Journal vide. Rien à relever.\n")
        return 0

    maintenant = int(time.time() * 1000)
    par_regle: dict[str, list[dict]] = {}
    for e in entrees:
        par_regle.setdefault(e["regle"], []).append(e)

    print(f"\n  JOURNAL DES RÈGLES FIGÉES — version {VERSION}, figé le {FIGE_LE}")
    print(f"  empreinte du registre {empreinte_du_registre()} · "
          f"dénominateur déclaré {DENOMINATEUR}")
    print("  " + "=" * 74)

    total = 0
    for cle, lot in sorted(par_regle.items()):
        lot.sort(key=lambda x: x["barre_ms"])
        resolus = [x for x in lot if x.get("sortie_close") is not None]
        rendements = [float(x["rendement"]) for x in resolus if x.get("rendement")]
        total += len(lot)
        print(f"\n  {cle}   {len(lot)} signal(aux) inscrit(s), "
              f"{len(resolus)} relevé(s)")
        if rendements:
            moy = st.mean(rendements) * 10_000
            print(f"    moyenne {moy:>+8.1f} bps · "
                  f"{sum(1 for r in rendements if r > 0)}/{len(rendements)} gagnants")
        recents = [x for x in lot if x["barre_ms"] > maintenant - 30 * 86_400_000]
        print(f"    {len(recents)} sur les trente derniers jours")

    print("\n  " + "=" * 74)
    print(f"  {total} signal(aux) au total.")
    print("  Ce relevé ne conclut rien et ne le fera pas avant longtemps :")
    print("  `tsmom_btc_1d` demande environ trois ans pour rendre un p")
    print("  exploitable, les deux `turtle` bien davantage. Ce qui est")
    print("  utilisable tout de suite est ailleurs — l'écart entre le prix")
    print("  décidé et le prix obtenu, et le fait que la règle s'exécute")
    print("  comme elle a été simulée.\n")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--journal", default=JOURNAL)
    p.add_argument("--resoudre", action="store_true")
    p.add_argument("--hors-ligne", action="store_true",
                   help="travailler sur les fichiers du dépôt plutôt que "
                        "l'API. Pour les tests et les machines sans réseau.")
    args = p.parse_args()

    journal = Path(args.journal)
    if args.resoudre:
        return resoudre(journal)

    maintenant = int(time.time() * 1000)
    nouvelles = []
    print(f"\n  RÈGLES FIGÉES — version {VERSION}, "
          f"empreinte {empreinte_du_registre()}\n")
    for regle in REGLES:
        try:
            bars = charger_barres(regle, args.hors_ligne)
        except (DataUnavailable, FileNotFoundError) as exc:
            print(f"  {regle.cle:<16} données indisponibles : {str(exc)[:44]}")
            continue
        if len(bars) < BARRES_MIN:
            print(f"  {regle.cle:<16} {len(bars)} barres, il en faut {BARRES_MIN}")
            continue

        d = decision(regle, bars)
        derniere = bars[-1]
        if d is None:
            print(f"  {regle.cle:<16} aucun signal à la clôture du "
                  f"{derniere.ts_ms // 86_400_000}")
            continue

        entree_ms = derniere.ts_ms + INTERVAL_MS[regle.intervalle]
        nouvelles.append({
            "inscrit_ms": maintenant,
            "version": VERSION,
            "regle": regle.cle,
            "empreinte": regle.empreinte(),
            # La regle est RECOPIEE : si elle change, les anciennes lignes
            # restent jugees sur l'ancienne.
            "strategie": regle.strategie,
            "actif": regle.actif,
            "intervalle": regle.intervalle,
            "parametres": regle.parametres,
            "stop_pct": regle.stop_pct,
            "barre_ms": derniere.ts_ms,
            "entree_ms": entree_ms,
            "sens": d["sens"],
            "reference_close": str(derniere.close),
            "note": d["note"],
            # Rempli par --resoudre, jamais a l'inscription.
            "sortie_close": None,
            "rendement": None,
        })
        print(f"  {regle.cle:<16} {d['sens']:<6} décidé à la clôture, "
              f"à exécuter à l'ouverture suivante — {d['note'][:40]}")

    n = inscrire(nouvelles, journal)
    print(f"\n  {n} signal(aux) inscrit(s) dans {journal}.")
    print(f"  Le dénominateur déclaré reste {DENOMINATEUR}, et il le restera.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
