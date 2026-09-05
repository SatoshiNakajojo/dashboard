"""Tests du formatage et du format filaire Hyperliquid.

Le formatage des prix est la premiere cause de rejets d'ordres, et l'erreur
arrive avec un message laconique. Ces tests encodent les regles exactes :

- prix : au plus 5 chiffres significatifs ET au plus `6 - szDecimals`
  decimales ; un entier est toujours accepte ;
- taille : arrondie a `szDecimals`, toujours vers le bas ;
- ni prix ni taille ne peuvent porter de zeros terminaux.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from trading_desk.contracts import EntryStyle, OrderIntent, OrderPurpose, Side
from trading_desk.execution.hyperliquid_format import (
    AssetMeta, FormatError, format_price, format_size, is_valid_price,
)
from trading_desk.execution.hyperliquid_wire import (
    L1_DOMAIN, action_hash, cancel_action, exchange_request, order_to_wire,
    phantom_agent, place_action, sign_l1_action,
)

BTC = AssetMeta(name="BTC", index=0, sz_decimals=5, max_leverage=40)
ETH = AssetMeta(name="ETH", index=1, sz_decimals=4, max_leverage=25)
DOGE = AssetMeta(name="DOGE", index=7, sz_decimals=0, max_leverage=10)


# --------------------------------------------------------------------------
#  Prix
# --------------------------------------------------------------------------

def test_les_exemples_de_la_documentation():
    """Cas cites textuellement par la documentation de l'exchange."""
    # 1234.5 valide, 1234.56 non (six chiffres significatifs).
    assert format_price(Decimal("1234.5"), ETH) == "1234.5"
    assert format_price(Decimal("1234.56"), ETH) == "1234.6"
    # Un entier passe toujours, quel que soit son nombre de chiffres.
    assert format_price(Decimal("123456"), ETH) == "123456"


def test_prix_entier_echappe_a_la_regle_des_significatifs():
    assert format_price(Decimal("64000"), BTC) == "64000"
    assert format_price(Decimal("1234567"), BTC) == "1234567"


def test_cinq_chiffres_significatifs_maximum():
    """Sans `side`, l'arrondi va au plus proche prix valide.

    64123.456 devient 64124 et non 64123 : les deux sont valides, le premier
    est plus proche. Le sens d'arrondi ne devient directionnel que lorsqu'un
    `side` est fourni, c'est-a-dire pour un vrai ordre.
    """
    out = format_price(Decimal("64123.456"), BTC)
    assert is_valid_price(out, BTC)
    assert abs(Decimal(out) - Decimal("64123.456")) <= Decimal("1")
    assert format_price(Decimal("6412.34"), BTC) == "6412.3"


def test_sous_un_les_zeros_de_tete_ne_comptent_pas():
    """0.0012345 a cinq chiffres significatifs, pas sept."""
    # szDecimals=0 pour DOGE, donc 6 decimales autorisees.
    assert format_price(Decimal("0.0012345"), DOGE) == "0.001234"
    assert format_price(Decimal("0.12345"), DOGE) == "0.12345"


def test_plafond_de_decimales_lie_a_szdecimals():
    """Avec szDecimals=5, un perp n'a droit qu'a une decimale."""
    assert BTC.max_price_decimals == 1
    assert ETH.max_price_decimals == 2
    assert DOGE.max_price_decimals == 6


def test_arrondi_defavorable_a_la_position():
    """Un prix arrondi en sa faveur produit un ordre qui ne se remplit pas."""
    achat = format_price(Decimal("6412.31"), BTC, side=Side.LONG)
    vente = format_price(Decimal("6412.31"), BTC, side=Side.SHORT)
    assert Decimal(achat) >= Decimal("6412.31") >= Decimal(vente)


def test_pas_de_zeros_terminaux():
    """L'API refuse `0.500` la ou `0.5` passe."""
    assert format_price(Decimal("3000.50"), ETH) == "3000.5"
    assert format_price(Decimal("3000.00"), ETH) == "3000"
    assert format_size(Decimal("1.50000"), ETH) == "1.5"


