"""Strategies baseline. Aucune IA.

Leur role n'est pas de gagner de l'argent : c'est de **fixer la reference que
le desk multi-agents devra battre**. Sans ce chiffre, "est-ce que les agents
apportent quelque chose" reste une question d'opinion.

Chaque strategie emet un `Signal` par barre. Elle ne connait ni la taille de
position, ni les frais, ni le capital : le dimensionnement appartient au
moteur de risque, exactement comme en live. C'est ce qui rend la comparaison
honnete — seule la logique d'entree change entre baseline et desk.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Protocol

from pydantic import Field

from ..contracts.common import Frozen, Side
from ..features.bars import Bar
from ..features.indicators import atr, closes, ema, rsi


class Signal(Frozen):
    """Intention d'une strategie sur une barre. `None` en side = ne rien faire."""

    side: Side | None = None
    stop_price: Decimal | None = Field(default=None, gt=0)
    target_price: Decimal | None = Field(default=None, gt=0)
    exit_now: bool = False
    note: str = ""


FLAT = Signal()


class Strategy(Protocol):
    name: str

    def prepare(self, bars: list[Bar]) -> None:
        """Precalcule les indicateurs sur toute la serie, une seule fois."""

    def on_bar(self, i: int, bars: list[Bar], in_position: Side | None) -> Signal:
        """Decide a la barre `i`, en ne lisant QUE les barres <= i."""


class EmaCross:
    """Croisement de moyennes mobiles. La baseline de tendance classique.

    Stop et cible derives de l'ATR : la distance s'adapte a la volatilite
    plutot que d'etre un pourcentage arbitraire qui devient absurde quand le
    regime change.
    """

    name = "ema_cross"

    def __init__(self, fast: int = 20, slow: int = 50, atr_period: int = 14,
                 atr_stop: float = 2.0, atr_target: float = 3.0) -> None:
        self.fast, self.slow = fast, slow
        self.atr_period, self.atr_stop, self.atr_target = atr_period, atr_stop, atr_target
        self._fast: list[float | None] = []
        self._slow: list[float | None] = []
        self._atr: list[float | None] = []

    def prepare(self, bars: list[Bar]) -> None:
        px = closes(bars)
        self._fast = ema(px, self.fast)
        self._slow = ema(px, self.slow)
        self._atr = atr(bars, self.atr_period)

    def on_bar(self, i: int, bars: list[Bar], in_position: Side | None) -> Signal:
        if i == 0:
            return FLAT
        f, s = self._fast[i], self._slow[i]
        pf, ps = self._fast[i - 1], self._slow[i - 1]
        a = self._atr[i]
        if None in (f, s, pf, ps, a) or not a:
            return FLAT

        crossed_up = pf <= ps and f > s
        crossed_down = pf >= ps and f < s
        close = bars[i].close
        span = Decimal(str(a))

        if in_position is Side.LONG and crossed_down:
            return Signal(exit_now=True, note="croisement baissier")
        if in_position is Side.SHORT and crossed_up:
            return Signal(exit_now=True, note="croisement haussier")
        if in_position is not None:
            return FLAT

        if crossed_up:
            return Signal(
                side=Side.LONG,
                stop_price=close - span * Decimal(str(self.atr_stop)),
                target_price=close + span * Decimal(str(self.atr_target)),
                note="croisement haussier",
            )
        if crossed_down:
            return Signal(
                side=Side.SHORT,
                stop_price=close + span * Decimal(str(self.atr_stop)),
                target_price=close - span * Decimal(str(self.atr_target)),
                note="croisement baissier",
            )
        return FLAT


class RsiReversion:
    """Retour a la moyenne sur RSI. La baseline de range.

    Volontairement d'une famille opposee a EmaCross : une seule baseline de
    tendance donnerait une reference qui ne tient que dans un seul regime.
    """

    name = "rsi_reversion"

    def __init__(self, period: int = 14, low: float = 30.0, high: float = 70.0,
                 exit_level: float = 50.0, atr_period: int = 14,
                 atr_stop: float = 2.5) -> None:
        self.period, self.low, self.high = period, low, high
        self.exit_level = exit_level
        self.atr_period, self.atr_stop = atr_period, atr_stop
        self._rsi: list[float | None] = []
        self._atr: list[float | None] = []

    def prepare(self, bars: list[Bar]) -> None:
        self._rsi = rsi(closes(bars), self.period)
        self._atr = atr(bars, self.atr_period)

    def on_bar(self, i: int, bars: list[Bar], in_position: Side | None) -> Signal:
        r, a = self._rsi[i], self._atr[i]
        if r is None or a is None or not a:
            return FLAT
        close = bars[i].close
        span = Decimal(str(a)) * Decimal(str(self.atr_stop))

        if in_position is Side.LONG and r >= self.exit_level:
            return Signal(exit_now=True, note=f"RSI revenu a {r:.0f}")
        if in_position is Side.SHORT and r <= self.exit_level:
            return Signal(exit_now=True, note=f"RSI revenu a {r:.0f}")
        if in_position is not None:
            return FLAT

        if r <= self.low:
            return Signal(side=Side.LONG, stop_price=close - span,
                          target_price=close + span, note=f"RSI {r:.0f}")
        if r >= self.high:
            return Signal(side=Side.SHORT, stop_price=close + span,
                          target_price=close - span, note=f"RSI {r:.0f}")
        return FLAT


# Les strategies actives. `buy_and_hold` n'y figure pas : ce n'est pas une
# strategie mais une reference, calculee par `engine.benchmark_buy_and_hold`
# qui ne lui impose ni stop ni dimensionnement par le risque.
BASELINES: dict[str, type] = {
    "ema_cross": EmaCross,
    "rsi_reversion": RsiReversion,
}
