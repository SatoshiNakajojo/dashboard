"""Bougies OHLCV et leur construction.

Une seule regle gouverne ce module : **le meme code produit les bougies en
backtest et en live**. La premiere cause d'ecart entre un backtest flatteur et
une realite decevante n'est pas la strategie, c'est une bougie construite
autrement dans les deux mondes (bornes de fenetre, gestion des trous, prix de
cloture pris ailleurs).

Trois sources, un seul type de sortie :

- `bars_from_trades` : depuis les trades ingeres en P0 (source de verite locale) ;
- `bars_from_hyperliquid_candles` : depuis `candleSnapshot` de l'API Info ;
- `synthetic_bars` : generateur deterministe, pour les tests.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any, Iterable, Sequence

from pydantic import Field, model_validator

from ..contracts.common import Frozen
from ..contracts.market import Trade

INTERVAL_MS: dict[str, int] = {
    "1m": 60_000,
    "5m": 300_000,
    "15m": 900_000,
    "1h": 3_600_000,
    "4h": 14_400_000,
    "1d": 86_400_000,
}


class Bar(Frozen):
    """Une bougie close. `ts_ms` est le debut de la fenetre, pas sa fin."""

    asset: str
    ts_ms: int
    open: Decimal = Field(gt=0)
    high: Decimal = Field(gt=0)
    low: Decimal = Field(gt=0)
    close: Decimal = Field(gt=0)
    volume: Decimal = Field(default=Decimal("0"), ge=0)
    trades: int = Field(default=0, ge=0)

    @model_validator(mode="after")
    def _coherent(self) -> Bar:
        if self.high < self.low:
            raise ValueError("high < low")
        if not (self.low <= self.open <= self.high):
            raise ValueError("open hors de [low, high]")
        if not (self.low <= self.close <= self.high):
            raise ValueError("close hors de [low, high]")
        return self

    @property
    def range_bps(self) -> Decimal:
        return (self.high - self.low) / self.close * Decimal("10000")


def bars_from_trades(
    trades: Iterable[Trade], interval: str = "1h", *, asset: str | None = None
) -> list[Bar]:
    """Agrege des trades en bougies.

    Les fenetres vides ne produisent pas de bougie fabriquee : un trou dans les
    donnees doit rester visible. Inventer une bougie plate a partir du dernier
    prix connu, c'est exactement le mecanisme par lequel un backtest se met a
    trader un marche imaginaire.
    """
    step = INTERVAL_MS[interval]
    buckets: dict[int, list[Trade]] = {}
    for t in trades:
        if asset and t.asset != asset:
            continue
        buckets.setdefault(t.ts_ms // step * step, []).append(t)

    out: list[Bar] = []
    for ts in sorted(buckets):
        rows = sorted(buckets[ts], key=lambda t: t.ts_ms)
        prices = [r.price for r in rows]
        out.append(
            Bar(
                asset=rows[0].asset,
                ts_ms=ts,
                open=prices[0],
                high=max(prices),
                low=min(prices),
                close=prices[-1],
                volume=sum((r.size for r in rows), Decimal("0")),
                trades=len(rows),
            )
        )
    return out


def bars_from_hyperliquid_candles(payload: Sequence[dict[str, Any]], asset: str) -> list[Bar]:
    """Convertit la reponse `candleSnapshot` de l'API Info.

    Format Hyperliquid : `t` debut, `T` fin, `o/h/l/c` prix, `v` volume,
    `n` nombre de trades. Une bougie incoherente est ignoree plutot que
    corrigee — une donnee douteuse ne doit pas entrer dans une baseline.
    """
    out: list[Bar] = []
    for row in payload:
        try:
            bar = Bar(
                asset=asset,
                ts_ms=int(row["t"]),
                open=Decimal(str(row["o"])),
                high=Decimal(str(row["h"])),
                low=Decimal(str(row["l"])),
                close=Decimal(str(row["c"])),
                volume=Decimal(str(row.get("v", "0"))),
                trades=int(row.get("n", 0)),
            )
        except (KeyError, ValueError, TypeError, ArithmeticError):
            continue
        out.append(bar)
    out.sort(key=lambda b: b.ts_ms)
    return out


def synthetic_bars(
    *,
    asset: str = "BTC",
    count: int = 500,
    start_price: Decimal = Decimal("60000"),
    start_ts_ms: int = 1_700_000_000_000,
    interval: str = "1h",
    seed: int = 7,
    trend_bps_per_bar: float = 0.0,
    vol_bps: float = 40.0,
) -> list[Bar]:
    """Serie deterministe pour les tests.

    Ce n'est pas un simulateur de marche et ne pretend pas l'etre : c'est une
    marche aleatoire reproductible, qui sert a verifier que le moteur de
    backtest est correct — pas qu'une strategie est rentable. Toute conclusion
    de performance tiree de ces barres serait sans valeur.
    """
    import random

    rng = random.Random(seed)
    step = INTERVAL_MS[interval]
    price = float(start_price)
    out: list[Bar] = []

    for i in range(count):
        drift = trend_bps_per_bar / 10_000
        shock = rng.gauss(0, vol_bps / 10_000)
        open_p = price
        close_p = max(1e-6, open_p * (1 + drift + shock))
        wick = abs(rng.gauss(0, vol_bps / 20_000)) * open_p
        high_p = max(open_p, close_p) + wick
        low_p = max(1e-6, min(open_p, close_p) - wick)
        price = close_p

        out.append(
            Bar(
                asset=asset,
                ts_ms=start_ts_ms + i * step,
                open=Decimal(f"{open_p:.2f}"),
                high=Decimal(f"{high_p:.2f}"),
                low=Decimal(f"{low_p:.2f}"),
                close=Decimal(f"{close_p:.2f}"),
                volume=Decimal(f"{abs(rng.gauss(120, 40)):.4f}"),
                trades=rng.randint(50, 400),
            )
        )
    return out
