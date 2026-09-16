"""La part du capital qu'une position prend — et que personne n'a choisie.

Le desk prend 3,3 % du capital par position là où la validation en suppose
25 %. Ce module de test fige la raison pour laquelle l'écart a pu vivre des
mois sans être vu : **3,3 % n'est le réglage de personne.** C'est le quotient
de deux réglages faits pour d'autres raisons, et un quotient n'apparaît dans
aucun fichier de configuration.

Les tests vérifient donc trois choses, dans cet ordre d'importance :

1. que le quotient est bien celui que le moteur de risque produit réellement,
   et pas une formule qui y ressemble ;
2. que l'inverse est exact, parce que c'est lui qui est actionnable ;
3. que les plafonds sont traduits dans la même unité que la fraction, sans
   quoi la question « peut-on monter à 25 % ? » n'a pas de réponse.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from trading_desk.contracts.common import Bias, Side
from trading_desk.contracts.mandate import Mandate, StopBand
from trading_desk.contracts.orders import AccountState
from trading_desk.risk import size_position
from trading_desk.risk.fraction import (
    FRACTION_VALIDEE_PCT, diagnostic, fraction_par_position_pct, plafonds,
    risque_pour_fraction_pct,
)
from trading_desk.risk.limits import RiskLimits


def _compte(equity="1000"):
    return AccountState(equity_usd=Decimal(equity),
                        available_margin_usd=Decimal(equity),
                        used_margin_usd=Decimal("0"), positions=())


def _mandat():
    return Mandate(bias=Bias.SHORT, max_notional_usd=Decimal("500"),
                   universe=("X",), max_concurrent_positions=2,
                   stop_band=StopBand(min_bps=Decimal("30"),
                                      max_bps=Decimal("1600")),
                   max_leverage=Decimal("3"))


@pytest.mark.parametrize("stop_pct", ["0.15", "0.10", "0.05"])
def test_la_formule_est_celle_que_le_MOTEUR_produit(stop_pct):
    """**Le test qui compte.**

    Une formule qui ressemble au moteur sans en être l'image afficherait un
    chiffre faux avec l'autorité d'une mesure — exactement le défaut que ce
    dépôt traque partout ailleurs. On confronte donc la formule au
    dimensionnement réel, à trois distances de stop.
    """
    sp = Decimal(stop_pct)
    limites, compte, mandat = RiskLimits(), _compte(), _mandat()
    prix = Decimal("100")

    reel = size_position(account=compte, mandate=mandat, limits=limites,
                         asset="X", side=Side.SHORT, entry_price=prix,
                         stop_price=prix * (Decimal("1") + sp))
    mesuree = reel.notional_usd / compte.equity_usd * Decimal("100")
    calculee = fraction_par_position_pct(limites.risk_per_trade_pct, sp)

    # Les deux ne peuvent pas être exactement égales : le moteur arrondit la
    # taille au quantum de 4 décimales (ici 0,3333 unité à un prix de 100,
    # soit une troncature relative d'environ 3.10⁻⁴), la formule non.
    #
    # La tolérance est fixée à trois fois cette troncature : assez pour
    # l'absorber, trop serré pour laisser passer une formule qui décrirait
    # autre chose que le moteur — un tel écart se compterait en points de
    # pourcentage, pas en dix-millièmes.
    assert float(calculee) == pytest.approx(float(mesuree), rel=1e-3)
    assert reel.binding_constraint == "budget de risque", (
        "si un plafond mordait, la formule ne décrirait plus la taille réelle")


def test_le_deploye_vaut_bien_trois_virgule_trois():
    """0,5 % de risque par trade divisé par un stop de 15 %."""
    assert fraction_par_position_pct(
        Decimal("0.5"), Decimal("0.15")) == pytest.approx(Decimal("3.3333"),
                                                          abs=Decimal("0.001"))


def test_l_inverse_est_le_chiffre_actionnable():
    """Pour 25 % du capital avec un stop de 15 %, il faut 3,75 % de risque.

    Sept fois et demie la valeur actuelle. Écrit comme ça, ça se voit et ça se
    discute — contrairement à un quotient qui n'apparaît nulle part.
    """
    requis = risque_pour_fraction_pct(FRACTION_VALIDEE_PCT, Decimal("0.15"))
    assert requis == Decimal("3.75")
    # et l'aller-retour boucle
    assert fraction_par_position_pct(requis, Decimal("0.15")) == FRACTION_VALIDEE_PCT


def test_un_stop_nul_leve_plutot_que_de_diviser():
    for f in (fraction_par_position_pct, risque_pour_fraction_pct):
        with pytest.raises(ValueError, match="strictement positive"):
            f(Decimal("1"), Decimal("0"))


def test_aucun_plafond_ne_mord_a_la_taille_validee():
    """La réponse à « peut-on monter à 25 % ? » sans avoir à essayer.

    Sur 1 000 $ : 250 $ par position contre un plafond de 500 $, un notionnel
    brut de 1 000 $ et un levier de 3×. Rien ne mord. Ce qui bloquait était un
    garde-fou posé ailleurs, pas une limite du desk.
    """
    d = diagnostic(RiskLimits(), stop_pct=Decimal("0.15"))
    assert d["plafonds_bloquants"] == []
    assert d["facteur"] == pytest.approx(7.5)
    assert d["risque_par_trade_requis_pct"] == pytest.approx(3.75)


def test_un_plafond_qui_mord_est_nomme():
    """Un réglage changé sans regarder les plafonds produit un desk qui refuse
    en silence ce qu'on croit avoir autorisé."""
    serre = RiskLimits(max_position_notional_usd=Decimal("100"))  # 10 % de 1 000 $
    d = diagnostic(serre, stop_pct=Decimal("0.15"))
    assert "notionnel max par position" in d["plafonds_bloquants"]


def test_les_plafonds_sont_traduits_en_fraction_du_capital():
    """Les limites sont en dollars, la taille en fraction : tant qu'elles ne
    sont pas dans la même unité, on ne peut pas les comparer."""
    ps = {p.nom: p.fraction_max_pct for p in plafonds(RiskLimits(), Decimal("1000"))}
    assert ps["notionnel max par position"] == Decimal("50")
    assert ps["notionnel brut max"] == Decimal("100")


def test_un_capital_nul_ne_divise_pas_par_zero():
    assert plafonds(RiskLimits(), Decimal("0")) == []
