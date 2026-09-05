"""Le mandat : le contrat unique entre la couche cognitive et l'execution.

C'est la piece centrale de l'architecture. Les agents LLM ne decident jamais
d'un trade ; ils emettent un mandat. La couche deterministe n'a le droit de
faire que ce que le mandat autorise, et rien d'autre.

Trois proprietes non negociables :

1. Il est *borne*. Notionnel, levier, univers d'actifs, distance de stop : tout
   est plafonne dans l'objet lui-meme.
2. Il est *perissable*. Passe son TTL, il est mort : plus aucune entree, seule
   la gestion des positions existantes reste permise.
3. Il ne contient *pas* de prose. Le raisonnement vit dans le journal de
   decisions, reference par `journal_ref`. Un mandat doit tenir dans un log.
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Literal

from pydantic import Field, field_validator, model_validator

from .common import Bias, EntryStyle, Frozen, Regime, Side, now_ms

MANDATE_SCHEMA_VERSION = "1.0"

# Un mandat qui vivrait des heures serait un mandat qu'on oublie de reevaluer.
MAX_TTL_MS = 4 * 60 * 60 * 1000  # 4 h
MIN_TTL_MS = 30 * 1000           # 30 s


class StopBand(Frozen):
    """Fourchette de distance de stop acceptable, en points de base du prix.

    Borner par le bas evite les stops collés qui se font balayer par le bruit ;
    borner par le haut evite qu'un agent justifie une perte enorme par un
    "stop large".
    """

    min_bps: Decimal = Field(gt=0, le=5000)
    max_bps: Decimal = Field(gt=0, le=5000)

    @model_validator(mode="after")
    def _ordered(self) -> StopBand:
        if self.min_bps >= self.max_bps:
            raise ValueError("stop_band.min_bps doit etre strictement inferieur a max_bps")
        return self

    def contains(self, distance_bps: Decimal) -> bool:
        return self.min_bps <= distance_bps <= self.max_bps


class EntryPlan(Frozen):
    """Comment l'executeur a le droit d'entrer. Pas *quand* : c'est son travail."""

    style: EntryStyle = EntryStyle.LIMIT_PASSIVE
    max_slippage_bps: Decimal = Field(default=Decimal("10"), gt=0, le=200)
    max_clip_pct: Decimal = Field(
        default=Decimal("100"),
        gt=0,
        le=100,
        description="Taille max d'un clip en % du notionnel du mandat (decoupage).",
    )


class Invalidation(Frozen):
    """Condition factuelle qui tue le mandat avant son TTL.

    Volontairement limitee a des faits mesurables par la couche deterministe.
    Pas de "si le sentiment se degrade" : personne ne sait l'evaluer en code.
    """

    kind: Literal[
        "PRICE_BELOW",
        "PRICE_ABOVE",
        "FUNDING_ABOVE_BPS",
        "REGIME_CHANGED",
        "SPREAD_ABOVE_BPS",
    ]
    asset: str | None = None
    value: Decimal | None = None

    @model_validator(mode="after")
    def _value_required(self) -> Invalidation:
        if self.kind != "REGIME_CHANGED" and self.value is None:
            raise ValueError(f"invalidation {self.kind} exige une valeur")
        if self.kind.startswith("PRICE_") and not self.asset:
            raise ValueError(f"invalidation {self.kind} exige un actif")
        return self


