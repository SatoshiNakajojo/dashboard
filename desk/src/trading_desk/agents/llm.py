"""Accès au modèle, derrière une interface étroite.

Deux implémentations : l'API Claude, et un modèle scripté pour les tests. Tout
le reste du paquet `agents` ne connaît que le protocole `LLMClient`, ce qui
rend le graphe entier testable sans clé, sans réseau et sans dépense.

Deux décisions qui méritent d'être nommées :

**Un refus est une abstention, pas une erreur.** Quand le modèle décline
(`stop_reason == "refusal"`), on ne bascule pas silencieusement vers un autre
modèle. Sur un desk, s'abstenir est un résultat parfaitement valide, alors
qu'un changement de modèle en cours de décision brouillerait le journal : la
question « quel modèle a décidé, avec quel prompt » doit garder une réponse
unique. Les *refusal fallbacks* côté serveur restent disponibles en une ligne
(`enable_fallbacks=True`) si l'on préfère l'autre compromis.

**Le coût est mesuré, pas estimé.** Chaque appel renvoie ses tokens réels et
son coût calculé. Sans ça, la question « ce desk coûte-t-il plus cher que ce
qu'il rapporte » reste une intuition — et c'est la porte P5 qui la tranche.
"""

from __future__ import annotations

import time
from decimal import Decimal
from typing import Any, Protocol, TypeVar

from pydantic import BaseModel

from ..contracts.common import Frozen

T = TypeVar("T", bound=BaseModel)

DEFAULT_MODEL = "claude-opus-5"

# Tarifs par million de tokens, à la date d'écriture. À revalider : une grille
# périmée fausse le calcul de rentabilité, qui est la seule raison d'être de
# cette mesure.
PRICING_USD_PER_MTOK: dict[str, tuple[Decimal, Decimal]] = {
    "claude-opus-5": (Decimal("5"), Decimal("25")),
    "claude-sonnet-5": (Decimal("2"), Decimal("10")),
    "claude-haiku-4-5": (Decimal("1"), Decimal("5")),
}


class LLMError(RuntimeError):
    """Échec d'appel. Distinct d'un refus, qui n'est pas une erreur."""


class LLMRefusal(LLMError):
    """Le modèle a décliné. Traité comme une abstention en amont."""


class LLMResponse(Frozen):
    """Ce qu'un appel rapporte, au-delà du contenu.

    `raw_text` sert au journal : on veut pouvoir relire ce que le modèle a
    réellement produit, pas seulement l'objet validé.
    """

    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    latency_ms: int = 0
    stop_reason: str = ""
    raw_text: str = ""

    @property
    def pricing_known(self) -> bool:
        """Faux si le modèle n'est pas dans la grille tarifaire.

        Le distinguer d'un coût nul est indispensable : sans ce drapeau, un
        identifiant de modèle inconnu ferait lire « gratuit » là où la
        réponse honnête est « on ne sait pas », et l'extrapolation mensuelle
        mentirait sans prévenir.
        """
        return self.model in PRICING_USD_PER_MTOK

    @property
    def cost_usd(self) -> Decimal:
        rates = PRICING_USD_PER_MTOK.get(self.model)
        if rates is None:
            return Decimal("0")
        cost_in, cost_out = rates
        million = Decimal("1000000")
        return (Decimal(self.input_tokens) * cost_in
                + Decimal(self.output_tokens) * cost_out) / million


class LLMClient(Protocol):
    """Une seule opération : produire un objet typé, ou échouer bruyamment."""

    def structured(
        self,
        *,
        system: str,
        user: str,
        schema: type[T],
        max_tokens: int = 4000,
    ) -> tuple[T, LLMResponse]: ...


