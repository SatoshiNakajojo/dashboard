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
from ..features.indicators import Series, atr, closes, donchian, ema, rsi


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



class TurtleBreakout:
    """Cassure de canal Donchian — le « Systeme 2 » des Turtles.

    Regles d'origine (Dennis & Eckhardt, 1983), transposees telles quelles :
    entree sur cassure du plus haut/bas de `entry_period`, sortie sur cassure
    OPPOSEE de `exit_period`, stop a 2N ou N est l'ATR. Le Systeme 2 est
    retenu plutot que le Systeme 1 parce qu'il ne comporte pas la regle de
    saut (« ne pas prendre l'entree si la precedente etait gagnante ») : cette
    regle suppose de connaitre l'issue du trade precedent, ce qui rend le
    backtest dependant de son propre historique et la comparaison moins nette.

    **Les periodes sont en BARRES, pas en jours.** C'est au parametrage de les
    convertir, et ce n'est pas un detail : la meme regle rend +36 % en daily
    et -55 % en 30 minutes sur BTC. Un canal de 55 barres en 1 h couvre deux
    jours, pas cinquante-cinq — ce n'est plus la strategie documentee, c'est
    une strategie de cassure intraday, dont rien ne dit qu'elle marche.

    Aucune cible : une strategie de suivi de tendance gagne sur les rares
    trades qui courent longtemps. Poser une cible les coupe et transforme le
    profil de gain en son inverse.
    """

    name = "turtle_breakout"

    def __init__(self, entry_period: int = 55, exit_period: int = 20,
                 atr_period: int = 20, atr_stop: float = 2.0) -> None:
        self.entry_period, self.exit_period = entry_period, exit_period
        self.atr_period, self.atr_stop = atr_period, atr_stop
        self._eh: Series = []
        self._el: Series = []
        self._xh: Series = []
        self._xl: Series = []
        self._atr: Series = []

    def prepare(self, bars: list[Bar]) -> None:
        self._eh, self._el = donchian(bars, self.entry_period)
        self._xh, self._xl = donchian(bars, self.exit_period)
        self._atr = atr(bars, self.atr_period)

    def on_bar(self, i: int, bars: list[Bar], in_position: Side | None) -> Signal:
        eh, el, xh, xl, a = (self._eh[i], self._el[i], self._xh[i],
                             self._xl[i], self._atr[i])
        if None in (eh, el, xh, xl, a) or not a:
            return FLAT

        close = bars[i].close
        span = Decimal(str(a)) * Decimal(str(self.atr_stop))

        # Sortie d'abord : une cassure opposee annule la these, et la tester
        # avant l'entree evite d'inverser la position dans la meme barre.
        if in_position is Side.LONG and float(close) < xl:
            return Signal(exit_now=True, note=f"cassure basse {self.exit_period}")
        if in_position is Side.SHORT and float(close) > xh:
            return Signal(exit_now=True, note=f"cassure haute {self.exit_period}")
        if in_position is not None:
            return FLAT

        if float(close) > eh:
            return Signal(side=Side.LONG, stop_price=close - span,
                          note=f"cassure haute {self.entry_period}")
        if float(close) < el:
            return Signal(side=Side.SHORT, stop_price=close + span,
                          note=f"cassure basse {self.entry_period}")
        return FLAT


class TimeSeriesMomentum:
    """Momentum temporel : on suit le signe du rendement passe.

    La regle la mieux documentee de la famille — Moskowitz, Ooi & Pedersen
    (2012) sur douze classes d'actifs, Liu & Tsyvinski (2018, 2021) sur BTC,
    ETH et XRP, ou l'effet est mesure sur des horizons d'une a quatre
    semaines et le rendement courant predit jusqu'a huit semaines.

    Le signal est le signe de `close[i] / close[i - lookback] - 1`. Rien
    d'autre : ni seuil, ni filtre, ni optimisation de parametre. C'est
    volontaire — une baseline dont on a choisi les parametres sur les memes
    donnees qu'on lui fait battre ne mesure plus rien.

    On ne retourne la position que lorsque le signe change, ce qui donne un
    turnover tres bas. Sur ce desk ce n'est pas un detail esthetique : a
    0,287 $ de couts par trade pour 1000 USDC de capital, le turnover est le
    premier poste de destruction du rendement brut.
    """

    name = "tsmom"

    def __init__(self, lookback: int = 168, atr_period: int = 20,
                 atr_stop: float = 3.0) -> None:
        self.lookback = lookback
        self.atr_period, self.atr_stop = atr_period, atr_stop
        self._atr: Series = []

    def prepare(self, bars: list[Bar]) -> None:
        self._atr = atr(bars, self.atr_period)

    def _sens(self, i: int, bars: list[Bar]) -> Side | None:
        if i < self.lookback:
            return None
        passe = bars[i - self.lookback].close
        if passe <= 0:
            return None
        variation = bars[i].close / passe - 1
        if variation > 0:
            return Side.LONG
        if variation < 0:
            return Side.SHORT
        return None

    def on_bar(self, i: int, bars: list[Bar], in_position: Side | None) -> Signal:
        a = self._atr[i]
        sens = self._sens(i, bars)
        if a is None or not a or sens is None:
            return FLAT

        if in_position is not None:
            if in_position is not sens:
                return Signal(exit_now=True, note="le signe du momentum a change")
            return FLAT

        close = bars[i].close
        span = Decimal(str(a)) * Decimal(str(self.atr_stop))
        signe = "+" if sens is Side.LONG else "-"
        return Signal(
            side=sens,
            stop_price=close - span if sens is Side.LONG else close + span,
            note=f"momentum {signe} sur {self.lookback} barres",
        )


# Les strategies actives. `buy_and_hold` n'y figure pas : ce n'est pas une
# strategie mais une reference, calculee par `engine.benchmark_buy_and_hold`
# qui ne lui impose ni stop ni dimensionnement par le risque.
BASELINES: dict[str, type] = {
    "ema_cross": EmaCross,
    "rsi_reversion": RsiReversion,
    "turtle_breakout": TurtleBreakout,
    "tsmom": TimeSeriesMomentum,
}
