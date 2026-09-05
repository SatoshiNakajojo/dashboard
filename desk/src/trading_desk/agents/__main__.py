"""Porte P3 : faire tourner le desk sur du vrai marche, en mode fantome.

    python -m trading_desk.agents --check                      # un appel, < 1 centime
    python -m trading_desk.agents --dry-run                    # sans cle, gratuit
    python -m trading_desk.agents --file data/BTC_1h_real.json --runs 30 --budget-usd 5

Ce que cette commande mesure, et pourquoi ce sont ces trois chiffres :

- **taux de sorties valides** : un agent qui ne respecte pas son schema n'est
  pas exploitable, quelle que soit la qualite de son raisonnement ;
- **cout par decision**, extrapole au mois : la question « ce desk coute-t-il
  plus cher que ce qu'il rapporte » se tranche ici, pas au P5 ;
- **latence p95** : elle fixe la cadence maximale du desk.

**Aucun ordre n'est emis.** Le mandat produit est journalise et jete. C'est
tout l'interet du mode fantome : mesurer le comportement des agents avant que
leurs decisions aient une consequence.

**Chaque cycle tourne sur une fenetre de marche differente.** Trente cycles
sur la meme fenetre ne mesureraient que la variance du modele a prompt
constant — pas sa tenue face a des marches differents, qui est la question.
"""

from __future__ import annotations

import argparse
import os
import sys
from decimal import Decimal
from pathlib import Path

from ..backtest.data import DataUnavailable, load_from_file, load_synthetic
from ..features.bars import Bar
from .budget import BudgetedLLM, BudgetExceeded
from .graph import run_desk_cycle
from .llm import (
    API_KEY_VARS, DEFAULT_MODEL, OFFICIAL_BASE_URL, AnthropicLLM, LLMClient,
    LLMError, LLMRefusal, ScriptedLLM, api_key_source, desk_api_key,
)
from .memory import SqliteLessonStore
from .metrics import format_report, summarize

def _credential_available() -> bool:
    """Y a-t-il de quoi s'authentifier ?

    Trois sources, par ordre de precision : une variable du projet, une
    variable du SDK, un profil `ant auth login`. Echouer ici, avant de
    charger les donnees, donne un message qui dit quoi faire ; echouer au
    premier appel donnerait une erreur de transport.
    """
    if desk_api_key() is not None:
        return True
    if os.environ.get("ANTHROPIC_AUTH_TOKEN", "").strip():
        return True
    return Path.home().joinpath(".config/anthropic").exists()


# Un cycle a besoin d'assez d'historique pour que les indicateurs longs aient
# une valeur. En dessous, on mesure le rechauffement des indicateurs, pas le
# desk.
WINDOW_BARS = 300


def _windows(bars: list[Bar], count: int) -> list[list[Bar]]:
    """Decoupe l'historique en `count` fenetres reparties sur la periode.

    Reparties, et non consecutives : deux fenetres qui se chevauchent a 99 %
    posent deux fois la meme question. On veut des moments de marche
    distincts — hausse, baisse, range — dans le meme echantillon.
    """
    if len(bars) < WINDOW_BARS + count:
        raise DataUnavailable(
            f"{len(bars)} barres : il en faut au moins {WINDOW_BARS + count} "
            f"pour {count} fenetres de {WINDOW_BARS}."
        )
    span = len(bars) - WINDOW_BARS
    step = span / count
    return [bars[int(i * step):int(i * step) + WINDOW_BARS] for i in range(count)]


def _script() -> list:
    """Reponses fixes pour `--dry-run`. Le meme chemin de code, sans depense."""
    return [
        {"regime": "RANGE", "confidence": "0.6"},
        {"inputs_digest": "dry", "momentum": "0.1"},
        {"asset": "BTC", "bias": "LONG", "thesis_summary": "Fenetre de test."},
        {"asset": "BTC", "side": "LONG", "entry_price": "64000",
         "stop_price": "63000", "target_price": "66500", "conviction": "0.7"},
        {"targets_setup": "BTC", "severity": "0.3", "veto": False},
        {"size_factor": "0.9"},
        {"decision": "APPROVE", "reasoning": "test", "size_factor": "1"},
    ]


