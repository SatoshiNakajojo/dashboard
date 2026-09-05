"""Tests de l'ingestion, de la persistance et de l'API de supervision.

Le parseur WebSocket est teste sur des messages malformes autant que sur des
messages valides : en production, la moitie des incidents vient de donnees
inattendues, pas de code absent.
"""

from __future__ import annotations

from decimal import Decimal

from fastapi.testclient import TestClient

from trading_desk.api.server import create_app
from trading_desk.api.state import DeskState, demo_account
from trading_desk.config import Settings
from trading_desk.contracts import (
    BookLevel, BookSnapshot, DeskMode, FeedHealth, FeedStatus, Side, Trade, now_ms,
)
from trading_desk.market import HyperliquidFeed, RequestBudget, Subscription
from trading_desk.storage import SqliteStore


# --------------------------------------------------------------------------
#  Sante des flux
# --------------------------------------------------------------------------

def test_flux_jamais_connecte_nest_pas_tradable():
    f = FeedHealth(name="x")
    assert f.evaluate().status is FeedStatus.NEVER_CONNECTED
    assert not f.evaluate().status.is_tradable


def test_flux_gele_devient_stale():
    t = now_ms()
    f = FeedHealth(name="x", status=FeedStatus.LIVE, last_message_ms=t - 30_000,
                   max_age_ms=10_000)
    assert f.evaluate(t).status is FeedStatus.STALE


def test_flux_frais_reste_live():
    t = now_ms()
    f = FeedHealth(name="x", status=FeedStatus.LIVE, last_message_ms=t - 500,
                   max_age_ms=10_000)
    assert f.evaluate(t).status is FeedStatus.LIVE


def test_deconnexion_explicite_non_ecrasee():
    """Une deconnexion connue ne doit pas etre requalifiee en 'stale' par le
    simple calcul d'age : la cause est plus informative que le symptome."""
    f = FeedHealth(name="x", status=FeedStatus.DISCONNECTED, last_message_ms=now_ms())
    assert f.evaluate().status is FeedStatus.DISCONNECTED


# --------------------------------------------------------------------------
#  Parseurs WebSocket
# --------------------------------------------------------------------------

def test_parse_trade_valide():
    feed = HyperliquidFeed(testnet=True)
    t = feed._parse_trade({"coin": "BTC", "px": "64000.5", "sz": "0.01",
                           "side": "B", "time": 1700})
    assert t is not None and t.asset == "BTC" and t.is_buy
    assert t.price == Decimal("64000.5")


def test_parse_trade_rejette_les_donnees_douteuses():
    feed = HyperliquidFeed(testnet=True)
    for bad in (
        {"coin": "BTC", "px": "0", "sz": "1"},          # prix nul
        {"coin": "BTC", "px": "abc", "sz": "1"},        # non numerique
        {"coin": "BTC", "px": "1", "sz": "-1"},         # taille negative
        {"px": "1", "sz": "1"},                         # actif absent
        {"coin": "BTC", "px": "NaN", "sz": "1"},        # NaN
    ):
        assert feed._parse_trade(bad) is None, bad


def test_parse_book_exige_les_deux_cotes():
    feed = HyperliquidFeed(testnet=True)
    assert feed._parse_book({"coin": "BTC", "levels": [[], []]}) is None
    ok = feed._parse_book({
        "coin": "BTC", "time": 1700,
        "levels": [[{"px": "100", "sz": "2"}], [{"px": "101", "sz": "3"}]],
    })
    assert ok is not None and ok.mid == Decimal("100.5")


def test_souscriptions_ont_des_seuils_adaptes():
    """Le funding bouge lentement : lui appliquer le seuil des trades le
    declarerait mort en permanence."""
    assert Subscription.book("BTC").max_age_ms < Subscription.asset_ctx("BTC").max_age_ms


def test_carnet_metriques():
    b = BookSnapshot(
        asset="BTC",
        bids=(BookLevel(price=Decimal("100"), size=Decimal("3")),),
        asks=(BookLevel(price=Decimal("102"), size=Decimal("1")),),
        ts_ms=now_ms(),
    )
    assert b.mid == Decimal("101")
    assert round(b.spread_bps, 0) == Decimal("198")
    assert b.imbalance() > 0          # pression acheteuse


# --------------------------------------------------------------------------
#  Budget de requetes
# --------------------------------------------------------------------------

def test_budget_refuse_au_dela_du_plafond_ip():
    b = RequestBudget(ip_weight_per_min=10, address_reserve=1000)
    for _ in range(10):
        assert b.can_spend(1)
        b.spend(1)
    assert not b.can_spend(1)


def test_reserve_par_adresse_s_epuise():
    b = RequestBudget(ip_weight_per_min=10_000, address_reserve=3)
    for _ in range(3):
        b.spend(1)
    assert not b.can_spend(1)
    assert b.snapshot().is_critical


def test_volume_recharge_la_reserve():
    b = RequestBudget(address_reserve=100)
    for _ in range(50):
        b.spend(1)
    before = b.snapshot().address_reserve_left
    b.credit_volume(500)
    assert b.snapshot().address_reserve_left > before


# --------------------------------------------------------------------------
#  Persistance
# --------------------------------------------------------------------------

