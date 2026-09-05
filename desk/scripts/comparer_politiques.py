#!/usr/bin/env python3
"""Compare des politiques de modeles sur LES MEMES fenetres de marche.

Pourquoi un script separe plutot que trois passages de la commande P3 : la
question posee n'est pas « combien coute chaque politique » mais « combien
coute-t-elle POUR LA MEME QUALITE ». Deux passages independants tirent les
memes fenetres — `_windows` est deterministe — mais rien ne le garantirait
dans le temps, et surtout rien ne mettrait les deux mesures cote a cote.

Ce qui est mesure :

- **cout par cycle**, le seul chiffre qui decide de la cadence viable ;
- **taux de sorties valides par agent**, parce qu'une economie obtenue en
  degradant la qualite n'est pas une economie : un agent qui echoue son
  schema s'abstient, le cycle s'arrete en LECTURE, et le desk ne decide plus
  rien du tout — a un cout apparent tres bas ;
- **distribution des etapes d'arret**, qui dit si les politiques prennent les
  memes decisions ou seulement des decisions moins cheres.

Ce qui n'est PAS mesure, et qu'il faut dire : sur un echantillon de cette
taille, un taux de validite de 100 % ne distingue pas 99,9 % de 100 %. Ce
protocole detecte une degradation FRANCHE, pas une derive fine. La porte P3
et ses 30 cycles restent la mesure qui tranche.
"""

from __future__ import annotations

import argparse
import json
import sys
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from trading_desk.agents.budget import BudgetedLLM, BudgetExceeded
from trading_desk.agents.graph import run_desk_cycle
from trading_desk.agents.llm import AnthropicLLM, RoutedLLM
from trading_desk.agents.metrics import summarize
from trading_desk.agents.roster import POLITIQUES
from trading_desk.backtest.data import load_from_file

WINDOW_BARS = 300


def fenetres(bars, count):
    """Identique a `agents.__main__._windows` — meme decoupe, meme ordre."""
    span = len(bars) - WINDOW_BARS
    step = span / count
    return [bars[int(i * step):int(i * step) + WINDOW_BARS] for i in range(count)]


def client(nom_politique: str, *, effort: str, modele: str):
    if nom_politique == "uniforme":
        return AnthropicLLM(model=modele, effort=effort)
    return RoutedLLM(POLITIQUES[nom_politique], effort=effort)


def mesurer(nom, wins, *, plafond, effort, modele):
    llm = BudgetedLLM(client(nom, effort=effort, modele=modele),
                      max_usd=Decimal(str(plafond)))
    runs, etapes, interrompu = [], {}, ""
    for i, w in enumerate(wins, 1):
        try:
            # memory=None a dessein : une memoire partagee ferait dependre la
            # deuxieme politique mesuree de ce que la premiere a vu.
            res = run_desk_cycle(llm=llm, bars=w, memory=None)
        except BudgetExceeded as exc:
            interrompu = str(exc)
            break
        runs.extend(res.runs)
        etapes[res.stage.value] = etapes.get(res.stage.value, 0) + 1
        print(f"    {nom:<11} cycle {i}/{len(wins)} — {res.stage.value:<14} "
              f"{float(llm.spent_usd):.4f} $", flush=True)
    cycles = sum(etapes.values())
    par_agent = {}
    for agent in sorted({r.agent for r in runs}):
        m = summarize([r for r in runs if r.agent == agent])
        par_agent[agent] = {
            "appels": m.runs, "valides_pct": round(m.valid_rate_pct, 1),
            "abstentions_pct": round(m.abstention_rate_pct, 1),
            "cout_par_appel": float(m.cost_per_decision_usd),
            "in_par_appel": m.input_tokens // max(m.runs, 1),
            "out_par_appel": m.output_tokens // max(m.runs, 1),
            "p95_ms": m.latency_p95_ms, "modeles": list(m.models),
        }
    return {
        "politique": nom, "cycles": cycles,
        "cout_total": float(llm.spent_usd),
        "cout_par_cycle": float(llm.spent_usd / cycles) if cycles else 0.0,
        "appels_non_tarifes": llm.unpriced_calls,
        "etapes": etapes, "agents": par_agent, "interrompu": interrompu,
    }


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--file", required=True)
    p.add_argument("--asset", default="BTC")
    p.add_argument("--interval", default="1h")
    p.add_argument("--runs", type=int, default=10)
    p.add_argument("--effort", default="medium")
    p.add_argument("--modele", default="claude-opus-5")
    p.add_argument("--plafond-par-politique", type=float, default=2.0)
    p.add_argument("--politiques", nargs="+",
                   default=["uniforme", "economique", "diversifie"])
    p.add_argument("--sortie", default=None, help="JSON des resultats bruts")
    args = p.parse_args()

    bars = load_from_file(args.file, args.asset, args.interval)
    wins = fenetres(bars, args.runs)
    print(f"\n  {len(bars)} barres, {args.runs} fenetres de {WINDOW_BARS}, "
          f"IDENTIQUES pour chaque politique.")
    print(f"  Plafond {args.plafond_par_politique:.2f} $ par politique "
          f"({len(args.politiques) * args.plafond_par_politique:.2f} $ au pire).\n")

    resultats = [mesurer(n, wins, plafond=args.plafond_par_politique,
                         effort=args.effort, modele=args.modele)
                 for n in args.politiques]

    print("\n" + "=" * 72)
    print(f"  {'politique':<12} {'cycles':>6} {'$/cycle':>10} {'vs uniforme':>12}"
          f"  etapes")
    print("  " + "-" * 70)
    ref = resultats[0]["cout_par_cycle"] if resultats else 0.0
    for r in resultats:
        ecart = (f"{100 * (r['cout_par_cycle'] / ref - 1):+.0f} %"
                 if ref and r["politique"] != "uniforme" else "—")
        etapes = " ".join(f"{k}:{v}" for k, v in sorted(r["etapes"].items()))
        print(f"  {r['politique']:<12} {r['cycles']:>6} "
              f"{r['cout_par_cycle']:>10.4f} {ecart:>12}  {etapes}")

    print("\n  Qualite — un taux de sorties valides sous 98 % annule l'economie :")
    agents = sorted({a for r in resultats for a in r["agents"]})
    print(f"  {'agent':<18} " + " ".join(f"{r['politique']:>14}" for r in resultats))
    for a in agents:
        cells = []
        for r in resultats:
            d = r["agents"].get(a)
            cells.append(f"{d['valides_pct']:>7.1f}% {d['cout_par_appel']:>6.4f}"
                         if d else f"{'—':>14}")
        print(f"  {a:<18} " + " ".join(cells))

    non_tarifes = sum(r["appels_non_tarifes"] for r in resultats)
    if non_tarifes:
        print(f"\n  ATTENTION — {non_tarifes} appels hors grille tarifaire : "
              "les couts ci-dessus sont sous-estimes.")

    if args.sortie:
        Path(args.sortie).write_text(json.dumps(resultats, indent=2,
                                                ensure_ascii=False))
        print(f"\n  Resultats bruts : {args.sortie}")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
