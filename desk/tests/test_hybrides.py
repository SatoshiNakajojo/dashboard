"""Les strategies qui melangent des familles.

Ce que ces tests protegent n'est pas la rentabilite — la grille et le modele
nul s'en chargent — mais la **fidelite du melange** : qu'un commutateur
commute vraiment au lieu de se comporter comme une de ses composantes, et
qu'il ne triche pas en changeant de logique au milieu d'un trade.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from trading_desk.backtest import FRICTIONLESS, run_backtest
from trading_desk.backtest.strategies import (
    FLAT, EmaCross, RegimeSwitch, RsiReversion, Signal,
)
from trading_desk.contracts import Side
from trading_desk.features import Bar, synthetic_bars


class _ToujoursLong:
    """Ouvre a la premiere occasion, sort a la barre `sortie_a`."""

    def __init__(self, nom: str, sortie_a: int) -> None:
        self.name, self.sortie_a = nom, sortie_a
        self.appels_en_position: list[int] = []

    def prepare(self, bars: list[Bar]) -> None:
        self.appels_en_position = []

    def on_bar(self, i: int, bars: list[Bar], in_position: Side | None) -> Signal:
        if in_position is not None:
            self.appels_en_position.append(i)
            if i >= self.sortie_a:
                return Signal(exit_now=True, note=f"sortie {self.name}")
            return FLAT
        stop = bars[i].close * Decimal("0.98")
        return Signal(side=Side.LONG, stop_price=stop, note=f"entree {self.name}")


def _bars_adx(valeurs_adx: list[float | None]) -> list[Bar]:
    """Des barres neutres ; l'ADX est injecte, pas calcule."""
    return [Bar(asset="BTC", ts_ms=i * 86_400_000, open=Decimal("100"),
                high=Decimal("101"), low=Decimal("99"), close=Decimal("100"))
            for i in range(len(valeurs_adx))]


def _commutateur(valeurs_adx, tendance, retour) -> RegimeSwitch:
    rs = RegimeSwitch(tendance=tendance, retour=retour)
    bars = _bars_adx(valeurs_adx)
    rs.prepare(bars)
    rs._adx = list(valeurs_adx)   # remplace l'indicateur par le scenario
    return rs


def test_adx_haut_choisit_la_tendance():
    t, r = _ToujoursLong("t", 99), _ToujoursLong("r", 99)
    rs = _commutateur([40.0], t, r)
    sig = rs.on_bar(0, _bars_adx([40.0]), None)
    assert sig.note == "entree t"


def test_adx_bas_choisit_le_retour_a_la_moyenne():
    t, r = _ToujoursLong("t", 99), _ToujoursLong("r", 99)
    rs = _commutateur([10.0], t, r)
    sig = rs.on_bar(0, _bars_adx([10.0]), None)
    assert sig.note == "entree r"


def test_la_bande_morte_ne_declenche_rien():
    """Sans elle, un ADX qui oscille autour d'un seuil unique ferait alterner
    les deux logiques d'une barre a l'autre."""
    t, r = _ToujoursLong("t", 99), _ToujoursLong("r", 99)
    rs = _commutateur([22.0], t, r)
    assert rs.on_bar(0, _bars_adx([22.0]), None) == FLAT


def test_un_adx_indisponible_ne_declenche_rien():
    """L'ADX met ~2 x period barres a se former."""
    t, r = _ToujoursLong("t", 99), _ToujoursLong("r", 99)
    rs = _commutateur([None], t, r)
    assert rs.on_bar(0, _bars_adx([None]), None) == FLAT


def test_celle_qui_a_ouvert_garde_la_main_meme_si_le_regime_bascule():
    """La propriete centrale. Laisser l'autre reprendre en cours de position
    lui ferait gerer un trade dont elle ignore la logique d'entree."""
    tendance, retour = _ToujoursLong("t", 3), _ToujoursLong("r", 3)
    adx = [40.0, 5.0, 5.0, 5.0]           # tendance a l'entree, range ensuite
    rs = _commutateur(adx, tendance, retour)
    bars = _bars_adx(adx)

    assert rs.on_bar(0, bars, None).note == "entree t"
    for i in (1, 2, 3):
        rs.on_bar(i, bars, Side.LONG)
    assert tendance.appels_en_position == [1, 2, 3]
    assert retour.appels_en_position == [], "le retour a repris une position qui n'est pas la sienne"


def test_une_position_sans_proprietaire_nest_pas_geree_au_hasard():
    rs = _commutateur([40.0], _ToujoursLong("t", 99), _ToujoursLong("r", 99))
    rs._proprietaire = None
    assert rs.on_bar(0, _bars_adx([40.0]), Side.LONG) == FLAT


def test_une_bande_morte_inversee_est_refusee_a_la_construction():
    with pytest.raises(ValueError, match="bande morte"):
        RegimeSwitch(adx_tendance=20.0, adx_range=25.0)


# --------------------------------------------------------------------------
#  Bout en bout
# --------------------------------------------------------------------------

def test_le_commutateur_ouvre_avec_les_deux_familles():
    """S'il n'ouvrait qu'avec une, il ne melangerait rien et ne serait qu'un
    alias couteux de sa composante.

    Le comptage se fait sur les ENTREES, pas sur les motifs de sortie : quand
    le moteur ferme sur stop ou cible, le motif ne nomme aucune famille.
    """
    bars = synthetic_bars(count=4000, seed=3)
    rs = RegimeSwitch()
    rs.prepare(bars)
    par_famille: dict[str, int] = {}
    en_position: Side | None = None
    for i in range(len(bars)):
        sig = rs.on_bar(i, bars, en_position)
        if en_position is None and sig.side is not None:
            par_famille[rs._proprietaire.name] = par_famille.get(rs._proprietaire.name, 0) + 1
            en_position = sig.side
        elif en_position is not None and sig.exit_now:
            en_position = None
    assert set(par_famille) == {"ema_cross", "rsi_reversion"}, par_famille
    assert min(par_famille.values()) > 5, f"une famille quasi absente : {par_famille}"


def test_le_commutateur_est_deterministe():
    bars = synthetic_bars(count=2000, seed=5)
    a = run_backtest(bars, RegimeSwitch())
    b = run_backtest(bars, RegimeSwitch())
    assert a.net_pnl_usd == b.net_pnl_usd
