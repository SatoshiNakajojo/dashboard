"""Tests du client HTTP Hyperliquid, avec un transport injecte.

Deux familles de tests, et la seconde est la plus importante :

1. **Les parseurs** — sur des reponses de la forme documentee, et surtout sur
   des reponses degradees. En production, la moitie des incidents vient de
   donnees inattendues.
2. **La classification des erreurs** — quelles pannes sont sures a renvoyer et
   lesquelles ne le sont pas. Confondre un timeout de lecture avec un echec de
   connexion est exactement la facon dont on double une position.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

import pytest

from trading_desk.contracts import (
    OrderIntent, OrderPurpose, OrderStatus, Side,
)
from trading_desk.execution.exchange import (
    ExchangeError, ExchangeRejected, ExchangeTimeout,
)
from trading_desk.execution.hyperliquid_client import HyperliquidClient
from trading_desk.execution.hyperliquid_format import AssetMeta
from trading_desk.market.budget import RequestBudget

ADDRESS = "0x" + "ab" * 20
KEY = "0x" + "11" * 32

META_RESPONSE = {
    "universe": [
        {"name": "BTC", "szDecimals": 5, "maxLeverage": 40},
        {"name": "ETH", "szDecimals": 4, "maxLeverage": 25},
    ]
}


class Recorder:
    """Transport factice : renvoie des reponses scriptees et note les appels."""

    def __init__(self, responses: dict[str, Any] | None = None) -> None:
        self.responses = responses or {}
        self.calls: list[tuple[str, dict]] = []

    def __call__(self, url: str, payload: dict, timeout_s: float) -> Any:
        self.calls.append((url, payload))
        key = payload.get("type") or ("exchange" if "action" in payload else "?")
        value = self.responses.get(key)
        if isinstance(value, Exception):
            raise value
        if callable(value):
            return value(payload)
        return value


def _client(responses=None, **over) -> tuple[HyperliquidClient, Recorder]:
    transport = Recorder(responses or {"meta": META_RESPONSE})
    base = dict(account_address=ADDRESS, private_key=KEY, testnet=True,
                transport=transport)
    base.update(over)
    client = HyperliquidClient(**base)
    return client, transport


def _intent(**over) -> OrderIntent:
    base = dict(intent_id="e-000001", mandate_id="mdt_1", asset="BTC",
                side=Side.LONG, purpose=OrderPurpose.ENTRY,
                size=Decimal("0.01"), limit_price=Decimal("64000"))
    base.update(over)
    return OrderIntent(**base)


# --------------------------------------------------------------------------
#  Metadonnees
# --------------------------------------------------------------------------

def test_chargement_des_metadonnees():
    """L'index dans `universe` est ce que le format filaire attend, pas le nom.
    Une erreur ici enverrait un ordre sur le mauvais marche."""
    client, _ = _client()
    metas = client.load_meta()
    assert metas["BTC"].index == 0
    assert metas["ETH"].index == 1
    assert metas["BTC"].sz_decimals == 5


def test_actif_inconnu_refuse_avant_tout_envoi():
    client, _ = _client()
    client.load_meta()
    with pytest.raises(ExchangeError, match="metadonnees inconnues"):
        client.meta_for("DOGE")


def test_placer_sans_metadonnees_echoue_proprement():
    client, _ = _client()
    with pytest.raises(ExchangeError, match="load_meta"):
        client.place(_intent())


def test_client_en_lecture_seule_refuse_d_ecrire():
    """Sans cle, aucun ordre ne part — la lecture reste possible."""
    client, _ = _client(private_key=None)
    client.load_meta()
    with pytest.raises(ExchangeError, match="lecture seule"):
        client.place(_intent())


# --------------------------------------------------------------------------
#  Etat du compte
# --------------------------------------------------------------------------

STATE_RESPONSE = {
    "marginSummary": {"accountValue": "1000.0", "totalMarginUsed": "289.0"},
    "withdrawable": "711.0",
    "assetPositions": [
        {"type": "oneWay", "position": {
            "coin": "BTC", "szi": "0.0045", "entryPx": "63820.0",
            "positionValue": "288.94", "unrealizedPnl": "1.75",
            "leverage": {"type": "cross", "value": 2}, "liquidationPx": "42120.0",
        }},
    ],
}

STOP_ORDER = {
    "coin": "BTC", "side": "A", "sz": "0.0045", "oid": 991,
    "isTrigger": True, "triggerPx": "62000.0", "orderType": "Stop Market",
    "reduceOnly": True, "cloid": "0x" + "cd" * 16, "limitPx": "62000.0",
}


def test_position_longue_et_protegee():
    client, _ = _client({
        "meta": META_RESPONSE,
        "clearinghouseState": STATE_RESPONSE,
        "frontendOpenOrders": [STOP_ORDER],
    })
    state = client.account_state()

    assert state.equity_usd == Decimal("1000.0")
    assert state.available_margin_usd == Decimal("711.0")
    assert len(state.positions) == 1

    pos = state.positions[0]
    assert pos.side is Side.LONG
    assert pos.size == Decimal("0.0045")
    assert pos.is_protected, "le stop au carnet doit rendre la position protegee"
    assert not state.unprotected_positions


def test_position_sans_stop_est_signalee_nue():
    """C'est cette lecture, et elle seule, qui alimente l'invariant I02."""
    client, _ = _client({
        "meta": META_RESPONSE,
        "clearinghouseState": STATE_RESPONSE,
        "frontendOpenOrders": [],
    })
    state = client.account_state()
    assert not state.positions[0].is_protected
    assert state.unprotected_positions


def test_szi_negatif_est_un_short():
    short_state = {
        **STATE_RESPONSE,
        "assetPositions": [{"type": "oneWay", "position": {
            "coin": "ETH", "szi": "-1.5", "entryPx": "3000.0",
            "positionValue": "4500.0", "unrealizedPnl": "-12.0",
            "leverage": {"type": "cross", "value": 3},
        }}],
    }
    client, _ = _client({
        "meta": META_RESPONSE, "clearinghouseState": short_state,
        "frontendOpenOrders": [],
    })
    pos = client.account_state().positions[0]
    assert pos.side is Side.SHORT
    assert pos.size == Decimal("1.5"), "la taille est toujours positive"


def test_position_de_taille_nulle_ignoree():
    """Hyperliquid laisse parfois l'entree en place apres une fermeture. La
    traiter comme ouverte declencherait un stop de secours sur du vide."""
    empty = {
        **STATE_RESPONSE,
        "assetPositions": [{"type": "oneWay", "position": {
            "coin": "BTC", "szi": "0.0", "entryPx": "63820.0",
        }}],
    }
    client, _ = _client({
        "meta": META_RESPONSE, "clearinghouseState": empty,
        "frontendOpenOrders": [],
    })
    assert client.account_state().positions == ()


def test_position_illisible_ignoree_sans_casser_la_lecture():
    broken = {
        **STATE_RESPONSE,
        "assetPositions": [
            {"type": "oneWay", "position": {"coin": None, "szi": "1"}},
            {"type": "oneWay", "position": {"coin": "BTC", "szi": "abc"}},
            STATE_RESPONSE["assetPositions"][0],
        ],
    }
    client, _ = _client({
        "meta": META_RESPONSE, "clearinghouseState": broken,
        "frontendOpenOrders": [],
    })
    assert len(client.account_state().positions) == 1


def test_take_profit_distingue_du_stop():
    tp = {**STOP_ORDER, "orderType": "Take Profit Market"}
    client, _ = _client({
        "meta": META_RESPONSE, "clearinghouseState": STATE_RESPONSE,
        "frontendOpenOrders": [tp],
    })
    state = client.account_state()
    assert state.open_orders[0].intent.purpose is OrderPurpose.TAKE_PROFIT
    # Un take profit ne protege pas : la position reste nue.
    assert not state.positions[0].is_protected


def test_fills_parses():
    client, _ = _client({
        "meta": META_RESPONSE,
        "userFillsByTime": [
            {"coin": "BTC", "px": "63820.0", "sz": "0.0045", "side": "B",
             "time": 1700000000000, "fee": "0.129", "tid": 12345,
             "crossed": True, "cloid": "0x" + "ef" * 16},
            {"coin": "BTC", "px": "0", "sz": "1", "side": "B", "time": 1},
        ],
    })
    fills = client.fills_since(0)
    assert len(fills) == 1, "un fill a prix nul doit etre ignore"
    assert fills[0].side is Side.LONG
    assert fills[0].is_maker is False
    assert fills[0].fee_usd == Decimal("0.129")


# --------------------------------------------------------------------------
#  Reponses d'ordre
# --------------------------------------------------------------------------

def _place(status_payload: dict) -> tuple[HyperliquidClient, Recorder]:
    client, transport = _client({
        "meta": META_RESPONSE,
        "exchange": {"status": "ok", "response": {
            "type": "order", "data": {"statuses": [status_payload]}}},
    })
    client.load_meta()
    return client, transport


def test_ordre_au_carnet():
    client, _ = _place({"resting": {"oid": 555, "cloid": "0x" + "aa" * 16}})
    record = client.place(_intent())
    assert record.status is OrderStatus.RESTING
    assert record.exchange_oid == 555


def test_ordre_servi():
    client, _ = _place({"filled": {"totalSz": "0.01", "avgPx": "64001.0", "oid": 556}})
    record = client.place(_intent())
    assert record.status is OrderStatus.FILLED
    assert record.filled_size == Decimal("0.01")
    assert record.avg_price == Decimal("64001.0")


def test_fill_partiel():
    client, _ = _place({"filled": {"totalSz": "0.004", "avgPx": "64001.0", "oid": 557}})
    record = client.place(_intent())
    assert record.status is OrderStatus.PARTIAL


def test_erreur_dans_le_statut_est_un_rejet():
    """L'enveloppe dit `status: ok` meme quand l'ordre est refuse.

    S'y fier ferait croire a un succes sur un ordre jamais cree — le desk
    poserait un stop sur une position inexistante.
    """
    client, _ = _place({"error": "Insufficient margin to place order"})
    record = client.place(_intent())
    assert record.status is OrderStatus.REJECTED
    assert "margin" in record.error


def test_statut_non_reconnu_force_la_reconciliation():
    client, _ = _place({"quelqueChoseDeNouveau": {}})
    record = client.place(_intent())
    assert record.status is OrderStatus.UNKNOWN


def test_enveloppe_en_erreur_leve_un_rejet():
    client, _ = _client({
        "meta": META_RESPONSE,
        "exchange": {"status": "err", "response": "Signature invalide"},
    })
    client.load_meta()
    with pytest.raises(ExchangeRejected, match="Signature"):
        client.place(_intent())


def test_reponse_sans_statut_leve_une_erreur():
    client, _ = _client({
        "meta": META_RESPONSE,
        "exchange": {"status": "ok", "response": {"type": "order", "data": {}}},
    })
    client.load_meta()
    with pytest.raises(ExchangeError, match="sans statut"):
        client.place(_intent())


# --------------------------------------------------------------------------
#  Classification des erreurs — la partie qui protege l'argent
# --------------------------------------------------------------------------

def test_le_timeout_remonte_tel_quel():
    """Un timeout de lecture signifie que la requete est partie et qu'on ignore
    ce qu'elle a produit. Il ne doit surtout pas etre requalifie en echec."""
    client, _ = _client({
        "meta": META_RESPONSE,
        "exchange": ExchangeTimeout("reponse non recue"),
    })
    client.load_meta()
    with pytest.raises(ExchangeTimeout):
        client.place(_intent())


