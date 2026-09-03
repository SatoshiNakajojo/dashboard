"""Indicateurs techniques, ecrits a la main.

Pourquoi ne pas prendre une bibliotheque : parce que les implementations
divergent sur des details qui changent les resultats. Le RSI se lisse en
moyenne de Wilder chez les uns, en EMA classique chez les autres ; l'ATR
demarre parfois sur une moyenne simple, parfois sur la premiere valeur. Ces
ecarts ne se voient pas a l'oeil et produisent un backtest qui ne correspond
pas au live.

Vingt lignes par indicateur, testees contre des valeurs connues, valent mieux
qu'une dependance dont on ne sait pas quelle convention elle applique.

Convention commune : chaque fonction renvoie une liste de la MEME longueur que
l'entree, avec `None` tant que la fenetre n'est pas remplie. Jamais de
troncature silencieuse — un decalage d'index entre un indicateur et les prix
est un bug de backtest classique et invisible.
"""

from __future__ import annotations

from collections.abc import Sequence

from .bars import Bar

Series = list[float | None]


def closes(bars: Sequence[Bar]) -> list[float]:
    return [float(b.close) for b in bars]


# --------------------------------------------------------------------------
#  Moyennes
# --------------------------------------------------------------------------

def sma(values: Sequence[float], period: int) -> Series:
    if period < 1:
        raise ValueError("period doit etre >= 1")
    out: Series = [None] * len(values)
    total = 0.0
    for i, v in enumerate(values):
        total += v
        if i >= period:
            total -= values[i - period]
        if i >= period - 1:
            out[i] = total / period
    return out


def ema(values: Sequence[float], period: int) -> Series:
    """EMA amorcee par une SMA sur la premiere fenetre.

    L'amorcage compte : demarrer sur la premiere valeur donne une serie qui
    met des dizaines de barres a converger, et les premiers signaux d'un
    backtest sont alors du bruit d'initialisation.
    """
    if period < 1:
        raise ValueError("period doit etre >= 1")
    out: Series = [None] * len(values)
    if len(values) < period:
        return out
    k = 2.0 / (period + 1)
    prev = sum(values[:period]) / period
    out[period - 1] = prev
    for i in range(period, len(values)):
        prev = values[i] * k + prev * (1 - k)
        out[i] = prev
    return out


def wilder(values: Sequence[float], period: int) -> Series:
    """Lissage de Wilder (alpha = 1/period), utilise par le RSI et l'ATR."""
    out: Series = [None] * len(values)
    if len(values) < period:
        return out
    prev = sum(values[:period]) / period
    out[period - 1] = prev
    for i in range(period, len(values)):
        prev = (prev * (period - 1) + values[i]) / period
        out[i] = prev
    return out


# --------------------------------------------------------------------------
#  Oscillateurs
# --------------------------------------------------------------------------

def rsi(values: Sequence[float], period: int = 14) -> Series:
    """RSI de Wilder. Convention d'origine, pas la variante EMA."""
    out: Series = [None] * len(values)
    if len(values) < period + 1:
        return out

    gains = [0.0] * len(values)
    losses = [0.0] * len(values)
    for i in range(1, len(values)):
        delta = values[i] - values[i - 1]
        gains[i] = max(delta, 0.0)
        losses[i] = max(-delta, 0.0)

    avg_gain = sum(gains[1 : period + 1]) / period
    avg_loss = sum(losses[1 : period + 1]) / period
    out[period] = _rsi_value(avg_gain, avg_loss)

    for i in range(period + 1, len(values)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        out[i] = _rsi_value(avg_gain, avg_loss)
    return out


def _rsi_value(avg_gain: float, avg_loss: float) -> float:
    # Aucune perte sur la fenetre : le RSI vaut 100 par definition, et diviser
    # par zero serait une facon peu elegante de l'apprendre.
    if avg_loss == 0:
        return 100.0 if avg_gain > 0 else 50.0
    return 100.0 - 100.0 / (1.0 + avg_gain / avg_loss)


def macd(
    values: Sequence[float], fast: int = 12, slow: int = 26, signal: int = 9
) -> tuple[Series, Series, Series]:
    """Renvoie (macd, signal, histogramme).

    La ligne de signal est une EMA de la ligne MACD, calculee uniquement sur
    la portion definie : la lisser sur des `None` convertis en zeros
    fabriquerait un croisement au demarrage.
    """
    fast_e, slow_e = ema(values, fast), ema(values, slow)
    line: Series = [
        (f - s) if (f is not None and s is not None) else None
        for f, s in zip(fast_e, slow_e)
    ]
    defined = [v for v in line if v is not None]
    sig_defined = ema(defined, signal)

    sig: Series = [None] * len(values)
    offset = len(line) - len(defined)
    for i, v in enumerate(sig_defined):
        sig[offset + i] = v

    hist: Series = [
        (m - s) if (m is not None and s is not None) else None
        for m, s in zip(line, sig)
    ]
    return line, sig, hist


# --------------------------------------------------------------------------
#  Volatilite
# --------------------------------------------------------------------------

def true_range(bars: Sequence[Bar]) -> list[float]:
    out = [0.0] * len(bars)
    for i, b in enumerate(bars):
        high, low = float(b.high), float(b.low)
        if i == 0:
            out[i] = high - low
        else:
            prev_close = float(bars[i - 1].close)
            out[i] = max(high - low, abs(high - prev_close), abs(low - prev_close))
    return out


def atr(bars: Sequence[Bar], period: int = 14) -> Series:
    """ATR de Wilder. Sert au dimensionnement : la distance de stop se derive
    de la volatilite realisee, jamais d'un pourcentage arbitraire."""
    return wilder(true_range(bars), period)


def realized_vol_bps(values: Sequence[float], period: int = 24) -> Series:
    """Ecart-type des rendements log, en points de base, sur une fenetre."""
    import math

    rets = [0.0] * len(values)
    for i in range(1, len(values)):
        if values[i - 1] > 0 and values[i] > 0:
            rets[i] = math.log(values[i] / values[i - 1])

    out: Series = [None] * len(values)
    for i in range(period, len(values)):
        window = rets[i - period + 1 : i + 1]
        mean = sum(window) / period
        var = sum((r - mean) ** 2 for r in window) / max(1, period - 1)
        out[i] = math.sqrt(var) * 10_000
    return out


def zscore(values: Sequence[float], period: int = 50) -> Series:
    """Ecart a la moyenne en nombre d'ecarts-types. C'est le champ `stretch`
    que lit l'agent Quant — un nombre calcule en code, pas une impression."""
    import math

    out: Series = [None] * len(values)
    for i in range(period - 1, len(values)):
        window = values[i - period + 1 : i + 1]
        mean = sum(window) / period
        var = sum((v - mean) ** 2 for v in window) / max(1, period - 1)
        sd = math.sqrt(var)
        out[i] = 0.0 if sd == 0 else (values[i] - mean) / sd
    return out


def donchian(bars: Sequence[Bar], period: int = 20) -> tuple[Series, Series]:
    """Plus haut et plus bas sur `period` barres, bougie courante EXCLUE.

    L'exclusion est essentielle : inclure la barre en cours ferait « casser »
    le canal par la barre qui le definit. C'est une forme discrete de fuite de
    futur, et elle rend n'importe quelle strategie de cassure brillante.
    """
    hi: Series = [None] * len(bars)
    lo: Series = [None] * len(bars)
    for i in range(period, len(bars)):
        window = bars[i - period : i]
        hi[i] = max(float(b.high) for b in window)
        lo[i] = min(float(b.low) for b in window)
    return hi, lo
