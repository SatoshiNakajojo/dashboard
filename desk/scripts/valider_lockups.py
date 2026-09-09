#!/usr/bin/env python3
"""La réplication : l'effet d'anticipation existe-t-il sur actions ?

    python3 scripts/valider_lockups.py --tirages 2000

Les règles viennent de `docs/preenregistrement-lockup-actions.md` et de ses
deux amendements, tous écrits AVANT ce fichier. Ce script les applique ; il
n'en choisit aucune.

## Ce qui est testé

    Le prix baisse entre J-7 et J-1 avant l'expiration du lockup.

Transposition littérale du résultat crypto : même fenêtre, même sens, même
correction. Rien n'est ré-exploré.

## Pourquoi le décalage calendaire est LE test, ici

Les introductions ont une dérive post-introduction bien documentée. Le nul
par événement tire ses dates dans l'historique du **même titre** — il
compare donc la fenêtre du 180ᵉ jour à des dates majoritairement
postérieures, et une dérive systématique des premiers mois suffirait à
produire l'effet.

Le décalage calendaire n'a pas ce défaut : il décale tous les événements du
même nombre de jours, donc compare « le 180ᵉ jour » à « le 180ᵉ + d jour »
dans la vie de chaque société.

**Si le test poolé ressort et que le décalage ne suit pas, la conclusion est
« dérive post-introduction », pas « effet de lockup ».** C'est écrit ici
avant d'avoir vu un seul chiffre.
"""

from __future__ import annotations

import argparse
import json
import random
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from trading_desk.backtest.data import DataUnavailable, load_from_file
from trading_desk.sentinelle.validation import benjamini_hochberg

JOUR_MS = 86_400_000
ENTREE_J, SORTIE_J = -7, -1        # calendaire — amendement n° 2
MIN_DECALAGE = 14                  # au-delà du chevauchement de fenêtre


