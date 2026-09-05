"""Tests du mandat.

Le mandat est la frontiere entre une couche qui a le droit de se tromper et une
couche qui ne l'a pas. Ces tests verifient les trois proprietes sur lesquelles
repose cette frontiere : bornage, peremption, et resserrage monotone.
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from pydantic import ValidationError

from trading_desk.contracts import Bias, Mandate, Regime, Side, StopBand, now_ms


def test_flat_est_le_defaut():
    m = Mandate.flat()
    assert m.bias is Bias.FLAT
    assert m.max_notional_usd == 0
    assert m.universe == ()
    assert not m.allows_entry("BTC", Side.LONG)


def test_mandat_directionnel_exige_des_moyens():
    with pytest.raises(ValidationError, match="univers non vide"):
        Mandate(bias=Bias.LONG)
    with pytest.raises(ValidationError, match="notionnel"):
        Mandate(bias=Bias.LONG, universe=("BTC",), max_concurrent_positions=1)


def test_mandat_flat_ne_peut_pas_porter_de_moyens():
    with pytest.raises(ValidationError, match="FLAT"):
        Mandate(bias=Bias.FLAT, universe=("BTC",), max_notional_usd=Decimal("100"))


def test_univers_normalise_et_dedoublonne():
    m = Mandate(bias=Bias.LONG, universe=("btc", "ETH", "Btc"),
                max_notional_usd=Decimal("100"), max_concurrent_positions=1)
    assert m.universe == ("BTC", "ETH")


def test_peremption():
    m = Mandate(bias=Bias.LONG, universe=("BTC",), max_notional_usd=Decimal("100"),
                max_concurrent_positions=1, ttl_ms=60_000)
    t = m.issued_at_ms
    assert not m.is_expired(t + 59_000)
    assert m.is_expired(t + 60_000)
    assert m.remaining_ms(t + 30_000) == 30_000
    assert m.remaining_ms(t + 999_000) == 0


def test_entree_refusee_apres_expiration():
    m = Mandate(bias=Bias.LONG, universe=("BTC",), max_notional_usd=Decimal("100"),
                max_concurrent_positions=1, ttl_ms=60_000)
    assert m.allows_entry("BTC", Side.LONG, m.issued_at_ms + 1_000)
    assert not m.allows_entry("BTC", Side.LONG, m.issued_at_ms + 61_000)


def test_ttl_borne():
    with pytest.raises(ValidationError):
        Mandate.flat(ttl_ms=5_000)                       # trop court
    with pytest.raises(ValidationError):
        Mandate(bias=Bias.FLAT, ttl_ms=99 * 60 * 60_000)  # trop long


@pytest.mark.parametrize(
    ("asset", "side", "ok"),
    [("BTC", Side.LONG, True), ("btc", Side.LONG, True),
     ("BTC", Side.SHORT, False), ("DOGE", Side.LONG, False)],
)
def test_autorisation_d_entree(asset, side, ok):
    m = Mandate(bias=Bias.LONG, universe=("BTC",), max_notional_usd=Decimal("100"),
                max_concurrent_positions=1)
    assert m.allows_entry(asset, side) is ok


def test_resserrage_est_monotone():
    """La propriete centrale : un agent ne peut jamais elargir un mandat."""
    m = Mandate(bias=Bias.LONG, universe=("BTC",), max_notional_usd=Decimal("500"),
                max_leverage=Decimal("2"), max_concurrent_positions=2)

    reduit = m.tightened(max_notional_usd=Decimal("200"), max_leverage=Decimal("1"),
                         max_concurrent_positions=1)
    assert reduit.max_notional_usd == Decimal("200")
    assert reduit.max_leverage == Decimal("1")
    assert reduit.max_concurrent_positions == 1

    # Une demande d'elargissement, meme massive, ne change rien.
    inchange = m.tightened(max_notional_usd=Decimal("999999"),
                           max_leverage=Decimal("20"),
                           max_concurrent_positions=20)
    assert inchange.max_notional_usd == Decimal("500")
    assert inchange.max_leverage == Decimal("2")
    assert inchange.max_concurrent_positions == 2


def test_stop_band_ordonnee():
    with pytest.raises(ValidationError, match="strictement inferieur"):
        StopBand(min_bps=Decimal("100"), max_bps=Decimal("50"))


def test_stop_band_contient():
    band = StopBand(min_bps=Decimal("30"), max_bps=Decimal("500"))
    assert band.contains(Decimal("30"))
    assert band.contains(Decimal("500"))
    assert not band.contains(Decimal("29"))
    assert not band.contains(Decimal("501"))


def test_mandat_immuable():
    m = Mandate.flat()
    with pytest.raises(ValidationError):
        m.mandate_id = "autre"


def test_champ_inconnu_rejete():
    """Une sortie de LLM qui invente un champ doit echouer bruyamment."""
    with pytest.raises(ValidationError):
        Mandate(bias=Bias.FLAT, leverage_max_secret=Decimal("50"))


def test_serialisation_aller_retour():
    m = Mandate(bias=Bias.SHORT, regime=Regime.HIGH_VOL, universe=("ETH",),
                max_notional_usd=Decimal("300"), max_concurrent_positions=1,
                journal_ref="jr_1", conviction=Decimal("0.7"))
    again = Mandate.model_validate(m.model_dump(mode="json"))
    assert again.mandate_id == m.mandate_id
    assert again.max_notional_usd == m.max_notional_usd
    assert again.regime is Regime.HIGH_VOL


def test_horodatage_par_defaut_coherent():
    m = Mandate.flat()
    assert abs(m.issued_at_ms - now_ms()) < 5_000