def _build_llm(args) -> LLMClient:
    if args.dry_run:
        return ScriptedLLM(_script() * (args.runs + 2))
    return AnthropicLLM(model=args.model, effort=args.effort)


def build_parser() -> argparse.ArgumentParser:
    """Le parser, isole pour que ses valeurs par defaut soient verifiables.

    Le defaut de `--budget-usd` n'est pas cosmetique : un oubli de l'option
    ne doit jamais signifier depense illimitee.
    """
    p = argparse.ArgumentParser(description="Porte P3 — desk en mode fantome")
    p.add_argument("--file", default=None,
                   help="JSON de bougies (scripts/fetch_candles.py)")
    p.add_argument("--asset", default="BTC")
    p.add_argument("--interval", default="1h")
    p.add_argument("--runs", type=int, default=30,
                   help="nombre de cycles ; la porte P3 en exige au moins 30")
    p.add_argument("--model", default=DEFAULT_MODEL)
    p.add_argument("--effort", default="medium",
                   choices=["low", "medium", "high", "xhigh", "max"])
    p.add_argument("--budget-usd", type=float, default=5.0,
                   help="plafond de depense. Aucun appel au-dela.")
    p.add_argument("--cadence", type=float, default=12.0,
                   help="decisions/heure, pour l'extrapolation mensuelle")
    p.add_argument("--memory-db", default=None)
    p.add_argument("--check", action="store_true",
                   help="verifie la cle et le reseau par UN appel minuscule, "
                        "puis s'arrete. Coute moins d'un centime.")
    p.add_argument("--dry-run", action="store_true",
                   help="modele scripte : verifie le cablage sans cle ni depense")
    return p


def _check(args) -> int:
    """Un seul appel, le plus petit possible, pour repondre a trois questions.

    La cle est-elle vue ? Le reseau passe-t-il ? Le modele demande existe-t-il
    et repond-il au bon format ? Trente cycles qui echouent au 29e sur une
    coquille dans un nom de modele coutent cher et n'apprennent rien.
    """
    from ..contracts.signals import RegimeRead

    print(f"\n  Clé lue depuis : {api_key_source() or '(profil ou fédération)'}")
    print(f"  Modèle         : {args.model}")
    print(f"  Point d'entrée : {os.environ.get('DESK_ANTHROPIC_BASE_URL', OFFICIAL_BASE_URL)}")
    print("\n  Un appel de test…")

    llm = AnthropicLLM(model=args.model, effort="low")
    try:
        sortie, meta = llm.structured(
            system="Tu réponds au format demandé, sans commentaire.",
            user="Régime de marché pour cette série : 100, 101, 100, 99, 100.",
            schema=RegimeRead, max_tokens=1000,
        )
    except LLMRefusal as exc:
        print(f"\n  Le modèle a décliné : {exc}")
        print("  La clé et le réseau fonctionnent — c'est le prompt qui pose "
              "problème.\n")
        return 1
    except LLMError as exc:
        print(f"\n  Échec : {exc}\n")
        print("  Causes probables, dans l'ordre :")
        print("   1. clé absente, expirée ou révoquée")
        print("   2. crédit épuisé (console Anthropic → Billing)")
        print(f"   3. api.anthropic.com bloqué par la politique réseau")
        print(f"   4. modèle « {args.model} » inconnu de ce compte\n")
        return 2

    print(f"\n  Réponse reçue   : {sortie.regime}")
    print(f"  Modèle servi    : {meta.model}")
    print(f"  Tokens          : {meta.input_tokens} entrée / "
          f"{meta.output_tokens} sortie")
    print(f"  Latence         : {meta.latency_ms} ms")
    if meta.pricing_known:
        print(f"  Coût de ce test : {float(meta.cost_usd):.6f} $")
        cycle = meta.cost_usd * 7
        print(f"  Ordre de grandeur : ~{float(cycle * args.runs):.2f} $ pour "
              f"{args.runs} cycles (7 agents chacun)")
    else:
        print(f"  Modèle « {meta.model} » hors grille tarifaire : "
              "le coût ne peut pas être estimé.")
    print("\n  Tout est en place. Lancer sans --check pour la porte P3.\n")
    return 0


