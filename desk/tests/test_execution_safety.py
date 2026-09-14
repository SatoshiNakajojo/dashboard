"""Tests des mecanismes qui empechent de doubler une position ou de perdre
un ordre : cloid deterministe, nonces monotones, dimensionnement borne.

Ce sont les tests qui protegent l'argent. Ils doivent rester lisibles par
quelqu'un qui debarque a 3 h du matin apres une alerte.
"""

from __future__ import annotations

import threading
from decimal import Decimal

import pytest

from trading_desk.contracts import (
    Bias, EntryStyle, Mandate, OrderIntent, OrderPurpose, Side,
)
from trading_desk.execution import (
    ClockDriftError, MonotonicNonceSource, assert_nonce_window, is_valid_cloid,
    make_cloid,
)
from trading_desk.execution.nonce import MAX_FUTURE_MS, MAX_PAST_MS
from trading_desk.risk import RiskLimits, size_position


def _intent(**over) -> OrderIntent:
    base = dict(
        intent_id="seq-001", mandate_id="mdt_x", asset="BTC", side=Side.LONG,
        purpose=OrderPurpose.ENTRY, size=Decimal("0.01"),
        limit_price=Decimal("60000"),
    )
    base.update(over)
    return OrderIntent(**base)


# --------------------------------------------------------------------------
#  cloid : l'idempotence des renvois
# --------------------------------------------------------------------------

def test_cloid_bien_forme():
    c = make_cloid(_intent())
    assert is_valid_cloid(c)
    assert len(c) == 34 and c.startswith("0x")


def test_cloid_stable_entre_deux_appels():
    assert make_cloid(_intent()) == make_cloid(_intent())


def test_cloid_ignore_l_horodatage():
    """Le point crucial : un renvoi apres timeout doit produire le MEME cloid.

    Si l'horodatage entrait dans le calcul, l'idempotence disparaitrait
    exactement au moment ou on en a besoin — et la position doublerait.
    """
    a = _intent(created_at_ms=1_000)
    b = _intent(created_at_ms=9_999_999)
    assert make_cloid(a) == make_cloid(b)


@pytest.mark.parametrize(
    "change",
    [
        {"intent_id": "seq-002"},
        {"asset": "ETH"},
        {"side": Side.SHORT},
        {"size": Decimal("0.02")},
        {"limit_price": Decimal("60001")},
        {"mandate_id": "mdt_y"},
        {"purpose": OrderPurpose.REDUCE},
    ],
)
def test_cloid_change_si_l_ordre_change(change):
    assert make_cloid(_intent()) != make_cloid(_intent(**change))


def test_cloid_insensible_a_la_representation_decimale():
    """0.01 et 0.0100 sont le meme ordre : ils doivent partager un cloid,
    sinon un simple reformatage recreerait une position."""
    assert make_cloid(_intent(size=Decimal("0.01"))) == \
           make_cloid(_intent(size=Decimal("0.0100")))


def test_cloid_invalide_rejete():
    for bad in ("", "0x123", "abc", "0x" + "g" * 32, "0x" + "A" * 32):
        assert not is_valid_cloid(bad)


# --------------------------------------------------------------------------
#  Ordres protecteurs
# --------------------------------------------------------------------------

def test_stop_doit_etre_reduce_only():
    with pytest.raises(ValueError, match="reduce_only"):
        _intent(purpose=OrderPurpose.STOP_LOSS, trigger_price=Decimal("59000"),
                reduce_only=False)


def test_stop_exige_un_trigger():
    with pytest.raises(ValueError, match="trigger_price"):
        _intent(purpose=OrderPurpose.STOP_LOSS, reduce_only=True)


def test_entree_limite_exige_un_prix():
    with pytest.raises(ValueError, match="limit_price"):
        _intent(limit_price=None, style=EntryStyle.LIMIT_PASSIVE)


# --------------------------------------------------------------------------
#  Nonces
# --------------------------------------------------------------------------

def test_nonces_strictement_croissants():
    src = MonotonicNonceSource()
    values = [src.next_nonce() for _ in range(1000)]
    assert values == sorted(values)
    assert len(set(values)) == 1000, "deux nonces identiques dans la meme ms"


