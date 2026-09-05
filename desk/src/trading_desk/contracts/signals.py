"""Sorties des agents. Un schema ferme par role.

Deux regles structurent ce module :

- Les agents LLM ne produisent jamais de chiffre qu'un calcul pourrait donner.
  L'agent Quant *interprete* des indicateurs calcules en code ; il ne les
  invente pas. L'agent News produit un score, pas une recommandation.
- Tout agent peut s'abstenir. `abstained=True` est une reponse valide et
  attendue. C'est ce qui empeche un modele en difficulte de fabriquer une
  conviction pour remplir un champ obligatoire (angle mort A-11).
"""

from __future__ import annotations

from decimal import Decimal
from typing import Literal

from pydantic import Field, model_validator

from .common import Bias, Frozen, Regime, Side, now_ms


class AgentOutput(Frozen):
    """Socle commun. `journal_ref` relie la sortie a son prompt complet."""

    agent: str
    produced_at_ms: int = Field(default_factory=now_ms)
    model_id: str = ""
    latency_ms: int = 0
    cost_usd: Decimal = Decimal("0")
    abstained: bool = False
    abstain_reason: str | None = None
    journal_ref: str = ""

    @model_validator(mode="after")
    def _abstention_is_explicit(self) -> AgentOutput:
        if self.abstained and not self.abstain_reason:
            raise ValueError("une abstention doit dire pourquoi")
        return self


class NewsRead(AgentOutput):
    """Sortie de l'agent News.

    Volontairement numerique. Le contenu externe est une donnee, jamais une
    instruction, et cet agent n'a aucun moyen d'exprimer "achete" (angle mort
    A-03) : le schema ne le permet pas.
    """

    agent: str = "news"
    sentiment: Decimal = Field(default=Decimal("0"), ge=-1, le=1)
    salience: Decimal = Field(default=Decimal("0"), ge=0, le=1)
    entities: tuple[str, ...] = ()
    event_class: Literal[
        "MACRO", "REGULATORY", "PROTOCOL", "SECURITY_INCIDENT",
        "LISTING", "LIQUIDATION_CASCADE", "NOISE",
    ] = "NOISE"
    source_reliability: Decimal = Field(default=Decimal("0"), ge=0, le=1)
    source_count: int = Field(default=0, ge=0)


class QuantRead(AgentOutput):
    """Interpretation d'indicateurs deja calcules.

    `inputs_digest` est l'empreinte des valeurs numeriques fournies a l'agent :
    elle permet de rejouer exactement la meme interpretation en audit.
    """

    agent: str = "quant"
    inputs_digest: str = ""
    divergences: tuple[str, ...] = ()
    momentum: Decimal = Field(default=Decimal("0"), ge=-1, le=1)
    stretch: Decimal = Field(
        default=Decimal("0"), ge=-1, le=1,
        description="Etirement par rapport a la moyenne. Positif = surachat.",
    )
    liquidity_note: str = ""


class RegimeRead(AgentOutput):
    agent: str = "regime"
    regime: Regime = Regime.UNKNOWN
    confidence: Decimal = Field(default=Decimal("0"), ge=0, le=1)
    strategies_allowed: tuple[str, ...] = ()


class AnalystView(AgentOutput):
    agent: str = "analyste"
    asset: str = ""
    bias: Bias = Bias.FLAT
    key_levels: tuple[Decimal, ...] = ()
    thesis_summary: str = Field(default="", max_length=600)
    invalidation_summary: str = Field(default="", max_length=300)


