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

import os
import time
from decimal import Decimal
from typing import Any, Protocol, TypeVar

from pydantic import BaseModel

from ..contracts.common import Frozen

T = TypeVar("T", bound=BaseModel)

DEFAULT_MODEL = "claude-opus-5"

# Le desk lit SA propre variable avant celle du SDK.
#
# `ANTHROPIC_API_KEY` est un nom reserve dans certains environnements
# d'execution — l'interface de Claude Code sur le web previent d'ailleurs
# qu'elle ne servira pas a authentifier les sessions. Selon la plateforme,
# elle peut etre ignoree, filtree, ou porter une identite qui n'est pas celle
# qu'on veut facturer. Un nom propre au projet supprime toute ambiguite : ce
# qu'on pose est ce qu'on utilise.
#
# Le repli sur `ANTHROPIC_API_KEY` reste, parce que c'est ce qu'un
# utilisateur pose spontanement sur sa propre machine.
API_KEY_VARS = ("DESK_ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY")

# Point d'entree officiel, fixe explicitement plutot qu'herite.
#
# `ANTHROPIC_BASE_URL` est souvent pose par l'outil qui execute le code, et
# peut pointer vers un relais qui lui appartient. Herite silencieusement, il
# enverrait la cle du desk a ce relais. On prefere une adresse explicite,
# surchargeable par une variable qui, elle, appartient au projet.
OFFICIAL_BASE_URL = "https://api.anthropic.com"


def desk_api_key() -> str | None:
    """La cle a utiliser, ou `None` si aucune n'est posee.

    `None` n'est pas une erreur : le SDK sait encore resoudre un profil
    `ant auth login` ou une federation d'identite. C'est a l'appelant de
    decider si l'absence de cle doit bloquer.
    """
    for var in API_KEY_VARS:
        value = os.environ.get(var, "").strip()
        if value:
            return value
    return None


def api_key_source() -> str:
    """Le NOM de la variable utilisee — jamais sa valeur.

    Sert au diagnostic : « la cle est-elle vue, et laquelle ». Renvoyer la
    valeur, meme tronquee, la ferait finir dans un journal ou une capture
    d'ecran.
    """
    for var in API_KEY_VARS:
        if os.environ.get(var, "").strip():
            return var
    return ""

# Tarifs par million de tokens, à la date d'écriture. À revalider : une grille
# périmée fausse le calcul de rentabilité, qui est la seule raison d'être de
# cette mesure.
PRICING_USD_PER_MTOK: dict[str, tuple[Decimal, Decimal]] = {
    "claude-opus-5": (Decimal("5"), Decimal("25")),
    "claude-sonnet-5": (Decimal("2"), Decimal("10")),
    "claude-haiku-4-5": (Decimal("1"), Decimal("5")),
}


# Ce que chaque modele accepte DANS LA REQUETE.
#
# Mesure contre l'API le 5 septembre 2026, pas deduite d'un numero de
# version. Haiku 4.5 refuse les deux parametres, avec deux 400 distincts :
#
#     thinking: {"type": "adaptive"}   -> « adaptive thinking is not
#                                          supported on this model »
#     output_config: {"effort": ...}   -> « This model does not support the
#                                          effort parameter. »
#
# Sans cette table, router un role vers Haiku ferait echouer 100 % de ses
# appels — l'agent s'abstiendrait a chaque cycle et la porte P3 lirait
# « qualite insuffisante » la ou le defaut est une requete mal formee.
CAPACITES: dict[str, frozenset[str]] = {
    "claude-opus-5": frozenset({"adaptive", "effort"}),
    "claude-sonnet-5": frozenset({"adaptive", "effort"}),
    "claude-haiku-4-5": frozenset(),
}

# Un modele absent de la table part sans rien. Le choix va dans le sens ou
# l'erreur est la moins couteuse : envoyer un parametre non supporte fait
# echouer TOUS les appels, ne pas l'envoyer fait seulement tourner le modele
# a son reglage par defaut. On degrade la finesse, jamais la disponibilite.
CAPACITES_INCONNUES: frozenset[str] = frozenset()


def capacites_de(model: str) -> frozenset[str]:
    """Les parametres de requete que ce modele accepte.

    Meme correspondance par prefixe que `tarif_de` : l'identifiant resolu
    (`claude-haiku-4-5-20251001`) doit retrouver sa ligne.
    """
    candidats = [k for k in CAPACITES if model.startswith(k)]
    if not candidats:
        return CAPACITES_INCONNUES
    return CAPACITES[max(candidats, key=len)]


