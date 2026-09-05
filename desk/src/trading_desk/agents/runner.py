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
from functools import cache
from typing import TypeVar

from pydantic import BaseModel, ValidationError, create_model

from ..contracts.common import Frozen, now_ms
from ..contracts.signals import AgentOutput
from .llm import LLMClient, LLMError, LLMRefusal, LLMResponse

log = logging.getLogger(__name__)

T = TypeVar("T", bound=AgentOutput)

MAX_ATTEMPTS = 2


# Ce que le desk sait deja, et ne demande donc pas au modele.
#
# Ces champs de `AgentOutput` sont remplis par le runner : l'identifiant du
# modele servi, la latence et le cout sont *mesures* apres l'appel, la
# reference de journal est ecrite apres l'ecriture, l'horodatage vient de
# l'horloge du desk et `agent` est fixe par le role. Les envoyer au modele
# aurait deux effets, tous deux mauvais :
#
# 1. **Une mesure fabriquee.** Demander a un agent son propre cout et sa
#    propre latence, c'est demander une valeur inventee — et ce sont
#    exactement les deux chiffres que la porte P3 doit mesurer honnetement.
# 2. **Un schema que l'API refuse.** Le decodage contraint compile le schema
#    en automate ; chaque champ *optionnel* multiplie les chemins possibles.
#    Au-dela de douze champs optionnels, l'API repond « Schema is too
#    complex » (400) et l'agent s'abstient — pour une raison qui n'a rien a
#    voir avec sa competence. Les huit champs du socle poussaient les quatre
#    agents les plus riches par-dessus ce seuil.
#
# `abstained` et `abstain_reason` ne sont PAS dans cette liste : s'abstenir
# est une reponse que le modele doit pouvoir donner lui-meme.
ENVELOPPE = (
    "agent", "produced_at_ms", "model_id", "latency_ms", "cost_usd",
    "journal_ref",
)


@cache
def payload_schema(schema: type[AgentOutput]) -> type[BaseModel]:
    """Le sous-schema reellement demande au modele : ses champs a lui.

    Le contrat complet reste la seule chose qui circule dans le desk — il est
    reconstruit des la reponse recue. Ce schema reduit ne sert qu'a poser la
    question.
    """
    champs = {
        nom: (f.annotation, f)
        for nom, f in schema.model_fields.items()
        if nom not in ENVELOPPE
    }
    return create_model(  # type: ignore[call-overload]
        f"{schema.__name__}Payload", __base__=Frozen, **champs
    )


def limites_de_longueur(schema: type[BaseModel]) -> str:
    """Les bornes `max_length` du schema, dites en clair au modele.

    Le decodage contraint garantit la *forme* — types, enums, structure — mais
    pas les bornes de longueur : le modele peut produire un champ trop long,
    et c'est Pydantic qui le rejette, apres l'appel et apres la depense. Un
    agent bavard s'abstenait donc systematiquement, pour une raison qui ne
    disait rien de son jugement.

    Ces bornes sont lues dans le schema plutot que recopiees dans le prompt :
    une consigne recopiee ment des que quelqu'un modifie le `Field`, et un
    prompt qui ment sur son propre schema est pire que pas de consigne.
    """
    bornes = []
    for nom, f in schema.model_fields.items():
        for m in f.metadata:
            longueur = getattr(m, "max_length", None)
            if longueur is not None:
                bornes.append(f"- `{nom}` : {longueur} caracteres maximum")
    if not bornes:
        return ""
    return (
        "\n\nLongueurs imposees par ton schema de sortie. Un champ trop long "
        "est rejete\net te fait perdre ton tour — sois concis :\n"
        + "\n".join(bornes)
    )


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
    # Les tokens, et pas seulement leur prix. Un total en dollars ne dit pas
    # quel levier tirer : l'entree se cache et se raccourcit, la sortie se
    # regle par l'effort. Sans cette decomposition, un run a 4 $ ne laisse
    # aucune trace exploitable de la ou est parti l'argent.
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
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
    total_in = total_out = total_cache = 0
    model_used = ""

    demande = payload_schema(schema)
    consignes = system + limites_de_longueur(demande)

    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            payload, meta = llm.structured(
                system=consignes, user=user, schema=demande, max_tokens=max_tokens
            )
            # Reconstruit dans le `try` a dessein : une abstention sans motif
            # est refusee par le validateur du contrat, et doit compter comme
            # une tentative ratee — pas remonter jusqu'a l'appelant.
            output = schema(**payload.model_dump())
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
        total_in += meta.input_tokens
        total_out += meta.output_tokens
        total_cache += meta.cache_read_tokens
        model_used = meta.model

        enriched = output.model_copy(update={
            "model_id": meta.model,
            "latency_ms": meta.latency_ms,
            "cost_usd": meta.cost_usd,
        })
        ref = _journal(store, name, consignes, user, meta, enriched, context, attempt)
        return AgentRun(
            agent=name,
            output=enriched.model_copy(update={"journal_ref": ref}),
            attempts=attempt, succeeded=True,
            cost_usd=total_cost, latency_ms=total_latency,
            input_tokens=total_in, output_tokens=total_out,
            cache_read_tokens=total_cache,
            model=model_used, journal_ref=ref, errors=tuple(errors),
            pricing_known=meta.pricing_known,
        )

    reason = errors[-1] if errors else "aucune sortie valide"
    abstention = schema(
        abstained=True,
        abstain_reason=f"{MAX_ATTEMPTS} tentatives sans sortie valide — {reason}"[:300],
        model_id=model_used,
    )
    ref = _journal(store, name, consignes, user, None, abstention, context, MAX_ATTEMPTS)
    log.warning("%s : abstention après %d tentatives", name, MAX_ATTEMPTS)

    return AgentRun(
        agent=name,
        output=abstention.model_copy(update={"journal_ref": ref}),
        attempts=MAX_ATTEMPTS, succeeded=False,
        cost_usd=total_cost, latency_ms=total_latency,
        input_tokens=total_in, output_tokens=total_out,
        cache_read_tokens=total_cache,
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
