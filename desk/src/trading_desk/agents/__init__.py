"""Couche cognitive. Aucun module d'ici n'a de reference vers `execution`.

La frontiere est structurelle : les agents produisent des objets typés que le
moteur de risque valide. Ils n'ont aucun chemin vers l'exchange.
"""

from .analyst import build_market_context, format_prompt, run_analyst
from .graph import GraphConfig, GraphResult, Stage, build_mandate, run_desk_cycle
from .isolation import ExternalContent, looks_like_injection, sanitize, wrap
from .llm import (
    DEFAULT_MODEL, PRICING_USD_PER_MTOK, AnthropicLLM, LLMClient, LLMError,
    LLMRefusal, LLMResponse, ScriptedLLM,
)
from .memory import (
    Lesson, LessonStore, SqliteLessonStore, format_for_prompt,
)
from .metrics import AgentMetrics, format_report, summarize
from .postmortem import (
    cause_histogram, learn_from_trade, lesson_from, run_postmortem,
)
from .roster import (
    ModelPolicy, run_chef, run_devil, run_news, run_quant, run_regime,
    run_risk_advisor, run_strategy,
)
from .runner import MAX_ATTEMPTS, AgentRun, run_agent
from .shadow_book import ShadowBook, ShadowEntry, StageStats

__all__ = [
    "DEFAULT_MODEL", "MAX_ATTEMPTS", "PRICING_USD_PER_MTOK", "AgentMetrics",
    "AgentRun", "AnthropicLLM", "ExternalContent", "GraphConfig", "GraphResult",
    "LLMClient", "LLMError", "LLMRefusal", "LLMResponse", "Lesson",
    "LessonStore", "ModelPolicy",
    "ScriptedLLM", "ShadowBook", "ShadowEntry", "SqliteLessonStore", "Stage",
    "StageStats", "cause_histogram", "format_for_prompt", "learn_from_trade",
    "lesson_from", "run_postmortem",
    "build_mandate", "build_market_context", "format_prompt", "format_report",
    "looks_like_injection", "run_agent", "run_analyst", "run_chef", "run_desk_cycle",
    "run_devil", "run_news", "run_quant", "run_regime", "run_risk_advisor",
    "run_strategy", "sanitize", "summarize", "wrap",
]
