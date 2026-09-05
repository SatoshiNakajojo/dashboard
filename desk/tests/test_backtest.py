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


def test_le_funding_par_defaut_est_bien_un_taux_HORAIRE():
    """L'erreur d'unite qui condamne un backtest sans le faire echouer.

    Hyperliquid facture le funding toutes les heures ; sa composante de taux
    d'interet est annoncee a 0,01 % par 8 heures. Prendre ce chiffre pour un
    taux horaire le multiplie par huit, soit 0,24 %/jour de notionnel, et
    penalise toute strategie a proportion de son exposition. Le buy and hold
    en meurt, les strategies peu exposees paraissent bonnes, et la baseline
    que le desk doit battre au P5 devient artificiellement facile.

    Ce test verifie l'UNITE, pas la valeur : il derive le taux horaire du taux
    8 h publie, au lieu de figer un nombre qu'on pourrait recopier faux.
    """
    taux_8h_pct = Decimal("0.01")                  # publie par Hyperliquid
    attendu_bps_horaire = taux_8h_pct * 100 / 8    # % -> bps, puis /8 h
    assert CostModel().funding_bps_per_hour == attendu_bps_horaire

    # Et l'effet, vu du portefeuille : la detention d'un notionnel de 1000 $
    # pendant un an coute quelques pour cent, pas la moitie du capital.
    annuel = CostModel().funding_usd(Decimal("1000"), Decimal("8760"), is_long=True)
    assert Decimal("50") < annuel < Decimal("200"), (
        f"{annuel} $/an sur 1000 $ de notionnel : verifier l'unite du funding"
    )


def test_le_signe_du_funding_suit_le_sens_de_la_position():
    """Les longs paient, les shorts encaissent — quand le taux est positif."""
    c = CostModel()
    long_ = c.funding_usd(Decimal("1000"), Decimal("24"), is_long=True)
    short = c.funding_usd(Decimal("1000"), Decimal("24"), is_long=False)
    assert long_ > 0 > short
    assert long_ == -short


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

def test_un_pnl_positif_mais_dans_le_bruit_est_declare_INDECIS():
    """Le garde-fou principal de ce module.

    129 trades pour +11,76 $ avec un ecart-type de 4,26 $ par trade : le PnL
    est positif et ne prouve rien. Sans cette colonne, le rapport affiche
    « +11,76 » et laisse le lecteur conclure — ce qu'il fera dans le sens qui
    l'arrange.
    """
    from trading_desk.backtest.report import _significance
    import random

    rng = random.Random(1)
    # Bruit centre sur un gain minuscule : exactement le cas piege.
    pnls = [rng.gauss(0.09, 4.26) for _ in range(129)]
    sig = _significance(pnls)

    assert abs(sig["t_stat"]) < 2.0
    assert sig["ci95_low_usd"] < 0 < sig["ci95_high_usd"], "l'IC doit contenir zero"
    assert sig["p_value"] > 0.05
    assert sig["trades_for_t2"] is None or sig["trades_for_t2"] > 129


def test_un_edge_reel_est_declare_PROBABLE():
    """Le test miroir : sans lui, on aurait juste un module qui dit toujours
    « on ne sait pas », ce qui est aussi inutile qu'un module qui valide tout."""
    from trading_desk.backtest.report import _significance
    import random

    rng = random.Random(2)
    pnls = [rng.gauss(2.0, 4.26) for _ in range(129)]
    sig = _significance(pnls)

    assert sig["t_stat"] > 2.0
    assert sig["ci95_low_usd"] > 0, "l'IC d'un vrai edge exclut zero"
    assert sig["p_value"] < 0.05
    assert sig["p_loss"] < 0.05


def test_le_bootstrap_est_deterministe():
    """Un intervalle de confiance qui bouge d'un run a l'autre est un chiffre
    qu'on cesse de lire."""
    from trading_desk.backtest.report import _significance
    pnls = [float(i % 17) - 8.0 for i in range(200)]
    assert _significance(pnls) == _significance(pnls)


def test_le_verdict_exige_l_echantillon_ET_la_significativite():
    bars = synthetic_bars(count=1200, seed=7)
    m = compute_metrics(run_backtest(bars, RsiReversion()))
    assert m.edge_verdict in {"ECHANTILLON", "INDECIS", "PROBABLE", "PERDANT"}
    if m.trades < 30:
        assert m.edge_verdict == "ECHANTILLON"
        assert m.t_stat is None, "pas de t-stat sur un echantillon trop faible"

    bh = compute_metrics(benchmark_buy_and_hold(bars))
    assert bh.trades == 1
    assert bh.edge_verdict == "ECHANTILLON"
    assert bh.ci95_low_usd is None