def main() -> int:
    args = build_parser().parse_args()

    if not args.dry_run and not _credential_available():
        noms = " ou ".join(API_KEY_VARS)
        print(f"\n  Aucune clé Anthropic trouvée.\n"
              f"  Poser {noms} dans l'environnement, ou lancer\n"
              "  `ant auth login`.\n\n"
              "  Sur Claude Code web, préférer DESK_ANTHROPIC_API_KEY :\n"
              "  ANTHROPIC_API_KEY y est un nom réservé et peut être ignoré.\n\n"
              "  Pour vérifier le câblage sans clé et sans dépense : --dry-run\n",
              file=sys.stderr)
        return 2

    if not args.dry_run:
        source = api_key_source()
        print(f"\n  Clé lue depuis : {source}"
              if source else "\n  Clé résolue par le SDK (profil ou fédération).")

    if args.check:
        return _check(args)

    try:
        bars = (load_from_file(args.file, args.asset, args.interval)
                if args.file else load_synthetic(args.asset, count=1200))
        fenetres = _windows(bars, args.runs)
    except DataUnavailable as exc:
        print(f"\n  Données indisponibles : {exc}\n", file=sys.stderr)
        return 2

    if not args.file:
        print("\n  ATTENTION — barres synthétiques. Ces chiffres mesurent le "
              "câblage,\n  ils ne disent rien du comportement des agents sur "
              "un vrai marché.")

    llm = BudgetedLLM(_build_llm(args), max_usd=Decimal(str(args.budget_usd)))
    memory = SqliteLessonStore(args.memory_db) if args.memory_db else None

    print(f"\n  {args.runs} cycles fantômes · {args.model} · effort {args.effort}"
          f" · plafond {args.budget_usd:.2f} $")
    if not args.dry_run:
        print("  Aucun ordre n'est émis. Le mandat est journalisé puis jeté.\n")

    tous = []
    stages: dict[str, int] = {}
    interrompu = ""
    for i, fenetre in enumerate(fenetres, 1):
        try:
            res = run_desk_cycle(llm=llm, bars=fenetre, memory=memory)
        except BudgetExceeded as exc:
            # Le graphe absorbe normalement le depassement via l'abstention ;
            # s'il remonte jusqu'ici, on arrete la boucle plutot que de la
            # laisser produire des cycles vides jusqu'au bout.
            interrompu = str(exc)
            break
        tous.extend(res.runs)
        stages[res.stage.value] = stages.get(res.stage.value, 0) + 1
        print(f"    cycle {i}/{len(fenetres)} — {res.stage.value:<14} "
              f"{float(llm.spent_usd):.4f} $ dépensés", end="\r", flush=True)

    print(" " * 70, end="\r")
    if interrompu:
        print(f"\n  Interrompu : {interrompu}\n")

    if not tous:
        print("\n  Aucun agent n'a tourné.\n", file=sys.stderr)
        return 2

    par_agent: dict[str, list] = {}
    for r in tous:
        par_agent.setdefault(r.agent, []).append(r)

    for nom in sorted(par_agent):
        print(format_report(summarize(par_agent[nom]),
                            decisions_per_hour=args.cadence))

    global_ = summarize(tous)
    print("  " + "=" * 58)
    print(f"  TOTAL   {global_.runs} appels · "
          f"{float(llm.spent_usd):.4f} $ · "
          f"{global_.valid_rate_pct:.1f} % valides · "
          f"p95 {global_.latency_p95_ms} ms")
    if llm.unpriced_calls:
        print(f"  {llm.unpriced_calls} appel(s) sur un modèle hors grille : "
              "le coût affiché n'est pas fiable.")
    print("  répartition des issues : "
          + ", ".join(f"{k} {v}" for k, v in sorted(stages.items())))

    # La porte se joue agent par agent : une moyenne globale masque l'agent
    # qui echoue, et c'est precisement celui qui bloque le passage au P4.
    faibles = [n for n in sorted(par_agent)
               if not summarize(par_agent[n]).passes_p3_gate]
    print("  " + "=" * 58)
    if faibles:
        print(f"  PORTE P3 : NON FRANCHIE — {', '.join(faibles)}")
    else:
        print("  PORTE P3 : FRANCHIE pour tous les agents.")
    print()

    if memory:
        memory.close()
    return 0 if not faibles else 1


if __name__ == "__main__":
    raise SystemExit(main())
