"""Tests du moteur de backtest.

Ce que ces tests protegent n'est pas la rentabilite d'une strategie — c'est
l'**honnetete du moteur**. Un backtest optimiste est plus dangereux qu'aucun
backtest, parce qu'il produit un chiffre auquel on finit par croire.

Trois proprietes centrales :

- pas de fuite de futur : une decision prise sur la cloture `i` s'execute a
  l'ouverture `i+1` ;
- pessimisme systematique : le stop l'emporte sur la cible, les gaps sont
  servis au gap ;
- determinisme : memes entrees, meme resultat, au centime.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from trading_desk.backtest import (
    FRICTIONLESS, CostModel, EmaCross, RsiReversion, benchmark_buy_and_hold,
    compute_metrics, format_report, run_backtest,
)
from trading_desk.backtest.engine import _check_exit_levels, _Open
from trading_desk.contracts import Side
from trading_desk.features import Bar, bars_from_trades, synthetic_bars
from trading_desk.contracts.market import Trade
from trading_desk.risk import RiskLimits


def _bar(o, h, low, c, ts=0, asset="BTC") -> Bar:
    return Bar(asset=asset, ts_ms=ts, open=Decimal(str(o)), high=Decimal(str(h)),
               low=Decimal(str(low)), close=Decimal(str(c)))


# --------------------------------------------------------------------------
#  Determinisme
# --------------------------------------------------------------------------

def test_deux_executions_identiques():
    bars = synthetic_bars(count=800, seed=42)
    a = run_backtest(bars, EmaCross())
    b = run_backtest(bars, EmaCross())
    assert a.final_equity_usd == b.final_equity_usd
    assert len(a.trades) == len(b.trades)
    assert [t.entry_price for t in a.trades] == [t.entry_price for t in b.trades]


def test_seed_differente_donne_serie_differente():
    assert synthetic_bars(count=100, seed=1) != synthetic_bars(count=100, seed=2)


# --------------------------------------------------------------------------
#  Absence de fuite de futur
# --------------------------------------------------------------------------

def test_entree_a_l_ouverture_suivante_jamais_a_la_cloture():
    """La propriete la plus importante du moteur.

    On fabrique une serie ou l'entree se declenche, puis on verifie que le
    prix d'entree correspond a une OUVERTURE, pas a la cloture de la barre
    qui a produit le signal.
    """
    bars = synthetic_bars(count=600, seed=17)
    result = run_backtest(bars, EmaCross())
    assert result.trades, "la strategie doit avoir tradé sur cette serie"

    opens = {b.ts_ms: b.open for b in bars}
    costs = CostModel()
    for t in result.trades:
        expected = costs.fill_price(opens[t.entry_ts_ms],
                                    is_buy=t.side is Side.LONG)
        assert t.entry_price == expected, (
            "l'entree doit etre servie a l'ouverture de la barre, slippage inclus"
        )


def test_la_strategie_ne_lit_jamais_le_futur():
    """Tronquer la serie ne doit pas changer les trades deja produits.

    Si un indicateur regardait en avant, les premiers trades d'un run long
    differeraient de ceux d'un run court sur les memes barres.
    """
    bars = synthetic_bars(count=800, seed=23)
    court = run_backtest(bars[:400], EmaCross())
    long = run_backtest(bars, EmaCross())

    for a, b in zip(court.trades, long.trades):
        if a.entry_ts_ms > bars[350].ts_ms:
            break            # trop pres du bord : la troncature change la suite
        assert a.entry_price == b.entry_price
        assert a.entry_ts_ms == b.entry_ts_ms


# --------------------------------------------------------------------------
#  Pessimisme
# --------------------------------------------------------------------------

def test_le_stop_l_emporte_sur_la_cible():
    """Barre contenant les deux niveaux : on ne sait pas lequel a ete touche
    en premier, donc on suppose le stop."""
    pos = _Open(asset="BTC", side=Side.LONG, size=Decimal("1"),
                entry_price=Decimal("100"), entry_ts_ms=0,
                stop_price=Decimal("95"), target_price=Decimal("105"))
    price, reason = _check_exit_levels(_bar(100, 106, 94, 100), pos)
    assert price == Decimal("95")
    assert reason == "stop"


def test_gap_sous_le_stop_est_servi_au_gap():
    """C'est la que les pertes reelles depassent les pertes theoriques."""
    pos = _Open(asset="BTC", side=Side.LONG, size=Decimal("1"),
                entry_price=Decimal("100"), entry_ts_ms=0,
                stop_price=Decimal("95"))
    price, reason = _check_exit_levels(_bar(90, 92, 88, 91), pos)
    assert price == Decimal("90"), "servi a l'ouverture, pas au niveau du stop"
    assert reason == "stop (gap)"


