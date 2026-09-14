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
        # Amorcer AVANT resoudre : une entree touchee et un stop touche sur
        # la meme bougie donnent un trade pris puis stoppe, pas un trade
        # ignore. L'ordre inverse laisserait passer les meches qui font les
        # deux — et surtout, sans amorcage du tout, un setup dont le marche
        # n'atteint jamais l'entree encaisse sa cible sans jamais avoir ete
        # ouvert.
        book.amorcer(asset, high=bar.high, low=bar.low)
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
            # Relu DEPUIS le livre, pas depuis `entree` : `ShadowEntry` est
            # figé, donc `resolve()` remplace la case de la liste et la
            # référence locale reste sur l'ancien objet, éternellement
            # « ouvert ». Le stockage est juste ; c'est l'affichage qui
            # mentirait.
            a_jour = book.entries[-1]
            etat = a_jour.outcome or "ouvert"
            marque = f"{'ÉMIS  ' if a_jour.issued else 'rejeté'} {etat:>8}"
        print(f"    {nom:<11} {i}/{len(debuts)} {res.stage.value:<14} "
              f"{marque}  {float(llm.spent_usd):.4f} $", flush=True)
    return book, llm, interrompu


def calibration(entrees: list[dict]) -> str:
    """La conviction annoncee predit-elle quoi que ce soit ?

    C'est la question qui reste posable meme quand le desk n'emet aucun
    mandat — et il n'en emet aucun. Sans mandats, la DISCRIMINATION est
    indeterminee par construction : il n'y a qu'une population. Mais la
    Strategie chiffre sa confiance sur chaque setup, et on sait maintenant ce
    que chacun est devenu.

    Si les setups a forte conviction gagnent plus que ceux a faible
    conviction, ce champ porte de l'information et une porte a seuil a
    quelque chose a filtrer. Sinon, la porte `min_conviction` trie du bruit
    de notation, et la desserrer ou la resserrer revient au meme.
    """
    resolus = [e for e in entrees if e["resolved"] and e["pnl_r"] is not None]
    if len(resolus) < 10:
        return f"\n  Calibration : {len(resolus)} setups resolus, trop peu.\n"

    resolus.sort(key=lambda e: float(e["conviction"]))
    milieu = len(resolus) // 2

    def mediane(g: list[dict]) -> float:
        """Vraie mediane : sur un effectif pair, la moyenne des deux centrales.

        Afficher la centrale HAUTE a cote d'un min et d'un max donnerait une
        mediane egale au max sur une distribution a deux modes — ce qui se
        lirait comme « tout est en haut ».
        """
        v = sorted(float(e["conviction"]) for e in g)
        n = len(v)
        return (v[n // 2] if n % 2 else (v[n // 2 - 1] + v[n // 2]) / 2) if n else 0.0
    basse, haute = resolus[:milieu], resolus[milieu:]

    def moy(g, cle):
        return sum(float(e[cle]) for e in g) / len(g) if g else 0.0

    lignes = [
        "",
        f"  CALIBRATION DE LA CONVICTION — {len(resolus)} setups resolus",
        "  " + "-" * 62,
        f"  conviction : min {mediane(resolus[:1]):.2f}  "
        f"mediane {mediane(resolus):.2f}  max {mediane(resolus[-1:]):.2f}",
        f"  moitie BASSE  (conv. moy. {moy(basse, 'conviction'):.2f}) : "
        f"{moy(basse, 'pnl_r'):+.2f} R  sur {len(basse)} setups",
        f"  moitie HAUTE  (conv. moy. {moy(haute, 'conviction'):.2f}) : "
        f"{moy(haute, 'pnl_r'):+.2f} R  sur {len(haute)} setups",
    ]
    ecart = moy(haute, "pnl_r") - moy(basse, "pnl_r")
    if abs(moy(haute, "conviction") - moy(basse, "conviction")) < 0.05:
        lignes.append("  La conviction ne varie presque pas : rien a correler.")
    elif ecart > 0:
        lignes.append(f"  ecart {ecart:+.2f} R — la conviction porte de "
                      "l'information")
    else:
        lignes.append(f"  ecart {ecart:+.2f} R — la conviction n'en porte pas ; "
                      "une porte a seuil\n  y filtre du bruit de notation")

    issues: dict[str, int] = {}
    for e in resolus:
        issues[e["outcome"]] = issues.get(e["outcome"], 0) + 1
    lignes.append("  issues : " + ", ".join(f"{k} {v}" for k, v in sorted(issues.items())))
    lignes.append("")
    return "\n".join(lignes)


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--file", default=None)
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
    p.add_argument("--limite", type=int, default=None,
                   help="n'executer que N fenetres de la grille --runs, "
                        "reparties regulierement. Sert a sonder un correctif "
                        "sur les MEMES fenetres qu'une campagne complete, "
                        "sans en repayer le prix.")
    p.add_argument("--from-json", default=None,
                   help="relire une campagne deja payee et n'en refaire que "
                        "la lecture")
    args = p.parse_args()

    if args.from_json:
        tout = json.loads(Path(args.from_json).read_text())
        for nom, d in tout.items():
            print(f"\n  === {nom} — {d['cycles']} cycles, "
                  f"{d['cout_total']:.4f} $ ===")
            print(f"  {d['emis']} mandats emis / {d['rejetes']} setups rejetes")
            print(f"  esperance emis    : {d['esperance_emis']}")
            print(f"  esperance rejets  : {d['esperance_rejets']}")
            print(f"  discrimination    : {d['discrimination']}")
            print(calibration(d["entrees"]))
        return 0

    if not args.file:
        print("\n  --file est requis hors relecture.\n", file=sys.stderr)
        return 2
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

    if args.limite and args.limite < len(debuts):
        # Sous-echantillon REGULIER de la meme grille, pas ses N premieres
        # fenetres. Les N premieres ne couvriraient que le debut de la
        # periode : une sonde qui ne verrait qu'un seul regime de marche
        # dirait autant de choses sur la periode choisie que sur ce qu'on
        # mesure. Regulier, chaque fenetre reste comparable a celle du meme
        # rang dans la campagne complete.
        k = len(debuts) / args.limite
        debuts = [debuts[int(i * k)] for i in range(args.limite)]

    print(f"\n  {len(bars)} barres, {args.runs} fenêtres de {WINDOW_BARS}, "
          f"{marge} barres de marge pour l'horizon.")
    print(f"  Plafond {args.plafond_par_politique:.2f} $ par politique.\n")

    tout = {}
    for nom in args.politiques:
        book, llm, interrompu = mesurer(
            nom, bars, debuts, plafond=args.plafond_par_politique,
            effort=args.effort, modele=args.modele, interval=args.interval)
        print(book.format_report())
        print(calibration([e.model_dump(mode="json") for e in book.entries]))
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
