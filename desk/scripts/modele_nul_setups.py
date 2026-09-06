#!/usr/bin/env python3
"""Les setups du desk battent-ils des entrées au hasard ?

C'est la barre à laquelle **toutes** les baselines de ce dépôt ont été
soumises, et à laquelle la couche LLM ne l'avait jamais été. Le registre
fantôme dit ce que les setups sont devenus ; il ne dit pas si un tirage au
sort aurait fait aussi bien.

Le contrefactuel garde de chaque setup tout ce qui n'est PAS le choix du
moment d'entrer :

- son sens (long / short) ;
- sa distance de stop, en fraction du prix d'entrée ;
- sa distance de cible, idem ;
- son horizon.

Et il tire une date d'entrée au hasard dans la même série. La seule chose
qu'on retire à l'agent est ce qu'on prétend mesurer : **savoir QUAND**.

La résolution passe par le même `ShadowBook` que la mesure observée. Utiliser
une convention différente pour le bras aléatoire fabriquerait un écart qui ne
dirait rien du desk — c'est la faute la plus facile à commettre ici, et la
plus difficile à voir après coup.

    python scripts/modele_nul_setups.py --json baselines/qualite_diversifie.json \\
        --file data/BTC_1h_real.json --tirages 2000
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from trading_desk.agents.shadow_book import ShadowBook, ShadowEntry
from trading_desk.backtest.data import load_from_file
from trading_desk.contracts.common import Side

BARRES_PAR_HEURE = {"1h": 1, "4h": 0.25, "1d": 1 / 24}


def formes(entrees: list[dict]) -> list[dict]:
    """Ce qu'on garde de chaque setup : tout sauf sa date."""
    out = []
    for e in entrees:
        if not e["resolved"] or e["pnl_r"] is None:
            continue
        entree = Decimal(e["entry_price"])
        if entree <= 0:
            continue
        out.append({
            "side": Side(e["side"]),
            "stop_frac": (Decimal(e["stop_price"]) - entree) / entree,
            "cible_frac": ((Decimal(e["target_price"]) - entree) / entree
                           if e.get("target_price") else None),
            "horizon_h": float(e.get("horizon_hours") or 0),
        })
    return out


def rejouer(forme: dict, bars, debut: int, horizon: int) -> Decimal | None:
    """Rejoue une forme à partir d'une barre donnée, via le registre réel."""
    entree = bars[debut].close
    stop = entree * (1 + forme["stop_frac"])
    cible = entree * (1 + forme["cible_frac"]) if forme["cible_frac"] is not None else None
    if stop <= 0 or (cible is not None and cible <= 0):
        return None

    book = ShadowBook()
    book.entries.append(ShadowEntry(
        ts_ms=bars[debut].ts_ms, stage="VETO", reason="nul", asset=bars[0].asset,
        side=forme["side"], entry_price=entree, stop_price=stop,
        target_price=cible))
    suite = bars[debut + 1:debut + 1 + horizon]
    if not suite:
        return None
    for b in suite:
        if book.resolve(bars[0].asset, high=b.high, low=b.low):
            return book.entries[0].pnl_r
    book.cloturer(bars[0].asset, suite[-1].close)
    return book.entries[0].pnl_r


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--json", required=True, help="sortie de qualite_decision.py")
    p.add_argument("--file", required=True)
    p.add_argument("--asset", default="BTC")
    p.add_argument("--interval", default="1h")
    p.add_argument("--tirages", type=int, default=2000)
    p.add_argument("--horizons-h", type=float, nargs="+", default=[24.0, 48.0, 72.0],
                   help="horizons a balayer quand le registre ne l'a pas "
                        "enregistre. Balayer plutot que choisir : si le "
                        "verdict change d'un horizon a l'autre, il porte sur "
                        "l'horizon et non sur le desk.")
    p.add_argument("--graine", type=int, default=20260906)
    args = p.parse_args()

    donnees = json.loads(Path(args.json).read_text())
    bars = load_from_file(args.file, args.asset, args.interval)

    for nom, d in donnees.items():
        fs = formes(d["entrees"])
        observes = [Decimal(e["pnl_r"]) for e in d["entrees"]
                    if e["resolved"] and e["pnl_r"] is not None]
        if not fs:
            print(f"\n  {nom} : aucun setup resolu.\n")
            continue
        obs = sum(observes, Decimal("0")) / len(observes)

        connus = [f["horizon_h"] for f in fs if f["horizon_h"] > 0]
        if connus:
            horizons = [sum(connus) / len(connus)]
            note = f"horizon moyen enregistre : {horizons[0]:.0f} h"
        else:
            horizons = args.horizons_h
            note = ("horizon NON enregistre par cette campagne — balayage "
                    f"sur {', '.join(f'{h:.0f} h' for h in horizons)}")

        print(f"\n  === {nom} — {len(fs)} setups, observe {float(obs):+.3f} R ===")
        print(f"  {note}")
        print(f"  {'horizon':>9} {'moyenne nulle':>15} {'p (unilateral)':>16} "
              f"{'IC 90 % du nul':>24}")
        print("  " + "-" * 68)

        for h in horizons:
            n_barres = max(1, int(h * BARRES_PAR_HEURE[args.interval]))
            alea = random.Random(args.graine)
            marge = n_barres + 2
            tirages = []
            for _ in range(args.tirages):
                total, comptes = Decimal("0"), 0
                for f in fs:
                    for _essai in range(5):
                        i = alea.randrange(0, len(bars) - marge)
                        r = rejouer(f, bars, i, n_barres)
                        if r is not None:
                            total += r
                            comptes += 1
                            break
                if comptes:
                    tirages.append(total / comptes)
            if not tirages:
                print(f"  {h:>7.0f} h   aucun tirage exploitable")
                continue
            tirages.sort()
            pire = sum(1 for t in tirages if t >= obs)
            pval = (pire + 1) / (len(tirages) + 1)
            lo = tirages[int(0.05 * len(tirages))]
            hi = tirages[int(0.95 * len(tirages))]
            print(f"  {h:>7.0f} h {float(sum(tirages)/len(tirages)):>15.3f} "
                  f"{pval:>16.3f}   [{float(lo):+.3f} ; {float(hi):+.3f}]")

        print("\n  p = part des tirages au hasard qui font AUSSI BIEN ou mieux.")
        print("  Au-dessus de 0,05, le desk ne se distingue pas d'un tirage.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