def test_prix_non_positif_refuse():
    for bad in (Decimal("0"), Decimal("-1")):
        with pytest.raises(FormatError):
            format_price(bad, BTC)


@pytest.mark.parametrize("price,ok", [
    ("1234.5", True), ("1234.56", False),
    ("123456", True), ("64000", True),
    ("0.001234", True), ("0.0012345", False),
    ("0", False), ("-5", False), ("abc", False),
])
def test_validation_independante(price, ok):
    assert is_valid_price(price, DOGE) is ok


# --------------------------------------------------------------------------
#  Tailles
# --------------------------------------------------------------------------

def test_taille_arrondie_vers_le_bas():
    """Vers le bas, toujours : arrondir vers le haut ferait depasser le
    notionnel autorise par le moteur de risque."""
    assert format_size(Decimal("1.999999"), DOGE) == "1"
    assert format_size(Decimal("0.123456789"), BTC) == "0.12345"


def test_taille_qui_s_annule_a_l_arrondi_est_refusee():
    """Silencieusement arrondie a zero, elle produirait un ordre vide."""
    with pytest.raises(FormatError, match="trop petite"):
        format_size(Decimal("0.4"), DOGE)          # szDecimals = 0
    with pytest.raises(FormatError, match="trop petite"):
        format_size(Decimal("0.000001"), BTC)      # szDecimals = 5


def test_taille_non_positive_refusee():
    with pytest.raises(FormatError):
        format_size(Decimal("0"), BTC)


# --------------------------------------------------------------------------
#  Format filaire
# --------------------------------------------------------------------------

def _intent(**over) -> OrderIntent:
    base = dict(
        intent_id="e-000001", mandate_id="mdt_1", asset="BTC", side=Side.LONG,
        purpose=OrderPurpose.ENTRY, size=Decimal("0.01"),
        limit_price=Decimal("64000"),
    )
    base.update(over)
    return OrderIntent(**base)


def test_ordre_limite_passif_est_post_only():
    """`Alo` garantit le statut maker. Sans lui, une entree « passive »
    croiserait le carnet et paierait des frais taker sans le dire."""
    wire = order_to_wire(_intent(style=EntryStyle.LIMIT_PASSIVE), BTC)
    assert wire["t"] == {"limit": {"tif": "Alo"}}
    assert wire["a"] == 0
    assert wire["b"] is True
    assert wire["p"] == "64000"
    assert wire["s"] == "0.01"
    assert wire["r"] is False
    assert wire["c"].startswith("0x")


def test_ordre_market_est_un_ioc_avec_plafond_de_slippage():
    """Hyperliquid n'a pas d'ordre market : c'est un IOC place assez loin."""
    wire = order_to_wire(
        _intent(style=EntryStyle.MARKET_IOC), BTC,
        market_slippage_bps=Decimal("50"),
    )
    assert wire["t"] == {"limit": {"tif": "Ioc"}}
    assert Decimal(wire["p"]) > Decimal("64000"), "un achat market paie plus haut"
    assert Decimal(wire["p"]) <= Decimal("64000") * Decimal("1.005")


def test_market_vend_plus_bas():
    wire = order_to_wire(
        _intent(side=Side.SHORT, style=EntryStyle.MARKET_IOC), BTC,
    )
    assert Decimal(wire["p"]) < Decimal("64000")


def test_stop_est_un_declencheur_market():
    """Un stop limite peut ne jamais etre servi quand on en a besoin : ce
    serait une protection illusoire."""
    wire = order_to_wire(_intent(
        side=Side.SHORT, purpose=OrderPurpose.STOP_LOSS,
        trigger_price=Decimal("62000"), reduce_only=True, limit_price=None,
        style=EntryStyle.MARKET_IOC,
    ), BTC)
    assert wire["t"]["trigger"]["isMarket"] is True
    assert wire["t"]["trigger"]["tpsl"] == "sl"
    assert wire["r"] is True