def tarif_de(model: str) -> tuple[Decimal, Decimal] | None:
    """Les tarifs d'un identifiant de modele, ou `None` si inconnu.

    La correspondance se fait par prefixe le plus long, et pas par egalite
    stricte, parce que l'API renvoie l'identifiant RESOLU : on demande
    `claude-haiku-4-5`, elle repond `claude-haiku-4-5-20251001`. Une egalite
    stricte manquerait la ligne, le cout compterait pour zero, et le plafond
    de depense deviendrait inoperant sans rien dire — precisement le mode de
    panne que le comptage est cense empecher.

    Le prefixe le plus long, et non le premier trouve, pour qu'une future
    ligne `claude-opus-5-1` ne soit pas avalee par `claude-opus-5`.
    """
    candidats = [k for k in PRICING_USD_PER_MTOK if model.startswith(k)]
    if not candidats:
        return None
    return PRICING_USD_PER_MTOK[max(candidats, key=len)]


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
        return tarif_de(self.model) is not None

    @property
    def cost_usd(self) -> Decimal:
        rates = tarif_de(self.model)
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
        agent: str = "",
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

            kwargs: dict[str, Any] = {}
            if (key := desk_api_key()) is not None:
                kwargs["api_key"] = key
            kwargs["base_url"] = os.environ.get(
                "DESK_ANTHROPIC_BASE_URL", OFFICIAL_BASE_URL)
            # Sans clé explicite, on laisse le SDK résoudre lui-même :
            # `ANTHROPIC_API_KEY`, un profil `ant auth login`, ou une
            # fédération d'identité. Aucune clé n'est écrite en dur ni
            # journalisée, ici ou ailleurs.
            self._client = anthropic.Anthropic(**kwargs)
        return self._client

    def structured(
        self,
        *,
        system: str,
        user: str,
        schema: type[T],
        max_tokens: int = 4000,
        agent: str = "",
    ) -> tuple[T, LLMResponse]:
        # `agent` n'interesse pas ce client : il sert au routage en amont.
        # L'accepter ici evite que chaque appelant ait a savoir a qui il parle.
        client = self._lazy_client()
        started = time.monotonic()

        kwargs: dict[str, Any] = {
            "model": self.model,
            "max_tokens": max_tokens,
            "system": system,
            "messages": [{"role": "user", "content": user}],
            "output_format": schema,
        }
        # La réflexion adaptative est laissée active quand le modèle la
        # connaît : lire une structure de marché n'est pas une tâche de
        # classification triviale, et l'effort se règle plutôt par `effort`
        # que par sa désactivation. Sur un modèle qui l'ignore, l'envoyer
        # ferait échouer l'appel — voir `CAPACITES`.
        peut = capacites_de(self.model)
        if "adaptive" in peut:
            kwargs["thinking"] = {"type": "adaptive"}
        if "effort" in peut:
            kwargs["output_config"] = {"effort": self.effort}

        try:
            response = client.messages.parse(**kwargs)
        except Exception as exc:  # remonté typé au-dessus
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



class RoutedLLM:
    """Un modele par role, selon une `ModelPolicy`.

    Deux raisons de decorreler les modeles, et elles ne se confondent pas :

    **Le cout.** Les sept agents ne font pas le meme travail. Interpreter des
    indicateurs deja calcules est mecanique ; trancher entre une proposition
    et son objection ne l'est pas. Payer le meme prix pour les deux revient a
    financer la delegation la plus chere sur la tache la plus simple. Mesure
    sur la porte P3 : la sortie represente 61 % de la facture, et le Chef de
    desk coute cinq fois le Regime par appel.

    **La diversite d'erreur.** Sept instances du meme modele produisent sept
    erreurs correlees, pas une diversite d'avis. Un modele different sur
    l'Avocat du diable rend son objection moins dependante des angles morts
    du modele principal — c'est le seul agent dont la valeur vient de son
    desaccord.

    Ce client n'arbitre pas : il applique la politique qu'on lui donne. Le
    choix des modeles reste celui de l'utilisateur.
    """

    def __init__(self, policy: Any, *, effort: str = "medium",
                 factory: Any = None) -> None:
        self.policy = policy
        self.effort = effort
        self._factory = factory or (lambda m: AnthropicLLM(model=m, effort=effort))
        self._clients: dict[str, Any] = {}
        # Un client par MODELE distinct, pas par agent : deux agents sur le
        # meme modele partagent la connexion et son cache.
        self._par_agent = {
            "news": policy.news, "quant": policy.quant, "regime": policy.regime,
            "analyste": policy.analyste, "strategie": policy.strategie,
            "avocat_du_diable": policy.avocat,
            "risk_advisor": policy.risk_advisor, "chef_de_desk": policy.chef,
            "post_mortem": policy.post_mortem,
        }

    def modele_de(self, agent: str) -> str:
        """Le modele affecte a cet agent. Inconnu => le modele du Chef.

        Retomber sur le Chef plutot que sur un defaut global est delibere :
        un agent non repertorie est une erreur de cablage, et la faire tomber
        sur le modele le plus capable evite qu'elle degrade silencieusement
        une decision.
        """
        return self._par_agent.get(agent, self.policy.chef)

    def structured(self, *, system: str, user: str, schema: type[T],
                   max_tokens: int = 4000, agent: str = "") -> tuple[T, LLMResponse]:
        modele = self.modele_de(agent)
        if modele not in self._clients:
            self._clients[modele] = self._factory(modele)
        return self._clients[modele].structured(
            system=system, user=user, schema=schema, max_tokens=max_tokens)


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
        agent: str = "",
    ) -> tuple[T, LLMResponse]:
        self.calls.append({"system": system, "user": user, "agent": agent})
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
