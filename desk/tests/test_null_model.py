"""Tests du modele nul : le hasard aurait-il fait aussi bien ?

Ce module repond a une question que le t de Student ne pose pas — d'ou vient
le PnL. Ses tests portent donc surtout sur la **fidelite du contrefactuel** :
un nul mal construit donne un percentile flatteur, et un percentile flatteur
est exactement ce qui fait deployer du capital sur du bruit.

La propriete centrale : le hasard doit differer de la strategie sur UNE seule
chose, la date d'entree. Tout le reste — nombre de trades, melange long/short,
distances de stop et de cible, couts, dimensionnement — doit etre identique,
sinon on ne mesure pas la valeur du signal mais l'ecart de profil.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from trading_desk.backtest import (
    CostModel, EmaCross, RsiReversion, randomization_test, run_backtest,
)
from trading_desk.backtest.null_model import (
    EntryShape, RandomEntry, entry_shapes, format_null_report,
)
from trading_desk.contracts import Side
from trading_desk.features import synthetic_bars

BARS = synthetic_bars(count=1500, seed=17)


def _obs(strategie, bars=BARS, **kw):
    return run_backtest(bars, strategie, initial_equity_usd=Decimal("1000"), **kw)


# --------------------------------------------------------------------------
#  Fidelite du contrefactuel
# --------------------------------------------------------------------------

def test_le_hasard_joue_le_meme_nombre_de_trades():
    """Donner au hasard plus d'occasions qu'a la strategie fausserait la
    comparaison dans les deux sens : plus de trades, plus de couts, mais aussi
    plus de chances de tomber juste."""
    strat = RsiReversion()
    obs = _obs(strat)
    res = randomization_test(BARS, RsiReversion(), obs, draws=40)
    assert res.observed_trades == len(obs.trades)
    assert abs(res.mean_trades_random - res.observed_trades) <= 1.0


def test_le_hasard_herite_du_profil_de_risque_pas_d_un_profil_invente():
    """Les distances de stop viennent des signaux de la strategie testee. Un
    stop arbitraire produirait une comparaison entre deux strategies
    differentes, pas entre un signal et son absence."""
    formes = entry_shapes(BARS, RsiReversion())
    assert formes, "la strategie doit proposer des entrees"
    assert all(f.stop_frac > 0 for f in formes)
    assert all(isinstance(f.side, Side) for f in formes)

    # Les distances sont relatives : replacables n'importe ou dans la serie.
    assert all(f.stop_frac < Decimal("0.5") for f in formes), \
        "une distance de stop de 50 % du prix signale une erreur d'unite"


def test_le_melange_long_short_est_conserve():
    """Randomiser le sens en plus de la date testerait autre chose : une
    strategie a biais long dans un marche haussier doit garder son biais,
    sinon le nul est artificiellement mauvais et tout le monde le bat."""
    formes = entry_shapes(BARS, EmaCross())
    sens_strategie = {f.side for f in formes}

    alea = RandomEntry(formes, n_trades=20, seed=1)
    alea.prepare(BARS)
    tires = {shape.side for shape in alea._plan.values()}
    assert tires <= sens_strategie


def test_seule_la_date_change():
    """La formulation directe de la propriete centrale.

    Deux tirages differents doivent produire des dates d'entree differentes
    et des profils de risque identiques.
    """
    formes = entry_shapes(BARS, RsiReversion())
    a = RandomEntry(formes, n_trades=30, seed=1)
    b = RandomEntry(formes, n_trades=30, seed=2)
    a.prepare(BARS)
    b.prepare(BARS)
    assert set(a._plan) != set(b._plan), "les dates doivent differer"

    stops = {f.stop_frac for f in formes}
    assert {s.stop_frac for s in a._plan.values()} <= stops
    assert {s.stop_frac for s in b._plan.values()} <= stops


# --------------------------------------------------------------------------
#  Ce que le resultat a le droit de dire
# --------------------------------------------------------------------------

def test_le_tirage_est_deterministe():
    """Un percentile qui bouge d'un run a l'autre est un percentile qu'on
    cesse de lire."""
    obs = _obs(RsiReversion())
    a = randomization_test(BARS, RsiReversion(), obs, draws=30)
    b = randomization_test(BARS, RsiReversion(), obs, draws=30)
    assert a == b


def test_p_value_jamais_nulle():
    """Avec 200 tirages, le plus qu'on puisse honnetement dire est p < 1/201.
    Annoncer p = 0 sur un echantillon fini est un mensonge de presentation."""
    obs = _obs(RsiReversion())
    res = randomization_test(BARS, RsiReversion(), obs, draws=20)
    assert res.p_value >= 1 / 21
    assert res.p_value <= 1.0


def test_une_strategie_sans_trade_est_refusee_plutot_que_notee():
    """Comparer zero trade a un nuage n'a pas de sens ; renvoyer un percentile
    en aurait l'air."""
    courtes = synthetic_bars(count=120, seed=4)
    strat = RsiReversion()
    obs = run_backtest(courtes, strat, warmup=50)
    if obs.trades:
        pytest.skip("cette serie produit des trades : cas non applicable")
    with pytest.raises(ValueError):
        randomization_test(courtes, RsiReversion(), obs, draws=5, warmup=50)


def test_le_verdict_a_trois_etats():
    """Jamais un booleen : `NON DISTINGUABLE` est la reponse honnete la plus
    frequente et ne signifie pas « mauvaise strategie »."""
    from trading_desk.backtest.null_model import NullResult

    def _r(p: float) -> str:
        return NullResult(
            strategy="x", observed_pnl_usd=Decimal("0"), draws=100,
            percentile=50.0, null_mean_usd=0.0, null_p5_usd=-1.0,
            null_p95_usd=1.0, p_value=p, mean_trades_random=10.0,
            observed_trades=10,
        ).verdict

    assert _r(0.01) == "BAT LE HASARD"
    assert _r(0.50) == "NON DISTINGUABLE"
    assert _r(0.99) == "PIRE QUE LE HASARD"


def test_le_rapport_dit_que_le_nuage_n_est_pas_centre_sur_zero():
    """L'erreur de lecture que ce module existe pour empecher : comparer un
    PnL a zero au lieu de le comparer au niveau qu'on obtient sans signal."""
    obs = _obs(RsiReversion())
    texte = format_null_report([randomization_test(BARS, RsiReversion(), obs, draws=20)])
    assert "jamais centre sur zero" in texte
    assert "sur-optimisation" in texte


def test_les_couts_s_appliquent_au_hasard_aussi():
    """Un nul sans frais serait imbattable et rendrait toute strategie
    mediocre — l'erreur symetrique de celle du backtest sans couts."""
    obs = _obs(RsiReversion(), costs=CostModel())
    avec = randomization_test(BARS, RsiReversion(), obs, draws=30,
                              costs=CostModel())
    from trading_desk.backtest import FRICTIONLESS
    sans = randomization_test(BARS, RsiReversion(), obs, draws=30,
                              costs=FRICTIONLESS)
    assert sans.null_mean_usd > avec.null_mean_usd, \
        "le nul sans couts doit etre plus genereux que le nul avec couts"
