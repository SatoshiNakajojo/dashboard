"""Tests des indicateurs.

Chaque indicateur est verifie contre des valeurs calculables a la main, parce
que c'est la seule facon de savoir qu'on applique bien la convention annoncee
(Wilder pour le RSI et l'ATR, EMA amorcee par une SMA).

Un test revient plusieurs fois et compte autant que les valeurs : **la sortie
a toujours la longueur de l'entree**. Un decalage d'index entre indicateur et
prix est un bug de backtest silencieux, qui donne des resultats brillants pour
de mauvaises raisons.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from trading_desk.features import (
    Bar, atr, closes, donchian, ema, macd, realized_vol_bps, rsi, sma,
    synthetic_bars, true_range, zscore,
)


def _bars(prices: list[float], asset: str = "BTC") -> list[Bar]:
    """Bougies plates : open = high = low = close. Isole l'indicateur du bruit."""
    return [
        Bar(asset=asset, ts_ms=1_700_000_000_000 + i * 3_600_000,
            open=Decimal(str(p)), high=Decimal(str(p)),
            low=Decimal(str(p)), close=Decimal(str(p)))
        for i, p in enumerate(prices)
    ]


# --------------------------------------------------------------------------
#  Longueur et alignement
# --------------------------------------------------------------------------

@pytest.mark.parametrize("fn", [
    lambda v: sma(v, 5), lambda v: ema(v, 5), lambda v: rsi(v, 14),
    lambda v: zscore(v, 10), lambda v: realized_vol_bps(v, 10),
])
def test_sortie_de_meme_longueur_que_l_entree(fn):
    values = [float(i) for i in range(1, 61)]
    assert len(fn(values)) == len(values)


def test_none_tant_que_la_fenetre_n_est_pas_pleine():
    out = sma([1, 2, 3, 4, 5], 3)
    assert out[:2] == [None, None]
    assert out[2] == pytest.approx(2.0)


def test_serie_trop_courte_ne_leve_pas():
    assert ema([1.0, 2.0], 10) == [None, None]
    assert rsi([1.0, 2.0], 14) == [None, None]


# --------------------------------------------------------------------------
#  Valeurs
# --------------------------------------------------------------------------

def test_sma_valeurs_connues():
    out = sma([2, 4, 6, 8, 10], 3)
    assert out[2] == pytest.approx(4.0)     # (2+4+6)/3
    assert out[3] == pytest.approx(6.0)
    assert out[4] == pytest.approx(8.0)


def test_ema_amorcee_par_une_sma():
    """La premiere valeur definie doit etre la SMA, pas le premier prix."""
    values = [10, 12, 14, 16, 18]
    out = ema(values, 3)
    assert out[2] == pytest.approx(12.0)                # (10+12+14)/3
    k = 2 / 4
    assert out[3] == pytest.approx(16 * k + 12 * (1 - k))


def test_rsi_hausse_continue_vaut_cent():
    """Aucune baisse sur la fenetre : le RSI vaut 100 par definition."""
    out = rsi([float(i) for i in range(1, 40)], 14)
    assert out[14] == pytest.approx(100.0)


def test_rsi_serie_plate_vaut_cinquante():
    """Ni gain ni perte : la valeur neutre, et surtout pas une division par zero."""
    out = rsi([100.0] * 40, 14)
    assert out[14] == pytest.approx(50.0)


def test_rsi_reste_borne():
    bars = synthetic_bars(count=400, seed=3)
    for v in rsi(closes(bars), 14):
        if v is not None:
            assert 0.0 <= v <= 100.0


def test_true_range_prend_en_compte_la_cloture_precedente():
    bars = [
        Bar(asset="X", ts_ms=0, open=Decimal("100"), high=Decimal("102"),
            low=Decimal("99"), close=Decimal("101")),
        # Gap haussier : le vrai range part de la cloture precedente (101),
        # pas du plus bas de la bougie (110).
        Bar(asset="X", ts_ms=1, open=Decimal("110"), high=Decimal("112"),
            low=Decimal("110"), close=Decimal("111")),
    ]
    tr = true_range(bars)
    assert tr[0] == pytest.approx(3.0)      # 102 - 99
    assert tr[1] == pytest.approx(11.0)     # 112 - 101


def test_atr_positif_et_aligne():
    bars = synthetic_bars(count=200, seed=11)
    out = atr(bars, 14)
    assert len(out) == len(bars)
    assert all(v > 0 for v in out if v is not None)


