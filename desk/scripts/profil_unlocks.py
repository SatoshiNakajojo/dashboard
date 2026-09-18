#!/usr/bin/env python3
"""Le profil JOUR PAR JOUR autour d'un deblocage — et le test d'anteriorite.

Le test poole dit que le prix baisse entre J-7 et J-1. Il ne dit pas COMMENT :
une baisse progressive sur six jours et une chute d'un seul jour rendent la
meme moyenne. Or les deux ne veulent pas du tout dire la meme chose.

────────────────────────────────────────────────────────────────────────────
  CE QUE CE SCRIPT CHERCHE VRAIMENT : UN BIAIS D'ANTERIORITE
────────────────────────────────────────────────────────────────────────────

Le calendrier vient d'une source qui publie les dates A L'AVANCE — 653 des
2 074 evenements sont encore dans le futur, ce qui le prouve. Mais rien ne
garantit qu'une date PASSEE n'ait pas ete REVISEE depuis : un projet qui
repousse son deblocage laisse dans le calendrier d'aujourd'hui la date
corrigee, pas celle qu'on connaissait a l'epoque.

Si ces revisions suivaient le prix — reporter un deblocage quand le marche
est mauvais — alors « le prix baisse avant la date enregistree » serait en
partie une tautologie, et le backtest mesurerait une information que personne
n'avait.

**La signature des deux hypotheses differe, et c'est mesurable.**

Une ANTICIPATION reelle est etalee. Le marche connait la date depuis des
semaines ; les uns sortent dix jours avant, les autres trois. Le profil
montre une derive progressive sur plusieurs jours.

Un ARTEFACT DE REVISION est ponctuel. La date a ete recalee sur ce qui s'est
passe, donc l'ecart se concentre sur un ou deux jours et le reste du profil
est plat.

**Pourquoi jour par jour, et pas par decalage de la fenetre.** Le premier
reflexe est de decaler la fenetre J-7/J-1 de plus ou moins quelques jours et
de regarder l'effet decroitre. Ca ne prouve RIEN : la fenetre dure six jours,
donc un decalage de 1 en conserve cinq sixiemes. La decroissance serait douce
par construction, quelle que soit la realite. Des fenetres d'UN jour ne se
recouvrent pas, et leur profil est donc lisible.

    python scripts/profil_unlocks.py
"""

from __future__ import annotations

import argparse
import random
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RACINE / "src"))

from trading_desk.backtest.data import DataUnavailable, load_from_file  # noqa: E402

# La plage du profil, posee d'avance. Assez large avant pour voir une derive
# s'installer, assez apres pour voir si l'effet se poursuit ou se retourne.
JOUR_MIN, JOUR_MAX = -14, 7

# Les memes bornes de tranche que l'etude, reprises et non redefinies : deux
# jeux de bornes divergeraient, et l'ecart se lirait comme un desaccord entre
# deux mesures plutot que comme un bug.
TRANCHE_MIN = 0.005


def index_par_date(bars) -> dict[int, int]:
    return {int(b.ts_ms) // 86_400_000: i for i, b in enumerate(bars)}


def charger(unlocks: dict, dossier: Path) -> dict[str, list]:
    series = {}
    for symbole in unlocks:
        try:
            series[symbole] = load_from_file(
                str(dossier / f"{symbole}_1d_real.json"), symbole, "1d")
        except (DataUnavailable, FileNotFoundError, OSError):
            continue
    return series


def profil(unlocks: dict, series: dict[str, list], *, tirages: int,
           part_min: float = TRANCHE_MIN) -> list[dict]:
    """Le rendement signe d'UN jour, pour chaque decalage de la plage.

    Le signe est retourne comme dans l'etude : POSITIF veut dire que le prix
    a BAISSE, donc que l'hypothese baissiere est verifiee.
    """
    out = []
    for jour in range(JOUR_MIN, JOUR_MAX + 1):
        paires = []
        for symbole, evts in unlocks.items():
            bars = series.get(symbole)
            if not bars:
                continue
            par_jour = index_par_date(bars)
            for e in evts:
                if e.get("part_offre", 0.0) < part_min:
                    continue
                i = par_jour.get(e["ts_ms"] // 86_400_000 + jour)
                if i is not None and 0 <= i < len(bars) - 1:
                    paires.append((bars, i))
        if len(paires) < 100:
            out.append({"jour": jour, "n": len(paires), "observe": None,
                        "hasard": None, "p": None})
            continue

        def rend(bars, i):
            depart = float(bars[i].close)
            if depart <= 0:
                return None
            return -1 * (float(bars[i + 1].close) - depart) / depart * 10_000

        obs = [r for bars, i in paires if (r := rend(bars, i)) is not None]
        moyenne = sum(obs) / len(obs)

        # Le nul est tire dans l'historique DU MEME jeton, comme dans l'etude :
        # la derive propre a chaque jeton reste ainsi controlee.
        alea = random.Random(20260918)
        nuls = []
        for _ in range(tirages):
            tir = [r for bars, _ in paires
                   if (r := rend(bars, alea.randrange(0, len(bars) - 2))) is not None]
            if tir:
                nuls.append(sum(tir) / len(tir))
        p = (sum(1 for x in nuls if x >= moyenne) + 1) / (len(nuls) + 1)
        out.append({"jour": jour, "n": len(obs), "observe": moyenne,
                    "hasard": sum(nuls) / len(nuls), "p": p})
    return out


def main() -> int:
    import json

    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--unlocks", default="data/unlocks.json")
    p.add_argument("--tirages", type=int, default=500)
    p.add_argument("--donnees", default="data")
    args = p.parse_args()

    unlocks = json.loads((RACINE / args.unlocks).read_text())
    series = charger(unlocks, RACINE / args.donnees)
    lignes = profil(unlocks, series, tirages=args.tirages)

    print(f"\n  PROFIL JOUR PAR JOUR — {len(series)} jetons, "
          f"part de l'offre >= {TRANCHE_MIN:.1%}, {args.tirages} tirages")
    print("  (POSITIF = le prix a BAISSÉ ce jour-là. Fenêtres d'UN jour,")
    print("   donc sans recouvrement : le profil est lisible tel quel.)")
    print("  " + "=" * 68)
    print(f"  {'jour':>5} {'n':>6} {'observé':>10} {'hasard':>9} {'p':>8}   profil")
    print("  " + "-" * 68)
    for l in lignes:
        if l["observe"] is None:
            print(f"  {l['jour']:>+5} {l['n']:>6}   trop peu d'événements")
            continue
        ecart = l["observe"] - l["hasard"]
        barres = "█" * min(40, int(abs(ecart) / 4)) if ecart > 0 else ""
        etoile = " *" if l["p"] <= 0.05 else ""
        print(f"  {l['jour']:>+5} {l['n']:>6} {l['observe']:>+10.1f} "
              f"{l['hasard']:>+9.1f} {l['p']:>8.4f}   {barres}{etoile}")
    print("  " + "-" * 68)
    avant = [l for l in lignes if l["p"] is not None and -10 <= l["jour"] <= -1]
    sous = [l for l in avant if l["p"] <= 0.05]
    print(f"  Sur les dix jours qui précèdent : {len(sous)} jour(s) sous alpha "
          f"sur {len(avant)}, {0.05 * len(avant):.1f} attendu(s) par hasard.")
    print("  Étalé sur plusieurs jours -> anticipation. Concentré sur un seul")
    print("  -> date recalée après coup, donc information que personne n'avait.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
