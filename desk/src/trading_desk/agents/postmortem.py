"""L'agent Post-mortem : la seule boucle d'apprentissage du desk.

Il n'a aucun pouvoir sur le présent. Il regarde un trade clos, en tire une
leçon, et l'écrit en mémoire. C'est tout — et c'est ce qui fait que le desk du
troisième mois n'est pas identique à celui du premier.

Deux propriétés qui font la différence entre une boucle d'apprentissage et un
journal de plus :

**La cause est choisie dans un ensemble fermé.** Des causes en texte libre ne
se comptent pas. Avec huit causes possibles, on découvre au bout de trente
trades que 40 % des sorties sont des stops balayés par le bruit — un fait que
trente paragraphes de prose n'auraient jamais fait apparaître.

**Les leçons du registre fantôme sont marquées comme telles.** Un setup rejeté
puis suivi n'est pas une expérience vécue : il n'a ni slippage, ni fill
partiel, ni la tentation d'en sortir trop tôt. Les confondre avec de vraies
positions ferait croire à une expérience qu'on n'a pas eue.
"""

from __future__ import annotations

import json
import uuid
from decimal import Decimal

from ..contracts.common import Regime, Side
from ..contracts.signals import PostMortem
from .llm import LLMClient
from .memory import Lesson, LessonStore
from .runner import AgentRun, run_agent

SYSTEM = """Tu analyses un trade CLOS sur un desk de trading de perpétuels crypto.

Tu n'as aucun pouvoir sur le présent : aucune position en cours ne dépend de
toi. Ton seul produit est une leçon réutilisable.

Trois exigences :

- **Choisis la cause principale dans la liste fournie**, celle qui explique le
  plus le résultat. Une seule. Si plusieurs se disputent, prends celle sur
  laquelle le desk peut agir.
- **La leçon doit être actionnable et spécifique.** « Mieux gérer le risque »
  n'apprend rien. « Sur BTC en range, un stop sous 1,5 ATR se fait balayer »
  est une leçon.
- **Un gain n'est pas une validation.** Un trade gagnant pour de mauvaises
  raisons mérite d'être signalé comme tel — c'est même le cas le plus
  dangereux, parce qu'il encourage à recommencer.

Ne cherche pas de leçon là où il n'y en a pas : `EVENEMENT_EXTERNE` avec une
leçon vide est une réponse honnête pour un choc imprévisible."""


def run_postmortem(
    *,
    llm: LLMClient,
    trade: dict,
    market_context: dict | None = None,
    store=None,
) -> AgentRun:
    """Analyse un trade clos.

    `trade` décrit ce qui s'est passé : actif, sens, prix d'entrée et de
    sortie, motif de sortie, résultat en R, frais, funding, durée. Plus il est
    complet, moins l'agent extrapole.
    """
    payload = {"trade": trade, "marche_a_la_cloture": market_context or {}}
    return run_agent(
        name="post_mortem", llm=llm, system=SYSTEM,
        user="Analyse ce trade clos :\n\n"
             + json.dumps(payload, indent=2, ensure_ascii=False, default=str),
        schema=PostMortem, store=store, context=payload,
    )


def lesson_from(
    post_mortem: PostMortem,
    *,
    asset: str,
    side: Side,
    regime: Regime = Regime.UNKNOWN,
    outcome: str = "",
    pnl_r: Decimal | None = None,
    was_taken: bool = True,
) -> Lesson | None:
    """Transforme un post-mortem en leçon mémorisable.

    Renvoie `None` quand il n'y a rien à retenir — une abstention, ou une
    leçon vide. Écrire des leçons creuses dilue la mémoire : au rappel, elles
    prennent la place de celles qui disent quelque chose.
    """
    if post_mortem.abstained or not post_mortem.lesson.strip():
        return None

    return Lesson(
        lesson_id=f"lsn_{uuid.uuid4().hex[:16]}",
        asset=asset.upper(), regime=regime, side=side,
        outcome=outcome or post_mortem.primary_cause,
        pnl_r=pnl_r, was_taken=was_taken,
        lesson=post_mortem.lesson.strip()[:400],
        tags=(post_mortem.primary_cause, *post_mortem.tags),
        journal_ref=post_mortem.journal_ref,
    )


def learn_from_trade(
    *,
    llm: LLMClient,
    trade: dict,
    memory: LessonStore,
    asset: str,
    side: Side,
    regime: Regime = Regime.UNKNOWN,
    pnl_r: Decimal | None = None,
    was_taken: bool = True,
    market_context: dict | None = None,
    store=None,
) -> tuple[AgentRun, Lesson | None]:
    """Boucle complète : analyser, puis mémoriser.

    Renvoie le run et la leçon écrite (ou `None`). Le run part au journal quoi
    qu'il arrive : savoir que le post-mortem s'est abstenu fait partie de ce
    qu'on voudra relire.
    """
    run = run_postmortem(llm=llm, trade=trade,
                         market_context=market_context, store=store)
    lesson = lesson_from(
        run.output,  # type: ignore[arg-type]
        asset=asset, side=side, regime=regime,
        outcome=str(trade.get("sortie", "")), pnl_r=pnl_r, was_taken=was_taken,
    )
    if lesson is not None:
        memory.remember(lesson)
    return run, lesson


def cause_histogram(post_mortems: list[PostMortem]) -> dict[str, int]:
    """Distribution des causes. Tout l'intérêt de l'ensemble fermé.

    C'est ce tableau, et pas les leçons individuelles, qui dit où le desk perd
    systématiquement de l'argent.
    """
    counts: dict[str, int] = {}
    for pm in post_mortems:
        if pm.abstained:
            continue
        counts[pm.primary_cause] = counts.get(pm.primary_cause, 0) + 1
    return dict(sorted(counts.items(), key=lambda kv: kv[1], reverse=True))
