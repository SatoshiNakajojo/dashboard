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


def _stop(close: Decimal, span: Decimal, side: Side) -> Decimal | None:
    """Le stop derive de l'ATR, ou `None` s'il n'a pas de sens.

    Sur un actif dont l'ATR approche le prix — un actif a petit nominal en
    forte volatilite — `close - k*ATR` passe sous zero. `Signal.stop_price`
    exige `> 0` : emettre cette valeur fait remonter une ValidationError et
    arrete le backtest au milieu de la serie.

    Une strategie qui ne sait pas ou poser son stop ne doit pas prendre la
    position. S'abstenir est la reponse correcte, pas ecreter a un prix
    plancher arbitraire qui inventerait une distance de risque.
    """
    prix = close - span if side is Side.LONG else close + span
    return prix if prix > 0 else None




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

        ecart = span * Decimal(str(self.atr_stop))
        cible = span * Decimal(str(self.atr_target))
        if crossed_up and (st := _stop(close, ecart, Side.LONG)):
            return Signal(side=Side.LONG, stop_price=st,
                          target_price=close + cible, note="croisement haussier")
        if crossed_down and (st := _stop(close, ecart, Side.SHORT)):
            cible_bas = close - cible
            return Signal(side=Side.SHORT, stop_price=st,
                          target_price=cible_bas if cible_bas > 0 else None,
                          note="croisement baissier")
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

        if r <= self.low and (st := _stop(close, span, Side.LONG)):
            return Signal(side=Side.LONG, stop_price=st,
                          target_price=close + span, note=f"RSI {r:.0f}")
        if r >= self.high and (st := _stop(close, span, Side.SHORT)):
            bas = close - span
            return Signal(side=Side.SHORT, stop_price=st,
                          target_price=bas if bas > 0 else None,
                          note=f"RSI {r:.0f}")
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

        if float(close) > eh and (st := _stop(close, span, Side.LONG)):
            return Signal(side=Side.LONG, stop_price=st,
                          note=f"cassure haute {self.entry_period}")
        if float(close) < el and (st := _stop(close, span, Side.SHORT)):
            return Signal(side=Side.SHORT, stop_price=st,
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
        st = _stop(close, span, sens)
        if st is None:
            return FLAT
        signe = "+" if sens is Side.LONG else "-"
        return Signal(side=sens, stop_price=st,
                      note=f"momentum {signe} sur {self.lookback} barres")



class FundingExtreme:
    """Contrarien sur le taux de financement — la seule famille que le depot
    ne pouvait pas tester avant que `api.hyperliquid.xyz` redevienne joignable.

    `docs/macro-momentum-crypto-onchain.md` : un funding fortement positif et
    persistant signale un marche sur-effet-de-levier a l'achat, mur pour une
    cascade de liquidations baissiere (long squeeze). Fortement negatif,
    l'inverse. On prend donc le SENS OPPOSE a la foule endettee.

    C'est structurellement different des quatre autres baselines : le signal
    ne vient pas du prix mais du **positionnement**. Un prix qui monte ne dit
    pas si la hausse est portee par des acheteurs comptants ou par du levier ;
    le funding, si.

    `funding_par_barre` doit etre aligne sur `bars`, en bps par barre. La
    strategie ne recalcule rien : elle interprete une serie fournie, comme
    l'agent Quant interprete des indicateurs deja calcules.
    """

    name = "funding_extreme"

    def __init__(self, funding_par_barre: list[float] | None = None,
                 lookback: int = 42, seuil_z: float = 1.5,
                 atr_period: int = 20, atr_stop: float = 2.5) -> None:
        self.funding = funding_par_barre or []
        self.lookback = lookback
        self.seuil_z = seuil_z
        self.atr_period, self.atr_stop = atr_period, atr_stop
        self._atr: Series = []
        self._z: Series = []

    def prepare(self, bars: list[Bar]) -> None:
        self._atr = atr(bars, self.atr_period)
        self._z = [None] * len(bars)
        if len(self.funding) < len(bars):
            return
        for i in range(self.lookback, len(bars)):
            fenetre = self.funding[i - self.lookback:i]
            moyenne = sum(fenetre) / len(fenetre)
            var = sum((x - moyenne) ** 2 for x in fenetre) / len(fenetre)
            ecart = var ** 0.5
            if ecart > 0:
                self._z[i] = (self.funding[i] - moyenne) / ecart

    def on_bar(self, i: int, bars: list[Bar], in_position: Side | None) -> Signal:
        z, a = self._z[i], self._atr[i]
        if z is None or a is None or not a:
            return FLAT

        # Sortie des que l'exces se resorbe : la these est que le
        # desequilibre se corrige, pas qu'une tendance s'installe.
        if in_position is not None:
            if abs(z) < 0.5:
                return Signal(exit_now=True, note="funding revenu a la normale")
            return FLAT

        close = bars[i].close
        span = Decimal(str(a)) * Decimal(str(self.atr_stop))
        if z > self.seuil_z and (st := _stop(close, span, Side.SHORT)):
            return Signal(side=Side.SHORT, stop_price=st,
                          note=f"funding +{z:.1f} ecarts — longs surendettes")
        if z < -self.seuil_z and (st := _stop(close, span, Side.LONG)):
            return Signal(side=Side.LONG, stop_price=st,
                          note=f"funding {z:.1f} ecarts — shorts surendettes")
        return FLAT


# Les strategies actives. `buy_and_hold` n'y figure pas : ce n'est pas une
# strategie mais une reference, calculee par `engine.benchmark_buy_and_hold`
# qui ne lui impose ni stop ni dimensionnement par le risque.
BASELINES: dict[str, type] = {
    "ema_cross": EmaCross,
    "rsi_reversion": RsiReversion,
    "turtle_breakout": TurtleBreakout,
    "tsmom": TimeSeriesMomentum,
}