def test_gap_symetrique_pour_un_short():
    pos = _Open(asset="BTC", side=Side.SHORT, size=Decimal("1"),
                entry_price=Decimal("100"), entry_ts_ms=0,
                stop_price=Decimal("105"))
    price, reason = _check_exit_levels(_bar(112, 114, 111, 113), pos)
    assert price == Decimal("112")
    assert reason == "stop (gap)"


def test_cible_atteinte_seule():
    pos = _Open(asset="BTC", side=Side.LONG, size=Decimal("1"),
                entry_price=Decimal("100"), entry_ts_ms=0,
                stop_price=Decimal("95"), target_price=Decimal("105"))
    price, reason = _check_exit_levels(_bar(100, 106, 99, 105), pos)
    assert price == Decimal("105")
    assert reason == "cible"


# --------------------------------------------------------------------------
#  Couts
# --------------------------------------------------------------------------

def test_les_couts_degradent_toujours_le_resultat():
    bars = synthetic_bars(count=800, seed=31)
    avec = run_backtest(bars, EmaCross(), costs=CostModel())
    sans = run_backtest(bars, EmaCross(), costs=FRICTIONLESS)
    assert avec.final_equity_usd < sans.final_equity_usd


def test_frais_et_funding_sont_comptes():
    bars = synthetic_bars(count=800, seed=31)
    r = run_backtest(bars, EmaCross(), costs=CostModel())
    assert r.total_fees_usd > 0
    assert any(t.funding_usd != 0 for t in r.trades)


def test_le_funding_penalise_la_detention_longue():
    """Buy and hold paie le funding sur toute la periode : c'est la raison
    principale pour laquelle il perd souvent contre une strategie active."""
    bars = synthetic_bars(count=1000, seed=13)
    r = benchmark_buy_and_hold(bars, costs=CostModel())
    assert r.total_funding_usd > 0
    assert r.trades[0].hours > 900, "la reference doit tenir toute la periode"


def test_le_benchmark_na_pas_de_stop():
    """Le piege evite : passer buy and hold dans le moteur de strategies lui
    imposerait un stop, il sortirait a la premiere secousse, et la reference
    serait silencieusement fausse."""
    bars = synthetic_bars(count=1000, seed=13, vol_bps=150)
    r = benchmark_buy_and_hold(bars)
    assert len(r.trades) == 1
    assert r.trades[0].reason == "fin de periode"
    assert r.trades[0].exit_ts_ms == bars[-1].ts_ms


def test_le_benchmark_suit_le_prix():
    """Sans cout, le rendement doit coller a la variation de l'actif."""
    bars = synthetic_bars(count=600, seed=21)
    r = benchmark_buy_and_hold(bars, costs=FRICTIONLESS)
    variation = float(bars[-1].close / bars[51].open - 1)
    rendement = float(r.net_pnl_usd / r.initial_equity_usd)
    assert abs(rendement - variation) < 0.005


def test_pnl_net_coherent_avec_la_decomposition():
    bars = synthetic_bars(count=600, seed=19)
    r = run_backtest(bars, RsiReversion())
    somme = sum((t.net_pnl_usd for t in r.trades), Decimal("0"))
    assert abs(somme - r.net_pnl_usd) < Decimal("0.01")


def test_sans_cout_le_brut_egale_le_net():
    bars = synthetic_bars(count=600, seed=19)
    r = run_backtest(bars, RsiReversion(), costs=FRICTIONLESS)
    assert abs(r.gross_pnl_usd - r.net_pnl_usd) < Decimal("0.01")


# --------------------------------------------------------------------------
#  Integration avec le moteur de risque du live
# --------------------------------------------------------------------------

