"""Moteur de backtest evenementiel sur bougies.

Il **reutilise le moteur de risque du live** : `size_position`, `RiskLimits` et
le mandat sont exactement les memes objets qu'en production. C'est tout
l'interet d'avoir garde la couche de risque pure et sans dependance : une
strategie testee ici est dimensionnee comme elle le serait en reel.

Quatre choix de prudence, qui font toute la difference entre un backtest
credible et un backtest flatteur :

1. **Entree a l'ouverture de la barre suivante.** Une decision prise sur la
   cloture de la barre `i` ne peut pas etre executee a cette meme cloture. La
   servir au close de `i` est la fuite de futur la plus repandue.
2. **Le stop l'emporte sur la cible.** Quand une barre contient les deux
   niveaux, on ne sait pas lequel a ete touche en premier : on suppose le
   stop. Systematiquement pessimiste.
3. **Les gaps sont servis au gap.** Si l'ouverture depasse deja le stop, le
   fill se fait a l'ouverture, pas au niveau du stop. C'est ce qui arrive en
   vrai, et c'est la que les pertes reelles depassent les pertes theoriques.
4. **Le funding se paie a chaque barre detenue**, pas a la sortie.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from pydantic import Field

from ..contracts.common import Bias, Frozen, Side
from ..contracts.mandate import Mandate, StopBand
from ..contracts.orders import AccountState
from ..features.bars import INTERVAL_MS, Bar
from ..risk import RiskLimits, size_position
from .costs import CostModel
from .strategies import Strategy


class BacktestTrade(Frozen):
    """Un aller-retour complet, avec sa decomposition de couts."""

    asset: str
    side: Side
    entry_ts_ms: int
    exit_ts_ms: int
    entry_price: Decimal
    exit_price: Decimal
    size: Decimal
    gross_pnl_usd: Decimal
    fees_usd: Decimal
    funding_usd: Decimal
    reason: str

    @property
    def net_pnl_usd(self) -> Decimal:
        return self.gross_pnl_usd - self.fees_usd - self.funding_usd

    @property
    def hours(self) -> Decimal:
        return Decimal(self.exit_ts_ms - self.entry_ts_ms) / Decimal("3600000")


class _Open(Frozen):
    asset: str
    side: Side
    size: Decimal
    entry_price: Decimal
    entry_ts_ms: int
    stop_price: Decimal
    target_price: Decimal | None = None
    fees_paid: Decimal = Decimal("0")
    funding_paid: Decimal = Decimal("0")


class BacktestResult(Frozen):
    strategy: str
    asset: str
    interval: str
    bars: int
    start_ts_ms: int
    end_ts_ms: int
    initial_equity_usd: Decimal
    final_equity_usd: Decimal
    trades: tuple[BacktestTrade, ...]
    equity_curve: tuple[Decimal, ...]
    rejected_by_risk: int = 0
    costs: dict[str, Any] = Field(default_factory=dict)

    @property
    def net_pnl_usd(self) -> Decimal:
        return self.final_equity_usd - self.initial_equity_usd

    @property
    def gross_pnl_usd(self) -> Decimal:
        return sum((t.gross_pnl_usd for t in self.trades), Decimal("0"))

    @property
    def total_fees_usd(self) -> Decimal:
        return sum((t.fees_usd for t in self.trades), Decimal("0"))

    @property
    def total_funding_usd(self) -> Decimal:
        return sum((t.funding_usd for t in self.trades), Decimal("0"))


def run_backtest(
    bars: list[Bar],
    strategy: Strategy,
    *,
    limits: RiskLimits | None = None,
    costs: CostModel | None = None,
    initial_equity_usd: Decimal = Decimal("1000"),
    interval: str = "1h",
    warmup: int = 50,
) -> BacktestResult:
    """Deroule la strategie barre par barre.

    Deterministe : memes barres et memes parametres donnent exactement le meme
    resultat. C'est une propriete testee, pas une intention — sans elle, on ne
    peut pas comparer deux versions d'une strategie.
    """
    if len(bars) < warmup + 2:
        raise ValueError(f"il faut au moins {warmup + 2} barres, {len(bars)} fournies")

    limits = limits or RiskLimits()
    costs = costs or CostModel()
    bar_hours = Decimal(INTERVAL_MS[interval]) / Decimal("3600000")

    strategy.prepare(bars)
    equity = initial_equity_usd
    curve: list[Decimal] = []
    trades: list[BacktestTrade] = []
    position: _Open | None = None
    pending: tuple[Side, Decimal, Decimal | None] | None = None
    rejected = 0

    for i in range(len(bars)):
        bar = bars[i]

        # 1. Executer a l'ouverture ce qui a ete decide a la cloture precedente.
        if pending is not None and position is None:
            side, stop, target = pending
            pending = None
            opened = _try_open(
                bar=bar, side=side, stop=stop, target=target, equity=equity,
                limits=limits, costs=costs,
            )
            if opened is None:
                rejected += 1
            else:
                position = opened
                equity -= position.fees_paid

        # 2. Gerer une position ouverte : stop, cible, funding.
        if position is not None:
            exit_px, reason = _check_exit_levels(bar, position)
            position = position.model_copy(update={
                "funding_paid": position.funding_paid + costs.funding_usd(
                    position.size * position.entry_price, bar_hours,
                    is_long=position.side is Side.LONG,
                )
            })
            if exit_px is not None:
                equity, trade = _close(position, exit_px, bar.ts_ms, reason, equity, costs)
                trades.append(trade)
                position = None

        # 3. Demander son avis a la strategie, sur la cloture de cette barre.
        if i >= warmup:
            sig = strategy.on_bar(i, bars, position.side if position else None)
            if position is not None and sig.exit_now:
                equity, trade = _close(
                    position, costs.fill_price(bar.close,
                                               is_buy=position.side is Side.SHORT),
                    bar.ts_ms, sig.note or "sortie strategie", equity, costs,
                )
                trades.append(trade)
                position = None
            elif position is None and sig.side is not None and pending is None:
                stop = sig.stop_price or _default_stop(bar.close, sig.side, limits)
                pending = (sig.side, stop, sig.target_price)

        # 4. Valoriser.
        mark = equity
        if position is not None:
            direction = 1 if position.side is Side.LONG else -1
            mark += (bar.close - position.entry_price) * position.size * direction
            mark -= position.funding_paid
        curve.append(mark)

    # Cloture forcee sur la derniere barre : une position laissee ouverte
    # gonflerait le resultat d'un gain latent jamais realise.
    if position is not None:
        last = bars[-1]
        equity, trade = _close(
            position,
            costs.fill_price(last.close, is_buy=position.side is Side.SHORT),
            last.ts_ms, "fin de periode", equity, costs,
        )
        trades.append(trade)
        curve[-1] = equity

    return BacktestResult(
        strategy=strategy.name,
        asset=bars[0].asset,
        interval=interval,
        bars=len(bars),
        start_ts_ms=bars[0].ts_ms,
        end_ts_ms=bars[-1].ts_ms,
        initial_equity_usd=initial_equity_usd,
        final_equity_usd=equity,
        trades=tuple(trades),
        equity_curve=tuple(curve),
        rejected_by_risk=rejected,
        costs=costs.model_dump(mode="json"),
    )


# --------------------------------------------------------------------------
#  Internes
# --------------------------------------------------------------------------

def _default_stop(close: Decimal, side: Side, limits: RiskLimits) -> Decimal:
    """Stop de repli quand la strategie n'en fournit pas.

    Place au milieu de la fourchette autorisee : une strategie sans stop
    explicite ne doit pas heriter du stop le plus large possible.
    """
    mid_bps = (limits.min_stop_distance_bps + limits.max_stop_distance_bps) / 2
    span = close * mid_bps / Decimal("10000")
    return close - span if side is Side.LONG else close + span


def _try_open(
    *, bar: Bar, side: Side, stop: Decimal, target: Decimal | None,
    equity: Decimal, limits: RiskLimits, costs: CostModel,
) -> _Open | None:
    """Ouvre une position si le moteur de risque du live l'autorise.

    Le mandat est fabrique a la volee pour refleter ce qu'un Chef de desk
    aurait emis. Il passe par exactement les memes validations qu'en
    production, y compris la fourchette de stop.
    """
    entry = costs.fill_price(bar.open, is_buy=side is Side.LONG)
    if entry <= 0:
        return None
    distance_bps = abs(entry - stop) / entry * Decimal("10000")

    account = AccountState(
        equity_usd=equity,
        available_margin_usd=equity,
        used_margin_usd=Decimal("0"),
    )
    # La fourchette est construite DANS le `try` : un stop plus large que ce
    # que le contrat `StopBand` autorise doit compter comme un signal refuse,
    # pas faire remonter une exception. Sur un actif volatil — AVAX, SOL — un
    # stop ATR depasse les 5000 bps du contrat, et la construction hors du
    # `try` arretait le backtest entier au milieu de la serie.
    try:
        band = StopBand(
            min_bps=min(limits.min_stop_distance_bps, distance_bps),
            max_bps=max(limits.max_stop_distance_bps, distance_bps + 1),
        )
        mandate = Mandate(
            bias=Bias.LONG if side is Side.LONG else Bias.SHORT,
            universe=(bar.asset,),
            max_notional_usd=limits.max_position_notional_usd,
            max_leverage=limits.max_effective_leverage,
            max_concurrent_positions=1,
            stop_band=band,
            journal_ref="backtest",
        )
    except ValueError:
        return None

    sized = size_position(
        account=account, mandate=mandate, limits=limits, asset=bar.asset,
        side=side, entry_price=entry, stop_price=stop,
    )
    if not sized.is_tradable:
        return None

    return _Open(
        asset=bar.asset, side=side, size=sized.size, entry_price=entry,
        entry_ts_ms=bar.ts_ms,
        stop_price=stop, target_price=target,
        fees_paid=costs.fee_usd(sized.notional_usd),
    )


def _check_exit_levels(bar: Bar, pos: _Open) -> tuple[Decimal | None, str]:
    """Le stop l'emporte sur la cible quand les deux sont dans la barre.

    On ignore l'ordre reel des ticks a l'interieur de la bougie ; supposer le
    scenario favorable transformerait chaque barre volatile en gain.
    """
    if pos.side is Side.LONG:
        # Gap d'ouverture sous le stop : on est servi au gap, pas au stop.
        if bar.open <= pos.stop_price:
            return bar.open, "stop (gap)"
        if bar.low <= pos.stop_price:
            return pos.stop_price, "stop"
        if pos.target_price is not None and bar.high >= pos.target_price:
            return pos.target_price, "cible"
    else:
        if bar.open >= pos.stop_price:
            return bar.open, "stop (gap)"
        if bar.high >= pos.stop_price:
            return pos.stop_price, "stop"
        if pos.target_price is not None and bar.low <= pos.target_price:
            return pos.target_price, "cible"
    return None, ""


def _close(
    pos: _Open, exit_price: Decimal, ts_ms: int, reason: str,
    equity: Decimal, costs: CostModel,
) -> tuple[Decimal, BacktestTrade]:
    """Solde la position et renvoie (nouvelle equite, trade journalise).

    Les frais d'entree ont deja ete retires de l'equite a l'ouverture ; on ne
    deduit ici que le brut, les frais de sortie et le funding accumule. Le
    trade, lui, porte le total des frais pour que le rapport soit lisible.
    """
    direction = Decimal("1") if pos.side is Side.LONG else Decimal("-1")
    gross = (exit_price - pos.entry_price) * pos.size * direction
    exit_fee = costs.fee_usd(pos.size * exit_price)
    new_equity = equity + gross - exit_fee - pos.funding_paid

    trade = BacktestTrade(
        asset=pos.asset,
        side=pos.side,
        entry_ts_ms=pos.entry_ts_ms,
        exit_ts_ms=ts_ms,
        entry_price=pos.entry_price,
        exit_price=exit_price,
        size=pos.size,
        gross_pnl_usd=gross,
        fees_usd=pos.fees_paid + exit_fee,
        funding_usd=pos.funding_paid,
        reason=reason,
    )
    return new_equity, trade


def benchmark_buy_and_hold(
    bars: list[Bar],
    *,
    costs: CostModel | None = None,
    initial_equity_usd: Decimal = Decimal("1000"),
    interval: str = "1h",
    warmup: int = 50,
) -> BacktestResult:
    """Reference « detenir l'actif », calculee hors du moteur de strategies.

    Elle a son propre chemin de code pour une raison de fond : un buy and hold
    n'a **pas** de stop. Le faire passer par `size_position` lui en imposerait
    un, il se ferait sortir a la premiere secousse, et la reference deviendrait
    silencieusement fausse — un benchmark casse est pire qu'un benchmark absent,
    parce qu'il flatte tout ce qu'on lui compare.

    Convention : achat a l'ouverture de la barre `warmup + 1` (meme decalage de
    demarrage que les strategies, pour comparer sur la meme periode), revente a
    la cloture de la derniere barre. Frais des deux cotes, funding a chaque
    barre detenue. Pas de levier : le notionnel vaut l'equite de depart.
    """
    costs = costs or CostModel()
    if len(bars) < warmup + 2:
        raise ValueError(f"il faut au moins {warmup + 2} barres, {len(bars)} fournies")

    bar_hours = Decimal(INTERVAL_MS[interval]) / Decimal("3600000")
    entry_bar = bars[warmup + 1]
    entry = costs.fill_price(entry_bar.open, is_buy=True)
    size = initial_equity_usd / entry
    entry_fee = costs.fee_usd(size * entry)

    curve: list[Decimal] = [initial_equity_usd] * (warmup + 1)
    funding = Decimal("0")
    for bar in bars[warmup + 1:]:
        funding += costs.funding_usd(size * entry, bar_hours, is_long=True)
        curve.append(initial_equity_usd + (bar.close - entry) * size - entry_fee - funding)

    last = bars[-1]
    exit_price = costs.fill_price(last.close, is_buy=False)
    exit_fee = costs.fee_usd(size * exit_price)
    gross = (exit_price - entry) * size
    final = initial_equity_usd + gross - entry_fee - exit_fee - funding
    curve[-1] = final

    trade = BacktestTrade(
        asset=bars[0].asset, side=Side.LONG,
        entry_ts_ms=entry_bar.ts_ms, exit_ts_ms=last.ts_ms,
        entry_price=entry, exit_price=exit_price, size=size,
        gross_pnl_usd=gross, fees_usd=entry_fee + exit_fee, funding_usd=funding,
        reason="fin de periode",
    )
    return BacktestResult(
        strategy="buy_and_hold", asset=bars[0].asset, interval=interval,
        bars=len(bars), start_ts_ms=bars[0].ts_ms, end_ts_ms=last.ts_ms,
        initial_equity_usd=initial_equity_usd, final_equity_usd=final,
        trades=(trade,), equity_curve=tuple(curve),
        costs=costs.model_dump(mode="json"),
    )