def test_journal_append_only(tmp_path):
    store = SqliteStore(tmp_path / "t.db")
    ref = store.journal("decision", {"prompt": "…", "model_id": "x"}, "mdt_1")
    assert ref.startswith("jr_")
    rows = store.recent_journal(10)
    assert len(rows) == 1 and rows[0]["payload"]["model_id"] == "x"
    store.close()


def test_ecriture_trades_et_comptes(tmp_path):
    store = SqliteStore(tmp_path / "t.db")
    for i in range(5):
        store.write_trade(Trade(asset="BTC", price=Decimal("100") + i,
                                size=Decimal("1"), is_buy=True, ts_ms=now_ms() + i))
    store.commit()
    assert store.counts()["trades"] == 5
    assert store.last_prices()["BTC"] == "104"
    store.close()


# --------------------------------------------------------------------------
#  API de supervision
# --------------------------------------------------------------------------

def _client(tmp_path) -> tuple[TestClient, DeskState]:
    settings = Settings(mode=DeskMode.SHADOW, db_path=str(tmp_path / "api.db"))
    state = DeskState(settings, SqliteStore(settings.db_path))
    return TestClient(create_app(state)), state


def test_snapshot_complet(tmp_path):
    client, state = _client(tmp_path)
    state.set_account(demo_account())
    s = client.get("/api/snapshot").json()
    assert s["mode"] == "SHADOW"
    assert len(s["checks"]) == 12
    assert s["mandate"]["bias"] == "FLAT"
    assert s["account"]["equity_usd"] == "1000"


def test_kill_switch_et_rearmement(tmp_path):
    client, state = _client(tmp_path)
    assert client.post("/api/halt", json={"reason": "MANUAL"}).json()["halted"]
    assert state.halted
    assert client.get("/api/snapshot").json()["halted"]
    assert client.get("/api/health").status_code == 503

    client.post("/api/arm")
    assert not state.halted


def test_kill_switch_idempotent_garde_le_premier_motif(tmp_path):
    """La cascade d'erreurs ne doit pas effacer la cause initiale."""
    client, state = _client(tmp_path)
    client.post("/api/halt", json={"reason": "STALE_FEED", "detail": "flux BTC gele"})
    client.post("/api/halt", json={"reason": "MANUAL", "detail": "second appel"})
    assert state.halt_reason.value == "STALE_FEED"
    assert state.halt_detail == "flux BTC gele"


def test_motif_inconnu_retombe_sur_manual(tmp_path):
    client, state = _client(tmp_path)
    client.post("/api/halt", json={"reason": "N_IMPORTE_QUOI"})
    assert state.halt_reason.value == "MANUAL"


def test_arret_passe_le_mandat_en_flat(tmp_path):
    client, state = _client(tmp_path)
    state.set_mandate(
        __import__("trading_desk.contracts", fromlist=["Mandate"]).Mandate(
            bias=__import__("trading_desk.contracts", fromlist=["Bias"]).Bias.LONG,
            universe=("BTC",), max_notional_usd=Decimal("100"),
            max_concurrent_positions=1,
        )
    )
    client.post("/api/halt", json={"reason": "MANUAL"})
    assert client.get("/api/snapshot").json()["mandate"]["bias"] == "FLAT"


def test_interface_servie(tmp_path):
    client, _ = _client(tmp_path)
    r = client.get("/")
    assert r.status_code == 200
    assert "Supervision" in r.text


def test_mode_live_refuse_sans_agent_wallet():
    """La configuration doit echouer au demarrage, pas a la premiere signature."""
    import pytest
    from pydantic import ValidationError
    with pytest.raises(ValidationError, match="agent_wallet_address"):
        Settings(mode=DeskMode.LIVE, testnet=False)


def test_mode_live_refuse_le_droit_de_retrait():
    import pytest
    from pydantic import ValidationError
    with pytest.raises(ValidationError, match="droit de retrait"):
        Settings(mode=DeskMode.LIVE, testnet=False,
                 agent_wallet_address="0xagent", master_wallet_address="0xmaster",
                 signer_can_withdraw=True)


def test_mode_live_refuse_le_master_wallet():
    import pytest
    from pydantic import ValidationError
    with pytest.raises(ValidationError, match="master wallet"):
        Settings(mode=DeskMode.LIVE, testnet=False,
                 agent_wallet_address="0xsame", master_wallet_address="0xsame")


def test_side_est_exporte():
    assert Side.LONG.value == "LONG"


# --------------------------------------------------------------------------
#  Filtre de bruit du journal
# --------------------------------------------------------------------------

def test_le_filtre_de_bruit_ne_prend_que_sa_cible():
    """Un filtre de journal trop large transforme un vrai bug en silence.

    On verifie donc surtout ce qu'il NE filtre PAS : toute exception qui ne
    reunit pas les trois conditions doit garder sa trace complete.
    """
    from trading_desk.app import is_known_websockets_noise

    assert not is_known_websockets_noise(None)
    assert not is_known_websockets_noise(ValueError("status_code manquant"))
    assert not is_known_websockets_noise(AttributeError("autre chose"))

    # Bon type et bon message, mais pas la bonne origine : on ne filtre pas.
    try:
        raise AttributeError("'NoneType' object has no attribute 'status_code'")
    except AttributeError as exc:
        assert not is_known_websockets_noise(exc), (
            "sans origine websockets, la trace doit rester visible"
        )