def test_macd_trois_series_alignees():
    values = [float(i) + (i % 7) for i in range(200)]
    line, signal, hist = macd(values)
    assert len(line) == len(signal) == len(hist) == len(values)
    idx = next(i for i, v in enumerate(hist) if v is not None)
    assert hist[idx] == pytest.approx(line[idx] - signal[idx])


def test_zscore_serie_plate_est_nul():
    assert zscore([50.0] * 100, 20)[50] == pytest.approx(0.0)


def test_volatilite_realisee_croit_avec_l_agitation():
    calme = realized_vol_bps([100.0 + i * 0.01 for i in range(200)], 24)
    agite = realized_vol_bps(closes(synthetic_bars(count=200, vol_bps=200, seed=5)), 24)
    assert agite[-1] > calme[-1]


# --------------------------------------------------------------------------
#  Donchian : le detail qui fabrique de la fuite de futur
# --------------------------------------------------------------------------

def test_donchian_exclut_la_barre_courante():
    """Inclure la barre en cours ferait « casser » le canal par la barre qui
    le definit — une fuite de futur discrete qui rend toute strategie de
    cassure brillante."""
    prices = [100.0] * 30 + [200.0]          # un pic sur la derniere barre
    bars = _bars(prices)
    hi, _ = donchian(bars, 20)
    assert hi[-1] == pytest.approx(100.0), "le pic courant ne doit pas entrer"


def test_donchian_encadre_les_prix():
    bars = synthetic_bars(count=200, seed=9)
    hi, lo = donchian(bars, 20)
    for h, low in zip(hi, lo):
        if h is not None and low is not None:
            assert h >= low


# --------------------------------------------------------------------------
#  ADX / DMI — le commutateur de regime de la documentation
# --------------------------------------------------------------------------

def test_une_barre_englobante_n_est_directionnelle_dans_aucun_sens():
    """Le mouvement directionnel ne compte que ce qui DEPASSE l'oppose.

    Une barre a la fois plus haute et plus basse que la precedente est
    indecise. La compter dans les deux sens gonflerait la force de tendance
    mesuree — et c'est precisement ce chiffre qui commuterait le desk entre
    suivi de tendance et retour a la moyenne.
    """
    from trading_desk.features.indicators import dmi

    # Barre 1 englobe strictement la barre 0 : +DM et -DM doivent rester nuls.
    englobante = [
        Bar(asset="X", ts_ms=0, open=Decimal("100"), high=Decimal("101"),
            low=Decimal("99"), close=Decimal("100"), volume=Decimal("1")),
        Bar(asset="X", ts_ms=1, open=Decimal("100"), high=Decimal("105"),
            low=Decimal("95"), close=Decimal("100"), volume=Decimal("1")),
    ]
    # haut = +4, bas = +4 : ni l'un ni l'autre ne domine, donc aucun DM.
    plus_di, minus_di = dmi(englobante, period=1)
    assert plus_di[1] == 0.0 or plus_di[1] is None
    assert minus_di[1] == 0.0 or minus_di[1] is None


def test_l_adx_monte_en_tendance_et_reste_bas_en_range():
    """Le critere de fond : ADX doit separer les deux regimes.

    Sans cette separation, la regle « > 25 on suit la tendance, < 20 on
    revient a la moyenne » commuterait au hasard.
    """
    from trading_desk.features.indicators import adx

    def serie(prix: list[float]) -> list[Bar]:
        return [Bar(asset="X", ts_ms=i * 86_400_000, open=Decimal(str(p)),
                    high=Decimal(str(p + 1)), low=Decimal(str(p - 1)),
                    close=Decimal(str(p)), volume=Decimal("1"))
                for i, p in enumerate(prix)]

    tendance = adx(serie([100 + 2 * i for i in range(120)]), 14)
    plat = adx(serie([100 + (3 if i % 2 else 0) for i in range(120)]), 14)

    t = [v for v in tendance if v is not None]
    r = [v for v in plat if v is not None]
    assert t and r
    assert t[-1] > 25, "une hausse monotone doit donner un ADX de tendance"
    assert r[-1] < 20, "une oscillation sans direction doit rester en range"


def test_l_adx_ne_produit_rien_avant_son_double_lissage():
    """DX est lisse une fois de plus que +DI/-DI : la premiere valeur arrive
    vers `2 * period`. Le cout du filtre doit etre visible, pas devine."""
    from trading_desk.features.indicators import adx

    bars = synthetic_bars(count=60, seed=4)
    valeurs = adx(bars, 14)
    premier = next((i for i, v in enumerate(valeurs) if v is not None), None)
    assert premier is not None
    assert premier >= 14, "aucune valeur ne peut preceder une fenetre de Wilder"