class Mandate(Frozen):
    """Ce que le Chef de desk emet, et la seule chose que l'execution ecoute."""

    schema_version: Literal["1.0"] = MANDATE_SCHEMA_VERSION
    mandate_id: str = Field(default_factory=lambda: f"mdt_{uuid.uuid4().hex[:16]}")
    issued_at_ms: int = Field(default_factory=now_ms)
    ttl_ms: int = Field(default=20 * 60 * 1000, ge=MIN_TTL_MS, le=MAX_TTL_MS)
    issued_by: str = "chef_de_desk"

    # --- ce que le desk croit ---
    regime: Regime = Regime.UNKNOWN
    bias: Bias = Bias.FLAT
    conviction: Decimal = Field(default=Decimal("0"), ge=0, le=1)

    # --- ce que l'execution a le droit de faire ---
    universe: tuple[str, ...] = ()
    max_notional_usd: Decimal = Field(default=Decimal("0"), ge=0)
    max_leverage: Decimal = Field(default=Decimal("1"), ge=Decimal("1"), le=Decimal("20"))
    max_concurrent_positions: int = Field(default=0, ge=0, le=20)
    stop_band: StopBand = StopBand(min_bps=Decimal("30"), max_bps=Decimal("500"))
    entry: EntryPlan = EntryPlan()
    invalidations: tuple[Invalidation, ...] = ()

    # --- tracabilite ---
    journal_ref: str = Field(
        default="",
        description="Identifiant de l'entree du journal de decisions qui porte "
        "prompts, versions de modeles et sorties intermediaires.",
    )

    @field_validator("universe")
    @classmethod
    def _upper_unique(cls, v: tuple[str, ...]) -> tuple[str, ...]:
        out = tuple(dict.fromkeys(a.strip().upper() for a in v if a.strip()))
        if len(out) > 20:
            raise ValueError("univers limite a 20 actifs")
        return out

    @model_validator(mode="after")
    def _coherent(self) -> Mandate:
        """Un mandat directionnel sans moyens est une erreur de programmation,
        pas une intention. On l'attrape ici plutot qu'a l'execution."""
        if self.bias is Bias.FLAT:
            if self.max_notional_usd != 0 or self.universe or self.max_concurrent_positions:
                raise ValueError(
                    "un mandat FLAT ne peut porter ni notionnel, ni univers, ni positions"
                )
        else:
            if not self.universe:
                raise ValueError("un mandat directionnel exige un univers non vide")
            if self.max_notional_usd <= 0:
                raise ValueError("un mandat directionnel exige un notionnel > 0")
            if self.max_concurrent_positions < 1:
                raise ValueError("un mandat directionnel exige au moins 1 position")
        return self

    # ------------------------------------------------------------------ etat

    @property
    def expires_at_ms(self) -> int:
        return self.issued_at_ms + self.ttl_ms

    def is_expired(self, at_ms: int | None = None) -> bool:
        return (at_ms if at_ms is not None else now_ms()) >= self.expires_at_ms

    def remaining_ms(self, at_ms: int | None = None) -> int:
        return max(0, self.expires_at_ms - (at_ms if at_ms is not None else now_ms()))

    def allows_entry(self, asset: str, side: Side, at_ms: int | None = None) -> bool:
        """Seul point d'entree pour demander "ai-je le droit ?".

        Volontairement conservateur : tout ce qui n'est pas explicitement
        autorise est refuse.
        """
        if self.is_expired(at_ms):
            return False
        if self.bias is Bias.FLAT:
            return False
        if self.bias.side is not side:
            return False
        return asset.strip().upper() in self.universe

    # ------------------------------------------------------------ fabriques

    @classmethod
    def flat(cls, *, journal_ref: str = "", ttl_ms: int = 15 * 60 * 1000) -> Mandate:
        """L'action par defaut du desk.

        Emise quand le debat n'atteint pas le seuil de preuve, quand un agent
        s'abstient, ou quand le quota de mandats du jour est epuise. Un desk
        qui n'a rien a dire doit pouvoir le dire.
        """
        return cls(bias=Bias.FLAT, ttl_ms=ttl_ms, journal_ref=journal_ref)

    def tightened(
        self,
        *,
        max_notional_usd: Decimal | None = None,
        max_leverage: Decimal | None = None,
        max_concurrent_positions: int | None = None,
    ) -> Mandate:
        """Resserrage monotone : `min()`, jamais `max()`.

        C'est le seul canal par lequel le Risk Advisor (LLM) influence le
        mandat. Meme si le modele hallucine un notionnel dix fois superieur,
        cette methode ne peut que reduire.
        """
        return self.model_copy(
            update={
                "max_notional_usd": min(self.max_notional_usd, max_notional_usd)
                if max_notional_usd is not None
                else self.max_notional_usd,
                "max_leverage": min(self.max_leverage, max_leverage)
                if max_leverage is not None
                else self.max_leverage,
                "max_concurrent_positions": min(
                    self.max_concurrent_positions, max_concurrent_positions
                )
                if max_concurrent_positions is not None
                else self.max_concurrent_positions,
            }
        )