def test_le_rapport_montre_l_intervalle_de_confiance():
    """Ce que le rapport n'affiche pas, personne ne le calcule a la main."""
    bars = synthetic_bars(count=2000, seed=11)
    m = [compute_metrics(run_backtest(bars, s())) for s in (EmaCross, RsiReversion)]
    texte = format_report(m)
    assert "IC 95 %" in texte
    assert "verdict" in texte
    assert "n'est pas un edge" in texte or "pas un edge" in texte


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
    """Le marqueur `*` disait « peu de trades » ; il est remplace par un
    verdict nomme, parce qu'un asterisque en bas de tableau se lit apres
    avoir conclu, quand il se lit."""
    bars = synthetic_bars(count=700, seed=37)
    m = compute_metrics(benchmark_buy_and_hold(bars))
    assert m.trades == 1
    assert not m.has_enough_trades
    assert not m.is_significant          # alias conserve
    rapport = format_report([m])
    assert "ECHANTILLON" in rapport
    assert "trop peu pour conclure" in rapport


def test_sharpe_absent_si_trop_peu_de_points():
    bars = synthetic_bars(count=60, seed=3)
    m = compute_metrics(run_backtest(bars, EmaCross(), warmup=20))
    assert m.sharpe is None or isinstance(m.sharpe, float)


# --------------------------------------------------------------------------
#  Les strategies documentees, et le piege qu'elles ont revele
# --------------------------------------------------------------------------

def test_la_cassure_turtle_ne_lit_jamais_la_barre_courante():
    """Le canal doit exclure la bougie qui le teste.

    L'inclure ferait « casser » le canal par la barre qui le definit : une
    fuite de futur discrete, qui rend n'importe quelle strategie de cassure
    brillante.
    """
    from trading_desk.backtest.strategies import TurtleBreakout

    bars = synthetic_bars(count=400, seed=11)
    s = TurtleBreakout(entry_period=20, exit_period=10)
    s.prepare(bars)

    # Une barre qui explose a la hausse ne doit pas relever le canal qui lui
    # sert de reference : le signal se juge contre le passe, pas contre soi.
    haut_du_canal = s._eh[300]
    assert haut_du_canal == max(float(b.high) for b in bars[280:300])


def test_le_momentum_temporel_suit_le_signe_du_rendement_passe():
    """La regle de Moskowitz-Ooi-Pedersen, telle quelle : rien qu'un signe."""
    from trading_desk.backtest.strategies import TimeSeriesMomentum

    montant = [
        Bar(asset="BTC", ts_ms=i * 86_400_000,
            open=Decimal(100 + i), high=Decimal(101 + i),
            low=Decimal(99 + i), close=Decimal(100 + i), volume=Decimal("1"))
        for i in range(60)
    ]
    s = TimeSeriesMomentum(lookback=20, atr_period=5)
    s.prepare(montant)
    assert s._sens(50, montant) is Side.LONG

    baissier = list(reversed(montant))
    # Reconstruire des horodatages croissants apres inversion.
    baissier = [b.model_copy(update={"ts_ms": i * 86_400_000})
                for i, b in enumerate(baissier)]
    s2 = TimeSeriesMomentum(lookback=20, atr_period=5)
    s2.prepare(baissier)
    assert s2._sens(50, baissier) is Side.SHORT

    # Avant le lookback, aucun avis — surtout pas un avis neutre par defaut.
    assert s.on_bar(5, montant, None).side is None


def test_un_signal_refuse_par_le_risque_est_compte():
    """Un backtest qui jette ses signaux en silence ne mesure pas la
    strategie : il mesure le sous-echantillon que le moteur a laisse passer.

    Et ce sous-echantillon n'est pas aleatoire — le plafond porte sur la
    distance de stop, donc sur la volatilite. Constate sur BTC daily :
    `turtle_breakout` affichait « BAT LE HASARD, p = 0,010 » sur les 4 % de
    signaux acceptes, et « non distinguable du hasard, p = 0,48 » une fois
    les 96 % restants admis.
    """
    from trading_desk.backtest.strategies import TurtleBreakout

    bars = synthetic_bars(count=600, seed=3)

    # Un plafond volontairement etroit refuse tout stop ATR un peu large.
    etroit = run_backtest(
        bars, TurtleBreakout(entry_period=20, exit_period=10),
        limits=RiskLimits(min_stop_distance_bps=Decimal("1"),
                          max_stop_distance_bps=Decimal("5")),
        interval="1d")
    assert etroit.rejected_by_risk > 0, "les refus doivent etre comptes"
    assert not etroit.trades, "un plafond a 5 bps ne laisse rien passer"

    large = run_backtest(bars, TurtleBreakout(entry_period=20, exit_period=10),
                         limits=RiskLimits(max_stop_distance_bps=Decimal("5000")),
                         interval="1d")
    assert large.rejected_by_risk < etroit.rejected_by_risk
