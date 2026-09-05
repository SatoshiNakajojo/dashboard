"""Types partages par tous les contrats du desk.

Regle du projet : aucune valeur qui traverse une frontiere de couche n'est un
dict libre. Tout est un modele Pydantic valide. Un agent qui ne sait pas
produire un schema valide est traite comme une abstention, jamais comme un
defaut implicite.
"""

from __future__ import annotations

import time
from decimal import Decimal
from enum import Enum

from pydantic import BaseModel, ConfigDict


def now_ms() -> int:
    """Horodatage unix en millisecondes.

    Utilise partout SAUF pour les nonces d'exchange, qui passent par
    execution.nonce.NonceSource et sa garantie de monotonie stricte.
    """
    return int(time.time() * 1000)


class Frozen(BaseModel):
    """Base immuable et stricte pour tous les contrats.

    `extra="forbid"` est deliberé : une sortie de LLM qui invente un champ doit
    echouer bruyamment, pas etre silencieusement ignoree.
    """

    model_config = ConfigDict(frozen=True, extra="forbid", str_strip_whitespace=True)


class Side(str, Enum):
    LONG = "LONG"
    SHORT = "SHORT"


class Bias(str, Enum):
    """Direction autorisee par un mandat. FLAT est l'etat par defaut du desk."""

    LONG = "LONG"
    SHORT = "SHORT"
    FLAT = "FLAT"

    @property
    def side(self) -> Side | None:
        if self is Bias.LONG:
            return Side.LONG
        if self is Bias.SHORT:
            return Side.SHORT
        return None


class Regime(str, Enum):
    TREND_UP = "TREND_UP"
    TREND_DOWN = "TREND_DOWN"
    RANGE = "RANGE"
    HIGH_VOL = "HIGH_VOL"
    STRESS = "STRESS"
    UNKNOWN = "UNKNOWN"


class EntryStyle(str, Enum):
    LIMIT_PASSIVE = "LIMIT_PASSIVE"
    LIMIT_AGGRESSIVE = "LIMIT_AGGRESSIVE"
    MARKET_IOC = "MARKET_IOC"


class DeskMode(str, Enum):
    """Mode d'execution global. Une seule valeur engage de l'argent reel."""

    SHADOW = "SHADOW"      # les mandats sont journalises, rien n'est execute
    PAPER = "PAPER"        # execution simulee contre le carnet reel
    TESTNET = "TESTNET"    # ordres reels sur le testnet Hyperliquid
    LIVE = "LIVE"          # argent reel

    @property
    def sends_orders(self) -> bool:
        return self in (DeskMode.TESTNET, DeskMode.LIVE)

    @property
    def is_real_money(self) -> bool:
        return self is DeskMode.LIVE


class HaltReason(str, Enum):
    """Causes possibles d'un arret. Toutes sont des faits, jamais des opinions."""

    MANUAL = "MANUAL"
    DAILY_LOSS_LIMIT = "DAILY_LOSS_LIMIT"
    STALE_FEED = "STALE_FEED"
    PRICE_DIVERGENCE = "PRICE_DIVERGENCE"
    CLOCK_DRIFT = "CLOCK_DRIFT"
    RECONCILIATION_FAILED = "RECONCILIATION_FAILED"
    ORDER_RATE_EXCEEDED = "ORDER_RATE_EXCEEDED"
    UNPROTECTED_POSITION = "UNPROTECTED_POSITION"
    MARGIN_CRITICAL = "MARGIN_CRITICAL"
    API_ERROR_BURST = "API_ERROR_BURST"
    REQUEST_BUDGET_EXHAUSTED = "REQUEST_BUDGET_EXHAUSTED"


def bps(value: Decimal | float | int) -> Decimal:
    """Convertit des points de base en fraction. 25 bps -> 0.0025."""
    return Decimal(str(value)) / Decimal("10000")
