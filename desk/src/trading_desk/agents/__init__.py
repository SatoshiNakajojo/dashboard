"""Couche cognitive. Aucun module d'ici n'a de reference vers `execution`.

La frontiere est structurelle : les agents produisent des objets typés que le
moteur de risque valide. Ils n'ont aucun chemin vers l'exchange.
"""

from .analyst import build_market_context, format_prompt, run_analyst
from .isolation import ExternalContent, looks_like_injection, sanitize, wrap
from .llm import (
    DEFAULT_MODEL, PRICING_USD_PER_MTOK, AnthropicLLM, LLMClient, LLMError,
    LLMRefusal, LLMResponse, ScriptedLLM,
)
from .metrics import AgentMetrics, format_report, summarize
from .runner import MAX_ATTEMPTS, AgentRun, run_agent

__all__ = [
    "DEFAULT_MODEL", "MAX_ATTEMPTS", "PRICING_USD_PER_MTOK", "AgentMetrics",
    "AgentRun", "AnthropicLLM", "ExternalContent", "LLMClient", "LLMError",
    "LLMRefusal", "LLMResponse", "ScriptedLLM", "build_market_context",
    "format_prompt", "format_report", "looks_like_injection", "run_agent",
    "run_analyst", "sanitize", "summarize", "wrap",
]
