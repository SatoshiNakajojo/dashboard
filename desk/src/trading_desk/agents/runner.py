"""Exécution d'un agent : politique d'abstention, journal, mesure.

Une seule règle gouverne ce module : **un agent qui n'arrive pas à produire une
sortie valide s'abstient — il n'invente jamais de valeur par défaut.**

C'est la différence entre un desk qui sait qu'il ne sait pas et un desk qui
fabrique une conviction pour remplir un champ obligatoire. Deux tentatives,
puis abstention explicite avec son motif. Un `Bias.FLAT` de repli serait un
mensonge : il se lirait comme une analyse alors qu'il n'en est pas une.

Tout ce qui entre et sort est journalisé — prompt complet, identifiant exact du
modèle, tokens, coût, latence, sortie brute. C'est la parade à l'angle mort
A-12 : quand une décision coûte de l'argent, il faut pouvoir répondre à
« pourquoi », des mois plus tard.
"""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from ..contracts.common import Frozen, now_ms
from ..contracts.signals import AgentOutput
from .llm import LLMClient, LLMError, LLMRefusal, LLMResponse

log = logging.getLogger(__name__)

T = TypeVar("T", bound=AgentOutput)

MAX_ATTEMPTS = 2


class AgentRun(Frozen):
    """Résultat d'une exécution, succès ou abstention.

    `output` est toujours présent : en cas d'échec, c'est une instance
    marquée `abstained=True` avec son motif. Le code appelant n'a donc jamais
    à gérer un `None`, et ne peut pas confondre « pas d'avis » avec « avis
    neutre ».
    """

    agent: str
    output: AgentOutput
    attempts: int
    succeeded: bool
    cost_usd: Decimal = Decimal("0")
    latency_ms: int = 0
    model: str = ""
    journal_ref: str = ""
    errors: tuple[str, ...] = ()
    pricing_known: bool = True

    @property
    def abstained(self) -> bool:
        return self.output.abstained


def run_agent(
    *,
    name: str,
    llm: LLMClient,
    system: str,
    user: str,
    schema: type[T],
    store=None,
    max_tokens: int = 4000,
    context: dict | None = None,
) -> AgentRun:
    """Appelle un agent, au plus `MAX_ATTEMPTS` fois, puis s'abstient.

    `context` est l'état de marché horodaté au moment de la décision. Il part
    au journal avec le prompt : sans lui, on peut relire le raisonnement mais
    pas le rejouer, ce qui suffit rarement en audit.
    """
    errors: list[str] = []
    total_cost = Decimal("0")
    total_latency = 0
    model_used = ""

    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            output, meta = llm.structured(
                system=system, user=user, schema=schema, max_tokens=max_tokens
            )
        except LLMRefusal as exc:
            # Un refus ne se réessaie pas : le modèle a tranché, réinsister
            # coûterait un appel pour le même résultat.
            errors.append(f"refus : {exc}")
            log.info("%s : le modèle a décliné", name)
            break
        except (LLMError, ValidationError) as exc:
            errors.append(f"tentative {attempt} : {exc}")
            log.warning("%s : tentative %d échouée — %s", name, attempt, exc)
            continue

        total_cost += meta.cost_usd
        total_latency += meta.latency_ms
        model_used = meta.model

        enriched = output.model_copy(update={
            "model_id": meta.model,
            "latency_ms": meta.latency_ms,
            "cost_usd": meta.cost_usd,
        })
        ref = _journal(store, name, system, user, meta, enriched, context, attempt)
        return AgentRun(
            agent=name,
            output=enriched.model_copy(update={"journal_ref": ref}),
            attempts=attempt, succeeded=True,
            cost_usd=total_cost, latency_ms=total_latency,
            model=model_used, journal_ref=ref, errors=tuple(errors),
            pricing_known=meta.pricing_known,
        )

    reason = errors[-1] if errors else "aucune sortie valide"
    abstention = schema(
        abstained=True,
        abstain_reason=f"{MAX_ATTEMPTS} tentatives sans sortie valide — {reason}"[:300],
        model_id=model_used,
    )
    ref = _journal(store, name, system, user, None, abstention, context, MAX_ATTEMPTS)
    log.warning("%s : abstention après %d tentatives", name, MAX_ATTEMPTS)

    return AgentRun(
        agent=name,
        output=abstention.model_copy(update={"journal_ref": ref}),
        attempts=MAX_ATTEMPTS, succeeded=False,
        cost_usd=total_cost, latency_ms=total_latency,
        model=model_used, journal_ref=ref, errors=tuple(errors),
    )


def _journal(
    store, name: str, system: str, user: str,
    meta: LLMResponse | None, output: AgentOutput,
    context: dict | None, attempt: int,
) -> str:
    """Écrit l'entrée d'audit. Le prompt complet en fait partie.

    Le stocker paraît coûteux jusqu'au jour où une décision coûte 400 USD et
    qu'on veut savoir ce que le modèle avait exactement sous les yeux.
    """
    if store is None:
        return ""
    payload = {
        "agent": name,
        "ts_ms": now_ms(),
        "attempt": attempt,
        "prompt_system": system,
        "prompt_user": user,
        "market_context": context or {},
        "output": output.model_dump(mode="json"),
        "abstained": output.abstained,
    }
    if meta is not None:
        payload["model"] = {
            "id": meta.model,
            "stop_reason": meta.stop_reason,
            "input_tokens": meta.input_tokens,
            "output_tokens": meta.output_tokens,
            "cache_read_tokens": meta.cache_read_tokens,
            "latency_ms": meta.latency_ms,
            "cost_usd": str(meta.cost_usd),
        }
    return store.journal(f"agent_{name}", payload)
