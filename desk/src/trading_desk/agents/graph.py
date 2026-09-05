"""Le graphe du desk : de l'état de marché au mandat.

Le problème que ce module résout n'est pas d'enchaîner des agents — c'est
d'empêcher le débat de converger vers l'action.

Les LLM sont complaisants et orientés action. Six agents qui « débattent »
convergent vers un consensus poli, pas vers une vérité. Sans contre-force
explicite, on obtient une machine qui trouve un setup toutes les quinze
minutes, et le sur-trading est le mode de mort le plus courant d'un desk
automatisé.

D'où une orchestration bâtie sur des **portes déterministes**, évaluées en
code entre les agents :

- **FLAT est la sortie par défaut.** Un mandat directionnel n'est émis que si
  toutes les portes sont franchies. Le cycle produit toujours un mandat ;
  celui de l'immense majorité des cycles est FLAT.
- **Chaque porte fermée arrête le cycle immédiatement.** Ce n'est pas
  seulement une économie d'appels : appeler le Chef de desk sur un setup déjà
  invalidé, c'est lui donner l'occasion de le sauver.
- **L'Avocat du diable passe avant le Chef.** Une objection sérieuse doit
  exister avant la décision, pas après.
- **Un quota quotidien** plafonne le nombre de mandats. Il ne dépend d'aucun
  agent.

Le mandat émis reste un objet borné : le moteur de risque le validera ensuite,
et rien de ce qui suit ne peut élargir ses limites.
"""

from __future__ import annotations

import logging
from decimal import Decimal
from enum import Enum

from pydantic import Field

from ..contracts.common import Bias, Frozen, Regime, Side, now_ms
from ..contracts.mandate import EntryPlan, Mandate, StopBand
from ..contracts.signals import (
    AnalystView, CounterThesis, DeskVerdict, NewsRead, QuantRead, RegimeRead,
    RiskAdvice, SetupProposal,
)
from ..features.bars import Bar
from ..risk.limits import RiskLimits
from .analyst import build_market_context, run_analyst
from .isolation import ExternalContent
from .llm import LLMClient
from .memory import LessonStore, format_for_prompt
from .roster import (
    run_chef, run_devil, run_news, run_quant, run_regime, run_risk_advisor,
    run_strategy,
)
from .runner import AgentRun

log = logging.getLogger(__name__)


class Stage(str, Enum):
    """Là où le cycle s'est arrêté. C'est la statistique la plus instructive
    du mode fantôme : elle dit quelle porte filtre réellement."""

    QUOTA = "QUOTA"                    # plafond quotidien atteint
    LECTURE = "LECTURE"                # une lecture amont s'est abstenue
    PAS_DE_SETUP = "PAS_DE_SETUP"      # la stratégie n'a rien proposé
    VETO = "VETO"                      # l'avocat du diable a opposé son veto
    OBJECTION = "OBJECTION"            # objection trop sévère
    CONVICTION = "CONVICTION"          # conviction sous le seuil
    ASYMETRIE = "ASYMETRIE"            # rapport gain/risque insuffisant
    REJET_CHEF = "REJET_CHEF"          # le chef de desk a rejeté
    MANDAT = "MANDAT"                  # mandat directionnel émis


class GraphConfig(Frozen):
    """Seuils des portes. Volontairement sévères.

    Ils se desserrent avec des données de mode fantôme, jamais avec de
    l'enthousiasme.
    """

    min_conviction: Decimal = Field(default=Decimal("0.6"), ge=0, le=1)
    max_objection_severity: Decimal = Field(default=Decimal("0.6"), ge=0, le=1)
    min_reward_risk: Decimal = Field(default=Decimal("1.5"), gt=0)
    max_mandates_per_day: int = Field(default=8, ge=1)
    mandate_ttl_ms: int = Field(default=20 * 60 * 1000, ge=30_000)
    base_notional_usd: Decimal = Field(default=Decimal("300"), gt=0)


class GraphResult(Frozen):
    """Résultat d'un cycle. Un mandat sort toujours — souvent FLAT."""

    mandate: Mandate
    stage: Stage
    runs: tuple[AgentRun, ...]
    setup: SetupProposal | None = None
    counter: CounterThesis | None = None
    verdict: DeskVerdict | None = None
    reason: str = ""

    @property
    def cost_usd(self) -> Decimal:
        return sum((r.cost_usd for r in self.runs), Decimal("0"))

    @property
    def latency_ms(self) -> int:
        return sum(r.latency_ms for r in self.runs)

    @property
    def calls(self) -> int:
        return sum(r.attempts for r in self.runs)

    @property
    def is_directional(self) -> bool:
        return self.mandate.bias is not Bias.FLAT