def test_l_erreur_de_connexion_reste_une_erreur():
    """Jamais partie : renvoi sans danger, donc `ExchangeError` et non timeout."""
    client, _ = _client({
        "meta": META_RESPONSE,
        "exchange": ExchangeError("connexion impossible"),
    })
    client.load_meta()
    with pytest.raises(ExchangeError) as exc:
        client.place(_intent())
    assert not isinstance(exc.value, ExchangeTimeout)


def test_les_trois_erreurs_restent_distinctes():
    """Les confondre dans un `except Exception` unique est exactement la facon
    dont on double une position en production."""
    assert issubclass(ExchangeTimeout, ExchangeError)
    assert issubclass(ExchangeRejected, ExchangeError)
    assert not issubclass(ExchangeRejected, ExchangeTimeout)
    assert not issubclass(ExchangeTimeout, ExchangeRejected)


# --------------------------------------------------------------------------
#  Budget et nonces
# --------------------------------------------------------------------------

def test_budget_epuise_bloque_avant_l_envoi():
    """Mieux vaut refuser nous-memes que d'etre bride par l'exchange : une fois
    bride, on ne peut plus fermer ses positions rapidement."""
    # Une seule requete Info tient dans le budget (poids 2), pas deux.
    budget = RequestBudget(ip_weight_per_min=2, address_reserve=2)
    client, transport = _client({"meta": META_RESPONSE}, budget=budget)
    client.load_meta()                      # consomme tout le budget
    with pytest.raises(ExchangeError, match="budget"):
        client.account_state()