class SetupProposal(AgentOutput):
    """Candidat produit par l'agent Strategie. Ce n'est pas encore un mandat."""

    agent: str = "strategie"
    asset: str = ""
    side: Side | None = None
    entry_price: Decimal | None = Field(default=None, gt=0)
    stop_price: Decimal | None = Field(default=None, gt=0)
    target_price: Decimal | None = Field(default=None, gt=0)
    horizon_hours: Decimal = Field(default=Decimal("24"), gt=0, le=720)
    conviction: Decimal = Field(default=Decimal("0"), ge=0, le=1)
    rationale: str = Field(default="", max_length=800)

    @model_validator(mode="after")
    def _complete_if_proposing(self) -> SetupProposal:
        if self.abstained:
            return self
        missing = [
            n for n, v in (
                ("asset", self.asset), ("side", self.side),
                ("entry_price", self.entry_price), ("stop_price", self.stop_price),
            ) if not v
        ]
        if missing:
            raise ValueError(f"setup incomplet, champs manquants : {', '.join(missing)}")
        assert self.entry_price and self.stop_price and self.side
        wrong_side = (
            self.side is Side.LONG and self.stop_price >= self.entry_price
        ) or (
            self.side is Side.SHORT and self.stop_price <= self.entry_price
        )
        if wrong_side:
            raise ValueError("le stop est du mauvais cote de l'entree")
        return self

    @property
    def stop_distance_bps(self) -> Decimal | None:
        if self.entry_price is None or self.stop_price is None:
            return None
        return abs(self.entry_price - self.stop_price) / self.entry_price * Decimal("10000")

    @property
    def reward_risk(self) -> Decimal | None:
        if not (self.entry_price and self.stop_price and self.target_price):
            return None
        risk = abs(self.entry_price - self.stop_price)
        if risk == 0:
            return None
        return abs(self.target_price - self.entry_price) / risk


class CounterThesis(AgentOutput):
    """Avocat du diable. Peut faire echouer un setup, jamais en approuver un.

    Le schema ne contient aucun champ d'approbation : c'est la garantie
    structurelle, pas une consigne de prompt.
    """

    agent: str = "avocat_du_diable"
    targets_setup: str = ""
    severity: Decimal = Field(default=Decimal("0"), ge=0, le=1)
    objections: tuple[str, ...] = ()
    veto: bool = False


class RiskAdvice(AgentOutput):
    """Conseil de risque qualitatif. Strictement monotone : il ne sait que reduire.

    Les facteurs sont dans ]0, 1] et s'appliquent par multiplication au plafond
    calcule par le moteur de risque. Aucune valeur > 1 n'est representable.
    """

    agent: str = "risk_advisor"
    size_factor: Decimal = Field(default=Decimal("1"), gt=0, le=1)
    leverage_factor: Decimal = Field(default=Decimal("1"), gt=0, le=1)
    concerns: tuple[str, ...] = ()


class PostMortem(AgentOutput):
    """Analyse d'un trade clos. Alimente la memoire du desk.

    `primary_cause` est un ensemble FERME, et c'est le point du schema : des
    causes en texte libre ne se comptent pas. Avec un ensemble ferme, on
    apprend au bout de trente trades que 40 % des sorties sont des stops
    balayes par le bruit — ce qu'aucune prose ne fera jamais apparaitre.
    """

    agent: str = "post_mortem"
    primary_cause: Literal[
        "THESE_FAUSSE",          # la lecture de marche etait erronee
        "STOP_TROP_SERRE",       # sorti par le bruit, these encore valable
        "TIMING",                # bonne these, mauvais moment
        "REGIME_MAL_CLASSE",     # strategie inadaptee au regime reel
        "EVENEMENT_EXTERNE",     # choc imprevisible
        "EXECUTION",             # slippage, fill partiel, latence
        "COUTS",                 # frais et funding ont mange le gain
        "THESE_JUSTE",           # a fonctionne comme prevu
    ] = "THESE_FAUSSE"
    what_happened: str = Field(default="", max_length=400)
    lesson: str = Field(default="", max_length=300)
    would_take_again: bool = False
    tags: tuple[str, ...] = ()


class DeskVerdict(AgentOutput):
    """Decision du Chef de desk. Precede immediatement l'emission du mandat."""

    agent: str = "chef_de_desk"
    decision: Literal["APPROVE", "REJECT", "REDUCE"] = "REJECT"
    reasoning: str = Field(default="", max_length=1200)
    dissent_noted: tuple[str, ...] = ()
    size_factor: Decimal = Field(default=Decimal("1"), gt=0, le=1)