def run_desk_cycle(
    *,
    llm: LLMClient,
    bars: list[Bar],
    account: dict | None = None,
    news_items: list[ExternalContent] | None = None,
    config: GraphConfig | None = None,
    limits: RiskLimits | None = None,
    mandates_today: int = 0,
    memory: LessonStore | None = None,
    store=None,
) -> GraphResult:
    """Déroule un cycle complet. En mode fantôme, le mandat n'est pas exécuté.

    L'ordre des appels n'est pas cosmétique : chaque porte fermée évite les
    appels suivants, et surtout évite de donner au Chef de desk l'occasion de
    sauver un setup déjà invalidé.
    """
    config = config or GraphConfig()
    limits = limits or RiskLimits()
    account = account or {}
    runs: list[AgentRun] = []

    def flat(
        stage: Stage, reason: str,
        setup: SetupProposal | None = None,
        counter: CounterThesis | None = None,
        verdict: DeskVerdict | None = None,
    ) -> GraphResult:
        """Sortie FLAT, en transportant ce qui a déjà été formulé.

        Le setup part avec le résultat même quand il est rejeté : c'est ce que
        le registre fantôme suivra pour savoir si le desk filtre du bruit ou
        détruit de l'alpha. Le perdre ici rendrait cette mesure impossible.
        """
        ref = store.journal("cycle_flat", {
            "stage": stage.value, "reason": reason,
            "agents": [r.agent for r in runs],
            "setup": setup.model_dump(mode="json") if setup else None,
            "cost_usd": str(sum((r.cost_usd for r in runs), Decimal("0"))),
        }) if store else ""
        log.info("cycle FLAT (%s) — %s", stage.value, reason)
        return GraphResult(
            mandate=Mandate.flat(ttl_ms=config.mandate_ttl_ms, journal_ref=ref),
            stage=stage, runs=tuple(runs), reason=reason,
            setup=setup, counter=counter, verdict=verdict,
        )

    # Porte 0 — le quota. Il ne dépend d'aucun agent, et se vérifie avant
    # de dépenser le moindre appel.
    if mandates_today >= config.max_mandates_per_day:
        return flat(Stage.QUOTA,
                    f"quota atteint ({mandates_today}/{config.max_mandates_per_day})")

    context = build_market_context(bars)

    # --- lectures parallèles en intention, séquentielles en implémentation ---
    news_run = None
    if news_items:
        news_run = run_news(llm=llm, items=news_items, store=store)
        runs.append(news_run)

    regime_run = run_regime(llm=llm, context=context, store=store)
    runs.append(regime_run)

    quant_run = run_quant(llm=llm, indicators=context["indicateurs"], store=store)
    runs.append(quant_run)

    analyst_run = run_analyst(llm=llm, bars=bars, store=store)
    runs.append(analyst_run)

    # Porte 1 — une lecture amont manquante rend la suite indécidable.
    # Continuer produirait une décision fondée sur un trou.
    manquantes = [
        r.agent for r in (regime_run, quant_run, analyst_run) if r.abstained
    ]
    if manquantes:
        return flat(Stage.LECTURE, f"lectures indisponibles : {', '.join(manquantes)}")

    regime: RegimeRead = regime_run.output       # type: ignore[assignment]
    quant: QuantRead = quant_run.output          # type: ignore[assignment]
    analyst: AnalystView = analyst_run.output    # type: ignore[assignment]
    news: NewsRead | None = news_run.output if news_run and not news_run.abstained else None  # type: ignore[assignment]

    # --- proposition, éclairée par les trades passés ---
    # Le rappel se fait APRÈS la classification du régime : on veut les leçons
    # du régime réellement identifié, pas celles de l'actif en général.
    lecons = ""
    if memory is not None:
        passees = memory.recall(
            asset=analyst.asset or context["actif"],
            regime=regime.regime, side=None, limit=4,
            context_text=analyst.thesis_summary + " " + " ".join(quant.divergences),
        )
        lecons = format_for_prompt(passees)

    strategy_run = run_strategy(
        llm=llm, context=context, analyst=analyst, quant=quant,
        regime=regime, news=news, memories=lecons, store=store,
    )
    runs.append(strategy_run)

    if strategy_run.abstained:
        return flat(Stage.PAS_DE_SETUP,
                    strategy_run.output.abstain_reason or "aucun setup proposé")

    setup: SetupProposal = strategy_run.output   # type: ignore[assignment]
    if setup.side is None or setup.entry_price is None or setup.stop_price is None:
        return flat(Stage.PAS_DE_SETUP, "setup incomplet")

    # --- contradiction obligatoire, AVANT la décision ---
    devil_run = run_devil(llm=llm, setup=setup, context=context,
                          regime=regime, store=store)
    runs.append(devil_run)
    counter: CounterThesis = devil_run.output    # type: ignore[assignment]

    # Une abstention de l'avocat du diable ne vaut pas absence d'objection :
    # personne n'a contredit le setup, donc on ne passe pas.
    if devil_run.abstained:
        return flat(Stage.VETO, "aucune contradiction disponible", setup)
    if counter.veto:
        return flat(Stage.VETO, "; ".join(counter.objections) or "veto",
                    setup, counter)
    if counter.severity > config.max_objection_severity:
        return flat(Stage.OBJECTION,
                    f"objection sévère ({counter.severity}) : "
                    + "; ".join(counter.objections[:2]), setup, counter)

    # --- portes déterministes sur le setup lui-même ---
    if setup.conviction < config.min_conviction:
        return flat(Stage.CONVICTION,
                    f"conviction {setup.conviction} < {config.min_conviction}",
                    setup, counter)

    rr = setup.reward_risk
    if rr is not None and rr < config.min_reward_risk:
        return flat(Stage.ASYMETRIE, f"gain/risque {rr:.2f} < {config.min_reward_risk}",
                    setup, counter)

    # --- avis de risque, puis décision ---
    advisor_run = run_risk_advisor(llm=llm, setup=setup, counter=counter,
                                   account=account, store=store)
    runs.append(advisor_run)
    advice: RiskAdvice = (
        advisor_run.output if not advisor_run.abstained else RiskAdvice()  # type: ignore[assignment]
    )

    chef_run = run_chef(llm=llm, setup=setup, counter=counter, advice=advice,
                        regime=regime, quant=quant, context=context, store=store)
    runs.append(chef_run)

    if chef_run.abstained:
        return flat(Stage.REJET_CHEF, "le chef de desk s'est abstenu", setup, counter)

    verdict: DeskVerdict = chef_run.output       # type: ignore[assignment]
    if verdict.decision == "REJECT":
        return flat(Stage.REJET_CHEF, verdict.reasoning[:200] or "rejet",
                    setup, counter, verdict)

    mandate = build_mandate(
        setup=setup, verdict=verdict, advice=advice, regime=regime,
        config=config, limits=limits, store=store,
        journal_payload={
            "setup": setup.model_dump(mode="json"),
            "objection": counter.model_dump(mode="json"),
            "avis_risque": advice.model_dump(mode="json"),
            "verdict": verdict.model_dump(mode="json"),
            "marche": context,
        },
    )
    log.info("mandat émis : %s %s", mandate.bias.value, mandate.universe)
    return GraphResult(
        mandate=mandate, stage=Stage.MANDAT, runs=tuple(runs),
        setup=setup, counter=counter, verdict=verdict,
        reason="toutes les portes franchies",
    )