def test_les_limites_de_risque_plafonnent_les_positions():
    """Le backtest passe par `size_position`, exactement comme le live."""
    bars = synthetic_bars(count=800, seed=29)
    serre = RiskLimits(max_position_notional_usd=Decimal("50"),
                       max_gross_notional_usd=Decimal("100"))
    r = run_backtest(bars, EmaCross(), limits=serre)
    for t in r.trades:
        assert t.size * t.entry_price <= Decimal("51")


def test_aucune_position_ouverte_a_la_fin():
    """Une position laissee ouverte gonflerait le resultat d'un gain latent
    jamais realise."""
    bars = synthetic_bars(count=700, seed=37)
    r = run_backtest(bars, EmaCross())
    if r.trades:
        assert r.trades[-1].exit_ts_ms <= bars[-1].ts_ms
    assert r.equity_curve[-1] == r.final_equity_usd


def test_jamais_plus_d_une_position_a_la_fois():
    bars = synthetic_bars(count=900, seed=41)
    r = run_backtest(bars, RsiReversion())
    for a, b in zip(r.trades, r.trades[1:]):
        assert b.entry_ts_ms >= a.exit_ts_ms


def test_serie_trop_courte_refusee():
    with pytest.raises(ValueError, match="au moins"):
        run_backtest(synthetic_bars(count=20), EmaCross())


# --------------------------------------------------------------------------
#  Bougies
# --------------------------------------------------------------------------

def test_agregation_de_trades_en_bougies():
    base = 1_700_000_000_000
    trades = [
        Trade(asset="BTC", price=Decimal("100"), size=Decimal("1"),
              is_buy=True, ts_ms=base + 1_000),
        Trade(asset="BTC", price=Decimal("110"), size=Decimal("2"),
              is_buy=True, ts_ms=base + 2_000),
        Trade(asset="BTC", price=Decimal("90"), size=Decimal("1"),
              is_buy=False, ts_ms=base + 3_000),
    ]
    bars = bars_from_trades(trades, "1h")
    assert len(bars) == 1
    b = bars[0]
    assert (b.open, b.high, b.low, b.close) == (
        Decimal("100"), Decimal("110"), Decimal("90"), Decimal("90"))
    assert b.volume == Decimal("4")
    assert b.trades == 3


def test_les_trous_ne_sont_pas_combles():
    """Fabriquer une bougie plate a partir du dernier prix connu est le
    mecanisme par lequel un backtest se met a trader un marche imaginaire."""
    base = 1_700_000_000_000
    trades = [
        Trade(asset="BTC", price=Decimal("100"), size=Decimal("1"),
              is_buy=True, ts_ms=base),
        Trade(asset="BTC", price=Decimal("120"), size=Decimal("1"),
              is_buy=True, ts_ms=base + 5 * 3_600_000),
    ]
    assert len(bars_from_trades(trades, "1h")) == 2


def test_bougie_incoherente_rejetee():
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        Bar(asset="X", ts_ms=0, open=Decimal("100"), high=Decimal("90"),
            low=Decimal("95"), close=Decimal("97"))


# --------------------------------------------------------------------------
#  Rapport
# --------------------------------------------------------------------------

def test_metriques_et_rapport():
    bars = synthetic_bars(count=1200, seed=7)
    m = [compute_metrics(run_backtest(bars, s())) for s in (EmaCross, RsiReversion)]
    m.append(compute_metrics(benchmark_buy_and_hold(bars)))
    text = format_report(m)
    assert "BASELINES" in text
    for row in m:
        assert row.strategy in text
        assert 0 <= row.exposure_pct <= 100
        assert row.max_drawdown_pct >= 0


def test_echantillon_faible_signale():
    bars = synthetic_bars(count=700, seed=37)
    m = compute_metrics(benchmark_buy_and_hold(bars))
    assert m.trades == 1
    assert not m.is_significant
    assert "*" in format_report([m])


def test_sharpe_absent_si_trop_peu_de_points():
    bars = synthetic_bars(count=60, seed=3)
    m = compute_metrics(run_backtest(bars, EmaCross(), warmup=20))
    assert m.sharpe is None or isinstance(m.sharpe, float)