class AnthropicLLM:
    """Client réel. Le seul endroit du projet qui parle à un modèle.

    `messages.parse` contraint la réponse au schéma Pydantic fourni : on ne
    parse pas de la prose, ce qui supprime toute une famille de bugs — et rend
    l'abstention explicite plutôt que devinée à partir d'un texte ambigu.
    """

    def __init__(
        self,
        *,
        model: str = DEFAULT_MODEL,
        effort: str = "medium",
        client: Any | None = None,
        enable_fallbacks: bool = False,
    ) -> None:
        self.model = model
        self.effort = effort
        self.enable_fallbacks = enable_fallbacks
        self._client = client

    def _lazy_client(self) -> Any:
        if self._client is None:
            import anthropic

            # Constructeur sans argument : la clé vient de l'environnement ou
            # d'un profil `ant auth login`. Aucune clé n'est écrite en dur ni
            # journalisée.
            self._client = anthropic.Anthropic()
        return self._client

    def structured(
        self,
        *,
        system: str,
        user: str,
        schema: type[T],
        max_tokens: int = 4000,
    ) -> tuple[T, LLMResponse]:
        client = self._lazy_client()
        started = time.monotonic()

        kwargs: dict[str, Any] = {
            "model": self.model,
            "max_tokens": max_tokens,
            # La réflexion adaptative est laissée active : lire une structure
            # de marché n'est pas une tâche de classification triviale, et
            # l'effort se règle plutôt par `effort` que par sa désactivation.
            "thinking": {"type": "adaptive"},
            "output_config": {"effort": self.effort},
            "system": system,
            "messages": [{"role": "user", "content": user}],
            "output_format": schema,
        }

        try:
            response = client.messages.parse(**kwargs)
        except Exception as exc:  # noqa: BLE001 — remonté typé au-dessus
            raise LLMError(f"appel au modèle échoué : {exc}") from exc

        latency_ms = int((time.monotonic() - started) * 1000)
        usage = getattr(response, "usage", None)
        meta = LLMResponse(
            model=getattr(response, "model", self.model),
            input_tokens=getattr(usage, "input_tokens", 0) or 0,
            output_tokens=getattr(usage, "output_tokens", 0) or 0,
            cache_read_tokens=getattr(usage, "cache_read_input_tokens", 0) or 0,
            latency_ms=latency_ms,
            stop_reason=getattr(response, "stop_reason", "") or "",
        )

        # Le refus se vérifie AVANT de lire le contenu : sur un refus, il n'y
        # a rien à lire, et une lecture optimiste lèverait une exception
        # obscure au lieu du message explicite qu'on veut au journal.
        if meta.stop_reason == "refusal":
            details = getattr(response, "stop_details", None)
            category = getattr(details, "category", None) or "non précisée"
            raise LLMRefusal(f"le modèle a décliné (catégorie : {category})")

        parsed = getattr(response, "parsed_output", None)
        if parsed is None:
            raise LLMError("aucune sortie structurée dans la réponse")
        return parsed, meta


class ScriptedLLM:
    """Modèle déterministe pour les tests.

    Rejoue une liste de résultats : instances valides, exceptions à lever, ou
    dictionnaires à valider. Permet de tester la politique d'abstention, le
    comptage de coût et le journal sans dépenser un centime.
    """

    def __init__(self, script: list[Any], *, model: str = "scripted") -> None:
        self.script = list(script)
        self.model = model
        self.calls: list[dict[str, str]] = []

    def structured(
        self,
        *,
        system: str,
        user: str,
        schema: type[T],
        max_tokens: int = 4000,
    ) -> tuple[T, LLMResponse]:
        self.calls.append({"system": system, "user": user})
        if not self.script:
            raise LLMError("script épuisé")

        item = self.script.pop(0)
        if isinstance(item, Exception):
            raise item

        value = item if isinstance(item, schema) else schema.model_validate(item)
        meta = LLMResponse(
            model=self.model, input_tokens=1200, output_tokens=300,
            latency_ms=42, stop_reason="end_turn",
            raw_text=value.model_dump_json(),
        )
        return value, meta