def build_mandate(
    *,
    setup: SetupProposal,
    verdict: DeskVerdict,
    advice: RiskAdvice,
    regime: RegimeRead,
    config: GraphConfig,
    limits: RiskLimits,
    store=None,
    journal_payload: dict | None = None,
) -> Mandate:
    """Traduit une décision en mandat borné.

    Le point important : **les deux facteurs de réduction se multiplient**, et
    le résultat ne peut que rétrécir le notionnel de base. Ni le Chef de desk
    ni le Risk Advisor n'ont de champ capable d'élargir quoi que ce soit — le
    schéma les borne à `]0, 1]`, et cette fonction ne fait que multiplier.
    """
    assert setup.side is not None and setup.entry_price is not None
    assert setup.stop_price is not None

    facteur = min(verdict.size_factor, Decimal("1")) * min(advice.size_factor, Decimal("1"))
    notional = min(
        config.base_notional_usd * facteur,
        limits.max_position_notional_usd,
    )

    distance_bps = setup.stop_distance_bps or Decimal("100")
    # La fourchette encadre la distance proposée sans jamais sortir des bornes
    # dures : si le setup demande un stop hors limites, le mandat est refusé
    # à la construction plutôt que d'être silencieusement élargi.
    band = StopBand(
        min_bps=max(limits.min_stop_distance_bps, distance_bps * Decimal("0.8")),
        max_bps=min(limits.max_stop_distance_bps, distance_bps * Decimal("1.25")),
    )

    ref = store.journal("mandat", journal_payload or {}) if store else ""

    return Mandate(
        bias=Bias.LONG if setup.side is Side.LONG else Bias.SHORT,
        regime=regime.regime,
        conviction=min(setup.conviction, Decimal("1")),
        universe=(setup.asset,),
        max_notional_usd=notional,
        max_leverage=min(limits.max_effective_leverage, Decimal("2")),
        max_concurrent_positions=1,
        stop_band=band,
        entry=EntryPlan(),
        ttl_ms=config.mandate_ttl_ms,
        journal_ref=ref,
    )
