"""Le stop deplacable, et la seule direction ou il a le droit d'aller.

Le moteur ignorait `stop_price` sur une position ouverte : une strategie
pouvait poser son stop a l'entree, jamais le bouger. Le stop suiveur — dont
le seuil a l'equilibre de `docs/strategies-pinescript-v5.md` est le cas le
plus simple — n'etait donc pas exprimable, et je l'avais ecarte sans le
mesurer.

Ce que ces tests protegent n'est pas le mecanisme, c'est sa **restriction**.
Un stop qui pourrait s'eloigner du prix laisserait une strategie repousser sa
perte devant un prix qui vient la chercher, et produirait un backtest
flatteur par une regle qu'aucun operateur n'accepterait a l'avance.
"""

from __future__ import annotations

from decimal import Decimal

from trading_desk.backtest import FRICTIONLESS, run_backtest
from trading_desk.backtest.engine import _Open, _resserrer
from trading_desk.backtest.strategies import FLAT, Signal, TrendFollowerATR
from trading_desk.contracts import Side
from trading_desk.features import Bar, synthetic_bars


def _pos(side: Side, stop: str) -> _Open:
    return _Open(asset="BTC", side=side, size=Decimal("1"),
                 entry_price=Decimal("100"), entry_ts_ms=0,
                 stop_price=Decimal(stop))


def test_un_stop_long_peut_monter():
    pos, bouge = _resserrer(_pos(Side.LONG, "90"), Decimal("95"))
    assert bouge == 1
    assert pos.stop_price == Decimal("95")


def test_un_stop_long_ne_peut_pas_descendre():
    """La propriete qui compte. L'elargissement est refuse en silence —
    la strategie ne peut pas savoir si elle a reussi, donc ne peut pas
    construire dessus."""
    pos, bouge = _resserrer(_pos(Side.LONG, "90"), Decimal("80"))
    assert bouge == 0
    assert pos.stop_price == Decimal("90")


def test_un_stop_short_peut_descendre_pas_monter():
    pos, bouge = _resserrer(_pos(Side.SHORT, "110"), Decimal("105"))
    assert bouge == 1 and pos.stop_price == Decimal("105")
    pos, bouge = _resserrer(pos, Decimal("120"))
    assert bouge == 0 and pos.stop_price == Decimal("105")


def test_un_stop_identique_ne_compte_pas_comme_un_deplacement():
    """Sinon le compteur gonflerait a chaque barre sans que rien ne bouge."""
    _, bouge = _resserrer(_pos(Side.LONG, "90"), Decimal("90"))
    assert bouge == 0


# --------------------------------------------------------------------------
#  Bout en bout : le stop deplace change vraiment la sortie
# --------------------------------------------------------------------------

class _MonteLeStopUneFois:
    """Entre long a la barre 5, remonte son stop a la barre 10, puis attend."""

    name = "test_stop"

    def __init__(self, stop_initial: str, stop_resserre: str | None) -> None:
        self.stop_initial, self.stop_resserre = stop_initial, stop_resserre

    def prepare(self, bars: list[Bar]) -> None:
        pass

    def on_bar(self, i: int, bars: list[Bar], in_position: Side | None) -> Signal:
        if i == 5 and in_position is None:
            return Signal(side=Side.LONG, stop_price=Decimal(self.stop_initial))
        if i == 10 and in_position is Side.LONG and self.stop_resserre:
            return Signal(stop_price=Decimal(self.stop_resserre))
        return FLAT


def _serie_montante_puis_baissiere() -> list[Bar]:
    """Monte de 100 a 112, puis retombe a 104 (bas de barre : 103).

    Les niveaux sont contraints par `RiskLimits` : l'entree se fait a
    l'ouverture de la barre 6, soit 106, et un stop doit rester entre 30 et
    500 bps sous ce prix, donc entre 100,7 et 105,7. D'ou 102 (377 bps) pour
    le stop initial, jamais touche, et 105 (94 bps) pour le stop resserre,
    touche a la redescente.
    """
    prix = [100 + i for i in range(13)] + [112 - i for i in range(1, 9)]
    return [Bar(asset="BTC", ts_ms=i * 3_600_000, open=Decimal(str(p)),
                high=Decimal(str(p + 1)), low=Decimal(str(p - 1)),
                close=Decimal(str(p)))
            for i, p in enumerate(prix)]


def test_le_stop_resserre_declenche_une_sortie_que_le_stop_initial_evitait():
    bars = _serie_montante_puis_baissiere()
    sans = run_backtest(bars, _MonteLeStopUneFois("102", None),
                        costs=FRICTIONLESS, warmup=0)
    avec = run_backtest(bars, _MonteLeStopUneFois("102", "105"),
                        costs=FRICTIONLESS, warmup=0)
    assert sans.stops_resserres == 0
    assert avec.stops_resserres == 1
    assert [t.reason for t in avec.trades] == ["stop"]
    # Sans resserrement, la position va jusqu'a la fin de la serie.
    assert [t.reason for t in sans.trades] == ["fin de periode"]
    assert avec.net_pnl_usd > sans.net_pnl_usd


def test_le_stop_resserre_ne_sert_pas_retroactivement():
    """Il est pose a la CLOTURE de la barre 10 ; le bas de cette barre est
    deja joue. Le servir a la barre 10 serait une fuite de futur."""
    bars = _serie_montante_puis_baissiere()
    r = run_backtest(bars, _MonteLeStopUneFois("102", "109"),
                     costs=FRICTIONLESS, warmup=0)
    # bars[10].low = 109 : touche si le stop valait deja 109 sur cette barre.
    assert bars[10].low == Decimal("109")
    sortie = r.trades[0]
    assert sortie.exit_ts_ms > bars[10].ts_ms, "le stop a servi trop tot"


# --------------------------------------------------------------------------
#  La strategie du document
# --------------------------------------------------------------------------

def test_le_trend_follower_est_long_seulement():
    """Le Pine Script du document n'a aucune branche short. Lui en ajouter
    une reviendrait a mesurer ma strategie, pas la sienne."""
    bars = synthetic_bars(count=1500, seed=7)
    r = run_backtest(bars, TrendFollowerATR())
    assert all(t.side is Side.LONG for t in r.trades)


def test_le_trend_follower_remonte_son_stop_a_lequilibre():
    """Zero resserrement signalerait un mecanisme jamais declenche — a ne pas
    confondre avec « le seuil a l'equilibre n'apporte rien »."""
    bars = synthetic_bars(count=3000, seed=11)
    r = run_backtest(bars, TrendFollowerATR())
    assert r.trades, "aucun trade : le test ne dit rien"
    assert r.stops_resserres > 0


def test_le_seuil_a_lequilibre_ne_se_declenche_quune_fois_par_trade():
    """Sinon le compteur ment, et le stop serait repose a chaque barre."""
    bars = synthetic_bars(count=3000, seed=11)
    r = run_backtest(bars, TrendFollowerATR())
    assert r.stops_resserres <= len(r.trades)
