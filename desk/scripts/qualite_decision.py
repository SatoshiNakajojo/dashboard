#!/usr/bin/env python3
"""La couche de délibération trie-t-elle, ou refuse-t-elle au hasard ?

C'est la question que la porte P3 ne pose pas. Elle mesure la conformité au
schéma — « le modèle a-t-il rendu un objet valide » — et 100 % de sorties
valides est parfaitement compatible avec un desk qui décide n'importe quoi.

Le mode fantôme tourne sur des fenêtres d'historique. **Les barres qui suivent
chaque fenêtre existent déjà.** Chaque setup formulé peut donc être confronté
à ce que le marché a réellement fait ensuite, émis comme rejeté, avec la même
convention. La qualité de décision cesse d'être une opinion.

Le chiffre qui juge est l'écart :

    DISCRIMINATION = espérance(mandats émis) − espérance(setups rejetés)

Positif, le desk garde les meilleurs setups. Nul, il refuse au hasard — et
toute la dépense en délibération ne produit qu'un filtre aléatoire, qu'un
tirage à pile ou face obtiendrait gratuitement. Négatif, il garde
systématiquement les mauvais.

**Une espérance négative sur les seuls rejets ne répond pas à la question.**
Elle est compatible avec un desk qui refuse au hasard dans un univers de
setups globalement perdants — et le P2 a montré que c'est exactement
l'univers dans lequel on est.

Deux biais connus, laissés visibles plutôt que corrigés en silence :

- **la perte au stop est comptée −1 R**, alors que le Monte-Carlo a mesuré
  −1,27 R en réel (gaps, frais, slippage). Les deux populations subissent la
  même convention, donc l'ÉCART reste juste ; ce sont les deux espérances
  prises isolément qui sont optimistes.
- **l'échantillon**. Un cycle sur deux environ ne formule aucun setup. Trente
  setups résolus, le minimum en dessous duquel le registre refuse de conclure,
  demandent donc une soixantaine de cycles par politique.

    python scripts/qualite_decision.py --file data/BTC_1h_real.json --runs 30
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
from trading_desk.agents.roster import POLITIQUES
from trading_desk.agents.shadow_book import ShadowBook
from trading_desk.backtest.data import load_from_file

WINDOW_BARS = 300
BARRES_PAR_HEURE = {"1h": 1, "4h": 0.25, "1d": 1 / 24}


def client(nom: str, *, effort: str, modele: str):
    if nom == "uniforme":
        return AnthropicLLM(model=modele, effort=effort)
    return RoutedLLM(POLITIQUES[nom], effort=effort)


def suivre(book: ShadowBook, entree, suite, asset: str, barres_horizon: int) -> None:
    """Confronte un setup aux barres qui ont suivi sa fenêtre.

    Barre par barre et dans l'ordre, jamais en agrégeant l'extrême de la
    période : un stop touché à la barre 3 doit clore le suivi, même si la
    cible est atteinte à la barre 40. Agréger inverserait le résultat.
    """
    for bar in suite[:barres_horizon]:
        if book.resolve(asset, high=bar.high, low=bar.low):
            return
    if suite:
        # Ni cible ni stop dans l'horizon : sortie au marché à son terme,
        # ce qu'un opérateur fait d'une thèse qui a expiré sans se réaliser.
        book.cloturer(asset, suite[min(barres_horizon, len(suite)) - 1].close)


def mesurer(nom, bars, debuts, *, plafond, effort, modele, interval):
    llm = BudgetedLLM(client(nom, effort=effort, modele=modele),
                      max_usd=Decimal(str(plafond)))
    book = ShadowBook()
    interrompu = ""
    for i, debut in enumerate(debuts, 1):
        fenetre = bars[debut:debut + WINDOW_BARS]
        try:
            res = run_desk_cycle(llm=llm, bars=fenetre, memory=None)
        except BudgetExceeded as exc:
            interrompu = str(exc)
            break
        entree = book.record(res)
        if entree is not None:
            heures = float(res.setup.horizon_hours) if res.setup else 24.0
            n = max(1, int(heures * BARRES_PAR_HEURE[interval]))
            suivre(book, entree, bars[debut + WINDOW_BARS:], entree.asset, n)
        marque = "—"
        if entree is not None:
            etat = entree.outcome or "ouvert"
            marque = f"{'ÉMIS  ' if entree.issued else 'rejeté'} {etat:>8}"
        print(f"    {nom:<11} {i}/{len(debuts)} {res.stage.value:<14} "
              f"{marque}  {float(llm.spent_usd):.4f} $", flush=True)
    return book, llm, interrompu


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--file", required=True)
    p.add_argument("--asset", default="BTC")
    p.add_argument("--interval", default="1h")
    p.add_argument("--runs", type=int, default=30)
    p.add_argument("--effort", default="medium")
    p.add_argument("--modele", default="claude-opus-5")
    p.add_argument("--plafond-par-politique", type=float, default=2.0)
    p.add_argument("--politiques", nargs="+", default=["diversifie"])
    p.add_argument("--minimum", type=int, default=30,
                   help="setups résolus exigés avant de conclure. L'abaisser "
                        "ne rend pas la mesure concluante — ça la rend "
                        "bruyante en silence.")
    p.add_argument("--sortie", default=None)
    args = p.parse_args()

    bars = load_from_file(args.file, args.asset, args.interval)

    # Les fenêtres s'arrêtent assez tôt pour qu'un horizon complet de barres
    # existe APRÈS chacune. Sans cette marge, les dernières fenêtres seraient
    # notées sur une suite tronquée — et paraîtraient systématiquement
    # neutres.
    marge = 720
    span = len(bars) - WINDOW_BARS - marge
    if span <= 0:
        print(f"\n  {len(bars)} barres : il en faut plus de "
              f"{WINDOW_BARS + marge} pour laisser un horizon après chaque "
              f"fenêtre.\n", file=sys.stderr)
        return 2
    pas = span / args.runs
    debuts = [int(i * pas) for i in range(args.runs)]

    print(f"\n  {len(bars)} barres, {args.runs} fenêtres de {WINDOW_BARS}, "
          f"{marge} barres de marge pour l'horizon.")
    print(f"  Plafond {args.plafond_par_politique:.2f} $ par politique.\n")

    tout = {}
    for nom in args.politiques:
        book, llm, interrompu = mesurer(
            nom, bars, debuts, plafond=args.plafond_par_politique,
            effort=args.effort, modele=args.modele, interval=args.interval)
        print(book.format_report())
        if interrompu:
            print(f"  INTERROMPU : {interrompu}\n")
        tout[nom] = {
            "cout_total": float(llm.spent_usd),
            "cycles": len(book.stages),
            "emis": len(book.emis), "rejetes": len(book.rejetes),
            "esperance_emis": _f(book.issued_expectancy_r(minimum=args.minimum)),
            "esperance_rejets": _f(book.rejected_expectancy_r(minimum=args.minimum)),
            "discrimination": _f(book.discrimination_r(minimum=args.minimum)),
            "entrees": [e.model_dump(mode="json") for e in book.entries],
            "etapes": {s.value: book.stages.count(s) for s in set(book.stages)},
            "interrompu": interrompu,
        }

    if args.sortie:
        Path(args.sortie).write_text(json.dumps(tout, indent=2, ensure_ascii=False))
        print(f"  Résultats bruts : {args.sortie}\n")
    return 0


def _f(v):
    return None if v is None else float(v)


if __name__ == "__main__":
    raise SystemExit(main())