def test_nonces_uniques_sous_concurrence():
    """Le cas qui casse `int(time.time() * 1000)` : plusieurs threads qui
    signent dans la meme milliseconde."""
    src = MonotonicNonceSource()
    out: list[int] = []
    lock = threading.Lock()

    def worker():
        local = [src.next_nonce() for _ in range(200)]
        with lock:
            out.extend(local)

    threads = [threading.Thread(target=worker) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(out) == 1600
    assert len(set(out)) == 1600


def test_horloge_qui_recule_ne_fait_pas_reculer_le_compteur(monkeypatch):
    src = MonotonicNonceSource()
    first = src.next_nonce()
    monkeypatch.setattr("trading_desk.execution.nonce.now_ms", lambda: first - 10_000)
    assert src.next_nonce() > first


def test_fenetre_de_nonce():
    ref = 1_700_000_000_000
    assert_nonce_window(ref, ref)                       # ne leve pas
    with pytest.raises(ClockDriftError, match="retard"):
        assert_nonce_window(ref - MAX_PAST_MS - 1, ref)
    with pytest.raises(ClockDriftError, match="avance"):
        assert_nonce_window(ref + MAX_FUTURE_MS + 1, ref)


# --------------------------------------------------------------------------
#  Dimensionnement
# --------------------------------------------------------------------------

def _mandate(notional="500") -> Mandate:
    return Mandate(bias=Bias.LONG, universe=("BTC",),
                   max_notional_usd=Decimal(notional), max_leverage=Decimal("2"),
                   max_concurrent_positions=1)


def test_taille_suit_le_budget_de_risque(account):
    """0,5 % de 1000 USD = 5 USD de risque ; stop a 600 USD -> 0,0083 BTC."""
    r = size_position(
        account=account, mandate=_mandate(), limits=RiskLimits(), asset="BTC",
        side=Side.LONG, entry_price=Decimal("60000"), stop_price=Decimal("59400"),
    )
    assert r.is_tradable
    assert r.risk_usd <= Decimal("5")
    assert r.binding_constraint == "budget de risque"


def test_plafond_de_notionnel_prend_le_dessus(account):
    """Stop tres serre : le budget de risque autoriserait une position enorme,
    le plafond de notionnel doit trancher."""
    r = size_position(
        account=account, mandate=_mandate("100"), limits=RiskLimits(), asset="BTC",
        side=Side.LONG, entry_price=Decimal("60000"), stop_price=Decimal("59820"),
    )
    assert r.notional_usd <= Decimal("100")
    assert r.binding_constraint == "notionnel du mandat"


def test_facteur_consultatif_ne_peut_que_reduire(account):
    args = dict(account=account, mandate=_mandate(), limits=RiskLimits(),
                asset="BTC", side=Side.LONG, entry_price=Decimal("60000"),
                stop_price=Decimal("59400"))
    base = size_position(**args)
    reduit = size_position(**args, advisory_factor=Decimal("0.5"))
    elargi = size_position(**args, advisory_factor=Decimal("5"))
    assert reduit.size < base.size
    assert elargi.size == base.size, "un facteur > 1 ne doit rien elargir"


def test_stop_hors_bornes_refuse(account):
    trop_serre = size_position(
        account=account, mandate=_mandate(), limits=RiskLimits(), asset="BTC",
        side=Side.LONG, entry_price=Decimal("60000"), stop_price=Decimal("59990"),
    )
    assert not trop_serre.is_tradable
    trop_large = size_position(
        account=account, mandate=_mandate(), limits=RiskLimits(), asset="BTC",
        side=Side.LONG, entry_price=Decimal("60000"), stop_price=Decimal("20000"),
    )
    assert not trop_large.is_tradable


def test_actif_hors_mandat_refuse(account):
    r = size_position(
        account=account, mandate=_mandate(), limits=RiskLimits(), asset="DOGE",
        side=Side.LONG, entry_price=Decimal("0.4"), stop_price=Decimal("0.38"),
    )
    assert not r.is_tradable
    assert r.binding_constraint == "entree non autorisee par le mandat"


def test_notionnel_brut_deja_consomme(account, open_position):
    """Le notionnel restant tient compte des positions deja ouvertes."""
    limits = RiskLimits(max_gross_notional_usd=Decimal("700"),
                        max_position_notional_usd=Decimal("700"))
    saturated = account.model_copy(update={
        "positions": tuple(
            open_position.model_copy(update={"asset": f"A{i}", "size": Decimal("0.005")})
            for i in range(2)
        )
    })
    r = size_position(
        account=saturated, mandate=_mandate("700"), limits=limits, asset="BTC",
        side=Side.LONG, entry_price=Decimal("60000"), stop_price=Decimal("59700"),
    )
    assert r.notional_usd + saturated.gross_notional_usd <= limits.max_gross_notional_usd