def test_chaque_ordre_consomme_un_nonce_croissant():
    client, transport = _place({"resting": {"oid": 1}})
    client.place(_intent())
    client.place(_intent(intent_id="e-000002"))

    nonces = [p["nonce"] for _, p in transport.calls if "nonce" in p]
    assert len(nonces) == 2
    assert nonces[1] > nonces[0], "deux ordres ne partagent jamais un nonce"


def test_le_corps_envoye_a_la_bonne_forme():
    client, transport = _place({"resting": {"oid": 1}})
    client.place(_intent())

    url, body = transport.calls[-1]
    assert url.endswith("/exchange")
    assert set(body) == {"action", "nonce", "signature"}
    assert body["action"]["type"] == "order"
    order = body["action"]["orders"][0]
    assert order["a"] == 0                  # index de BTC
    assert order["b"] is True               # achat
    assert order["s"] == "0.01"
    assert order["c"].startswith("0x")


def test_testnet_et_mainnet_ont_des_urls_distinctes():
    testnet, _ = _client()
    mainnet, _ = _client(testnet=False)
    assert "testnet" in testnet.base
    assert "testnet" not in mainnet.base
    assert mainnet.is_mainnet and not testnet.is_mainnet


def test_annuler_un_ordre_inexistant_renvoie_faux():
    client, _ = _client({
        "meta": META_RESPONSE, "clearinghouseState": STATE_RESPONSE,
        "frontendOpenOrders": [],
    })
    client.load_meta()
    assert client.cancel("0x" + "00" * 16) is False