def test_take_profit_porte_le_bon_marqueur():
    wire = order_to_wire(_intent(
        side=Side.SHORT, purpose=OrderPurpose.TAKE_PROFIT,
        trigger_price=Decimal("66000"), reduce_only=True, limit_price=None,
        style=EntryStyle.MARKET_IOC,
    ), BTC)
    assert wire["t"]["trigger"]["tpsl"] == "tp"


def test_metadonnees_du_mauvais_actif_refusees():
    """Une confusion d'actif enverrait un ordre sur le mauvais marche."""
    with pytest.raises(FormatError, match="ETH"):
        order_to_wire(_intent(), ETH)


def test_cloid_du_wire_correspond_a_l_intention():
    from trading_desk.execution import make_cloid
    intent = _intent()
    assert order_to_wire(intent, BTC)["c"] == make_cloid(intent)


# --------------------------------------------------------------------------
#  Signature
# --------------------------------------------------------------------------

def test_le_hash_depend_du_nonce():
    action = place_action([order_to_wire(_intent(), BTC)])
    assert action_hash(action, 1) != action_hash(action, 2)


def test_le_hash_est_deterministe():
    action = place_action([order_to_wire(_intent(), BTC)])
    assert action_hash(action, 42) == action_hash(action, 42)
    assert len(action_hash(action, 42)) == 32


def test_le_hash_depend_du_vault():
    action = place_action([order_to_wire(_intent(), BTC)])
    seul = action_hash(action, 1)
    vault = action_hash(action, 1, vault_address="0x" + "ab" * 20)
    assert seul != vault


def test_chain_id_1337_quel_que_soit_le_reseau():
    """Signer avec l'identifiant de chaine d'Arbitrum produit un
    INVALID_SIGNATURE sur une requete par ailleurs impeccable."""
    assert L1_DOMAIN["chainId"] == 1337
    assert L1_DOMAIN["name"] == "Exchange"


def test_l_agent_fantome_distingue_les_reseaux():
    digest = b"\x01" * 32
    assert phantom_agent(digest, is_mainnet=True)["source"] == "a"
    assert phantom_agent(digest, is_mainnet=False)["source"] == "b"


def test_signature_produite_et_verifiable():
    """La signature doit remonter a l'adresse du signataire.

    Cle de test publique et sans valeur : elle ne sert qu'a verifier que le
    circuit de signature est coherent de bout en bout.
    """
    from eth_account import Account

    key = "0x" + "11" * 32
    account = Account.from_key(key)
    action = place_action([order_to_wire(_intent(), BTC)])

    sig = sign_l1_action(key, action, nonce=1_700_000_000_000, is_mainnet=False)
    assert sig["v"] in (27, 28)
    assert sig["r"].startswith("0x") and len(sig["r"]) == 66
    assert sig["s"].startswith("0x") and len(sig["s"]) == 66

    # Meme action et meme nonce -> meme signature (deterministe).
    again = sign_l1_action(key, action, nonce=1_700_000_000_000, is_mainnet=False)
    assert sig == again
    # Nonce different -> signature differente.
    other = sign_l1_action(key, action, nonce=1_700_000_000_001, is_mainnet=False)
    assert sig != other
    assert account.address.startswith("0x")


def test_corps_de_requete_complet():
    action = place_action([order_to_wire(_intent(), BTC)])
    sig = sign_l1_action("0x" + "11" * 32, action, nonce=1, is_mainnet=False)
    body = exchange_request(action, sig, 1)
    assert set(body) == {"action", "nonce", "signature"}
    assert body["action"]["type"] == "order"

    with_vault = exchange_request(action, sig, 1, vault_address="0xabc")
    assert with_vault["vaultAddress"] == "0xabc"


def test_annulation_par_cloid():
    action = cancel_action([{"asset": 0, "cloid": "0x" + "a" * 32}])
    assert action["type"] == "cancelByCloid"
    assert len(action["cancels"]) == 1
