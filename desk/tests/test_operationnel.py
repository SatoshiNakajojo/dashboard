"""Le desk livre doit pouvoir TRADER avec sa configuration livree.

Ce fichier existe pour la panne la plus couteuse de ce depot, parce qu'elle
a l'air de marcher : le desk tournait, douze invariants au vert, et refusait
chaque entree — indefiniment.

    « BTC non dimensionnable : stop a 1500 bps hors bornes [30, 500] »

quarante-trois fois en deux minutes, dans une liste de refus que personne ne
lisait. La seule strategie livree pose son stop a 15 % ; le plafond livre en
autorisait 5. Les deux etaient defendables separement et incompatibles
ensemble.

Les invariants disent si le desk a le DROIT d'agir. Ils ne disent pas s'il
PEUT agir. Il fallait les deux, et c'est ce que verifie ce fichier.
"""

from __future__ import annotations

from decimal import Decimal

from trading_desk.config import Settings
from trading_desk.contracts.common import Side
from trading_desk.contracts.mandate import Bias, Mandate, Regime, StopBand
from trading_desk.contracts.orders import AccountState
from trading_desk.risk.sizing import size_position
from trading_desk.sentinelle.pilote_deblocages import STOP_PCT


def _compte(equite: str = "1000") -> AccountState:
    return AccountState(equity_usd=Decimal(equite),
                        available_margin_usd=Decimal(equite),
                        used_margin_usd=Decimal("0"))


def _mandat(limites) -> Mandate:
    """Le mandat tel que le pupitre le construit : sa fourchette de stop
    reprend celle du deploiement."""
    return Mandate(
        bias=Bias.SHORT, regime=Regime.RANGE, universe=("BTC",),
        max_notional_usd=limites.max_gross_notional_usd,
        max_leverage=limites.max_effective_leverage,
        max_concurrent_positions=4,
        stop_band=StopBand(min_bps=limites.min_stop_distance_bps,
                           max_bps=limites.max_stop_distance_bps),
        journal_ref="essai",
    )


def test_la_configuration_livree_laisse_passer_la_strategie_livree():
    """LE TEST QUI MANQUAIT.

    Avec les valeurs par defaut, une entree de la regle des deverrouillages
    doit etre dimensionnable. Si elle ne l'est pas, le desk est inerte :
    il tournera sans jamais rien faire, et rien ne le dira.
    """
    limites = Settings().risk_limits()
    stop_bps = STOP_PCT * Decimal("10000")

    assert limites.min_stop_distance_bps <= stop_bps <= limites.max_stop_distance_bps, (
        f"le signal livre pose son stop a {stop_bps:.0f} bps, hors des bornes "
        f"livrees [{limites.min_stop_distance_bps:.0f}, "
        f"{limites.max_stop_distance_bps:.0f}] : le desk refusera tout")

    entree = Decimal("77000")
    taille = size_position(
        account=_compte(), mandate=_mandat(limites), limits=limites,
        asset="BTC", side=Side.SHORT,
        entry_price=entree, stop_price=entree * (1 + STOP_PCT),
    )
    assert taille.size > 0, f"entree refusee : {taille.binding_constraint}"


def test_un_stop_plus_large_donne_une_position_plus_petite():
    """La raison pour laquelle elargir le plafond de stop est SANS DANGER.

    Le dimensionnement est fonde sur le risque — `size = budget / distance`.
    Doubler la distance au stop divise la taille par deux, donc la perte au
    stop reste la meme. Si cette propriete se perdait, elargir la borne
    deviendrait une prise de risque, et tout le raisonnement du fichier
    `limits.py` tomberait avec elle.
    """
    limites = Settings().risk_limits()
    mandat = _mandat(limites)
    entree = Decimal("77000")

    def perte_au_stop(pct: Decimal) -> Decimal:
        t = size_position(
            account=_compte(), mandate=mandat, limits=limites,
            asset="BTC", side=Side.SHORT,
            entry_price=entree, stop_price=entree * (1 + pct),
        )
        assert t.size > 0, f"stop {pct} refuse : {t.binding_constraint}"
        return t.size * entree * pct

    etroit = perte_au_stop(Decimal("0.05"))
    large = perte_au_stop(Decimal("0.15"))

    # Trois fois plus large, meme perte au stop — a l'arrondi de taille pres.
    assert abs(etroit - large) / etroit < Decimal("0.05"), (
        f"la perte au stop depend de la distance : {etroit} contre {large}. "
        "Le dimensionnement n'est plus fonde sur le risque.")


def test_le_budget_de_risque_est_bien_celui_annonce():
    """0,5 % de l'equite par trade, et pas davantage.

    Mesure sur le desk reel : equite 1000 $, stop a 15 %, BTC a 77 018 $ ->
    taille 0,0004, soit 30,81 $ de notionnel et 4,62 $ de perte au stop.
    """
    limites = Settings().risk_limits()
    entree = Decimal("77000")
    taille = size_position(
        account=_compte("1000"), mandate=_mandat(limites), limits=limites,
        asset="BTC", side=Side.SHORT,
        entry_price=entree, stop_price=entree * (1 + STOP_PCT),
    )
    perte = taille.size * entree * STOP_PCT
    budget = limites.risk_budget_usd(Decimal("1000"))
    assert perte <= budget, f"perte au stop {perte} > budget {budget}"
    # Et l'arrondi de taille ne doit pas manger la position entiere.
    assert perte > budget * Decimal("0.5"), (
        f"perte au stop {perte} tres inferieure au budget {budget} : "
        "l'arrondi de taille rend la position derisoire")