def _index(bars) -> dict[int, int]:
    return {b.ts_ms // JOUR_MS: i for i, b in enumerate(bars)}


def _seance_avant(par_jour: dict[int, int], jour: int, recul: int = 6):
    """La dernière séance à ou avant `jour`.

    Le marché ferme le week-end et les jours fériés ; une date calendaire ne
    correspond donc pas toujours à une bougie. Reculer jusqu'à six jours
    couvre un week-end prolongé. Au-delà, l'événement est écarté plutôt que
    rattaché à une séance lointaine — un décalage d'une semaine sur un
    événement daté détruit ce qu'on mesure.
    """
    for k in range(recul + 1):
        i = par_jour.get(jour - k)
        if i is not None:
            return i
    return None


def charger(lockups: list[dict], dossier: str) -> list[dict]:
    """Un rendement par société, sur la fenêtre pré-enregistrée."""
    out = []
    for e in lockups:
        t = e["ticker"]
        try:
            bars = load_from_file(f"{dossier}/{t}_1d_real.json", t, "1d",
                                  max_gap_ratio=1.0)
        except (DataUnavailable, FileNotFoundError, Exception):
            continue
        par_jour = _index(bars)
        fin = e["expiration_ms"] // JOUR_MS
        i0 = _seance_avant(par_jour, fin + ENTREE_J)
        i1 = _seance_avant(par_jour, fin + SORTIE_J)
        if i0 is None or i1 is None or i1 <= i0:
            continue
        depart = float(bars[i0].close)
        if depart <= 0:
            continue
        out.append({
            "ticker": t, "bars": bars, "i0": i0, "duree": i1 - i0,
            "jour_entree": bars[i0].ts_ms // JOUR_MS,
            # `sens = -1` : POSITIF = le prix a baissé = le short gagne.
            "brut": -1 * (float(bars[i1].close) - depart) / depart * 10_000,
        })
    return out


def _rendement(bars, i: int, duree: int) -> float | None:
    if i < 0 or i + duree >= len(bars):
        return None
    depart = float(bars[i].close)
    if depart <= 0:
        return None
    return -1 * (float(bars[i + duree].close) - depart) / depart * 10_000


def poolage(evts: list[dict], tirages: int, alea: random.Random) -> tuple:
    """Le test principal. Nul par événement, dates tirées dans le MÊME titre.

    Ce nul contrôle la dérive propre à la société, mais **pas** la dérive
    post-introduction commune à toutes — d'où le décalage calendaire.
    """
    obs = [e["brut"] for e in evts]
    moyenne = statistics.mean(obs)
    nuls = []
    for _ in range(tirages):
        tir = []
        for e in evts:
            n = len(e["bars"]) - e["duree"] - 1
            if n <= 1:
                continue
            r = _rendement(e["bars"], alea.randrange(n), e["duree"])
            if r is not None:
                tir.append(r)
        if tir:
            nuls.append(statistics.mean(tir))
    p = (sum(1 for x in nuls if x >= moyenne) + 1) / (len(nuls) + 1)
    return len(obs), moyenne, statistics.mean(nuls), p


def decalage_calendaire(evts: list[dict], amplitude: int = 365) -> tuple:
    """LE test de cette réplication.

    Un seul décalage, appliqué à tous les événements en bloc. Il compare
    « le 180ᵉ jour » à « le 180ᵉ + d jour » dans la vie de chaque société,
    donc il ne peut pas être produit par une dérive post-introduction.

    Le nul est un ensemble CLOS — il n'existe que `2 × (amplitude − 13)`
    alignements. Ils sont tous énumérés : p exact, sans graine, mais avec un
    plancher à `1 / (n + 1)` qui est affiché.
    """
    obs = statistics.mean(e["brut"] for e in evts)
    decalages = [d for d in range(-amplitude, amplitude + 1)
                 if abs(d) >= MIN_DECALAGE]
    par_jour = {e["ticker"]: _index(e["bars"]) for e in evts}
    nuls = []
    for d in decalages:
        tir = []
        for e in evts:
            i = par_jour[e["ticker"]].get(e["jour_entree"] + d)
            if i is not None:
                r = _rendement(e["bars"], i, e["duree"])
                if r is not None:
                    tir.append(r)
        if len(tir) >= len(evts) * 0.5:
            nuls.append(statistics.mean(tir))
    if not nuls:
        return obs, None, None, len(decalages)
    p = (sum(1 for x in nuls if x >= obs) + 1) / (len(nuls) + 1)
    return obs, statistics.mean(nuls), p, len(nuls)


def neutraliser(evts: list[dict], reference: str, dossier: str) -> int:
    """Rendement du titre MOINS celui de la référence, même fenêtre.

    Convention identique à la campagne crypto : `-1 * (titre − référence)`.
    """
    try:
        marche = load_from_file(f"{dossier}/{reference}_1d_real.json",
                                reference, "1d", max_gap_ratio=1.0)
    except Exception:
        return 0
    par_jour = _index(marche)
    faits = 0
    for e in evts:
        j0 = e["jour_entree"]
        i0 = _seance_avant(par_jour, j0)
        if i0 is None:
            e["net"] = None
            continue
        r = _rendement(marche, i0, e["duree"])
        e["net"] = None if r is None else e["brut"] - r
        faits += e["net"] is not None
    return faits


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--lockups", default="data/lockups.json")
    p.add_argument("--dossier", default="data/actions")
    p.add_argument("--reference", default="SPY")
    p.add_argument("--tirages", type=int, default=2000)
    p.add_argument("--alpha", type=float, default=0.05)
    args = p.parse_args()

    chemin = Path(args.lockups)
    if not chemin.exists():
        print(f"\n  {chemin} introuvable.\n", file=sys.stderr)
        return 2
    evts = charger(json.loads(chemin.read_text()), args.dossier)

    print(f"\n  RÉPLICATION ACTIONS — expiration de lockup, fenêtre J{ENTREE_J} "
          f"→ J{SORTIE_J}")
    print("  " + "=" * 74)
    print(f"  {len(evts)} sociétés mesurées.")
    if len(evts) < 100:
        print("\n  MOINS DE 100 ÉVÉNEMENTS — le pré-enregistrement interdit")
        print("  de conclure sous ce seuil. Rien ne sera conclu.\n")
    durees = [e["duree"] for e in evts]
    print(f"  Détention : {statistics.median(durees):.0f} séances en médiane "
          f"(amendement n° 2).")
    print("  (POSITIF = le prix a BAISSÉ : l'hypothèse baissière est "
          "vérifiée.)\n")
    if not evts:
        return 1

    alea = random.Random(20260909)
    resultats = []

    n, moy, nul, pv = poolage(evts, args.tirages, alea)
    resultats.append(("test poolé — brut", n, moy, nul, pv))

    couverts = neutraliser(evts, args.reference, args.dossier)
    nets = [e for e in evts if e.get("net") is not None]
    if couverts and nets:
        sauve = [dict(e, brut=e["net"]) for e in nets]
        n2, moy2, nul2, pv2 = poolage(sauve, args.tirages, alea)
        resultats.append((f"net de {args.reference}", n2, moy2, nul2, pv2))

    print(f"  {'test':<26} {'n':>5} {'observé':>10} {'hasard':>9} {'p':>9}  BH")
    print("  " + "-" * 74)
    garde = benjamini_hochberg([r[4] for r in resultats], args.alpha)
    for (nom, n, moy, nul, pv), g in zip(resultats, garde, strict=True):
        print(f"  {nom:<26} {n:>5} {moy:>+9.1f} {nul:>+9.1f} {pv:>9.4f}  "
              f"{'OUI' if g else '—'}")
    print("  " + "-" * 74)

    print("\n  DÉCALAGE CALENDAIRE — le test décisif de cette réplication")
    print("  " + "-" * 74)
    print("  (Il compare « le 180ᵉ jour » à « le 180ᵉ + d jour » dans la vie")
    print("   de chaque société : une dérive post-introduction ne peut pas le")
    print("   produire.)\n")
    for nom, jeu in (("brut", evts), (f"net de {args.reference}",
                                      [dict(e, brut=e["net"]) for e in nets])):
        if not jeu:
            continue
        obs, nul, pv, n_al = decalage_calendaire(jeu)
        if pv is None:
            print(f"  {nom:<20} aucun alignement exploitable")
            continue
        print(f"  {nom:<20} observé {obs:>+8.1f}   hasard {nul:>+8.1f}   "
              f"p {pv:>7.4f}   ({n_al} alignements, plancher "
              f"{1/(n_al+1):.4f})")
    print("  " + "-" * 74)
    print("\n  Verdict selon le pré-enregistrement : confirmation seulement si")
    print("  le poolé ressort après BH ET que le décalage calendaire suit.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
