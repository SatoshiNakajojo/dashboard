"""Traduction de nos intentions vers le format filaire Hyperliquid, et signature.

Deux couches distinctes, volontairement separees :

- **le format filaire** (`order_to_wire`, `place_action`) : pur, deterministe,
  testable sans cle et sans reseau ;
- **la signature** (`action_hash`, `sign_l1_action`) : msgpack → keccak →
  agent fantome → EIP-712.

Rappel du mecanisme, parce qu'il surprend : une action L1 n'est pas signee
directement. Elle est serialisee en msgpack, on y concatene le nonce et un
marqueur de vault, on hache le tout en keccak-256, et ce hash devient le
`connectionId` d'une structure typee appelee *agent fantome*, qui est ce qu'on
signe reellement. Le domaine EIP-712 utilise **chainId 1337**, quel que soit
le reseau — signer avec l'identifiant de chaine d'Arbitrum produit un
`INVALID_SIGNATURE` sur une requete par ailleurs impeccable.

AVERTISSEMENT — cette implementation n'a PAS ete confrontee a l'exchange. Les
regles proviennent de la documentation ; la validation par des vecteurs de
signature du SDK officiel reste a faire avant le premier ordre reel. C'est
explicitement une tache de la porte P1.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any, Literal

from ..contracts.common import EntryStyle, Side
from ..contracts.orders import OrderIntent, OrderPurpose
from .cloid import make_cloid
from .hyperliquid_format import AssetMeta, FormatError, format_price, format_size

# Le domaine des actions L1. `chainId` vaut 1337 sur mainnet comme sur testnet.
L1_DOMAIN: dict[str, Any] = {
    "name": "Exchange",
    "version": "1",
    "chainId": 1337,
    "verifyingContract": "0x0000000000000000000000000000000000000000",
}

AGENT_TYPES: dict[str, list[dict[str, str]]] = {
    "Agent": [
        {"name": "source", "type": "string"},
        {"name": "connectionId", "type": "bytes32"},
    ]
}

Tif = Literal["Alo", "Ioc", "Gtc"]

# Correspondance entre nos styles d'entree et le "time in force" de l'exchange.
# `Alo` (add liquidity only) garantit le statut maker : l'ordre est annule
# plutot que de croiser le carnet. C'est ce qu'on veut d'une entree passive —
# sinon elle devient taker et paie trois fois plus de frais sans le dire.
TIF_BY_STYLE: dict[EntryStyle, Tif] = {
    EntryStyle.LIMIT_PASSIVE: "Alo",
    EntryStyle.LIMIT_AGGRESSIVE: "Gtc",
    EntryStyle.MARKET_IOC: "Ioc",
}


def order_to_wire(
    intent: OrderIntent,
    meta: AssetMeta,
    *,
    market_slippage_bps: Decimal = Decimal("50"),
    reference_price: Decimal | None = None,
) -> dict[str, Any]:
    """Convertit une intention en objet filaire.

    Hyperliquid n'a pas d'ordre "market" : un market est un ordre limite en
    IOC, place assez loin dans le carnet pour etre servi. `market_slippage_bps`
    est ce "assez loin", et c'est un plafond de degat, pas une esperance —
    au-dela, l'ordre reste partiellement non servi plutot que de payer
    n'importe quel prix.
    """
    if meta.name.upper() != intent.asset.upper():
        raise FormatError(
            f"metadonnees de {meta.name} utilisees pour un ordre sur {intent.asset}"
        )

    is_buy = intent.side is Side.LONG
    wire: dict[str, Any] = {
        "a": meta.index,
        "b": is_buy,
        "s": format_size(intent.size, meta),
        "r": intent.reduce_only,
        "c": make_cloid(intent),
    }

    if intent.purpose in (OrderPurpose.STOP_LOSS, OrderPurpose.TAKE_PROFIT):
        if intent.trigger_price is None:
            raise FormatError(f"{intent.purpose} sans trigger_price")
        trigger = format_price(intent.trigger_price, meta, side=intent.side)
        # Un stop declencheur est envoye en market : quand le niveau casse, on
        # sort. Un stop limite peut ne jamais etre servi exactement quand on en
        # a besoin, ce qui en fait une protection illusoire.
        wire["p"] = trigger
        wire["t"] = {
            "trigger": {
                "isMarket": True,
                "triggerPx": trigger,
                "tpsl": "sl" if intent.purpose is OrderPurpose.STOP_LOSS else "tp",
            }
        }
        return wire

    price = intent.limit_price
    if intent.style is EntryStyle.MARKET_IOC:
        base = price or reference_price
        if base is None:
            raise FormatError("un ordre market exige un prix de reference")
        slip = base * market_slippage_bps / Decimal("10000")
        price = base + slip if is_buy else base - slip
    if price is None:
        raise FormatError("ordre limite sans prix")

    wire["p"] = format_price(price, meta, side=intent.side)
    wire["t"] = {"limit": {"tif": TIF_BY_STYLE[intent.style]}}
    return wire


def place_action(orders: list[dict[str, Any]], *, grouping: str = "na") -> dict[str, Any]:
    """Enveloppe d'action `order`.

    L'ordre des cles compte : le hash porte sur la serialisation msgpack, donc
    deux dictionnaires equivalents mais ordonnes differemment produisent deux
    signatures differentes. On construit donc toujours l'action ici.
    """
    return {"type": "order", "orders": orders, "grouping": grouping}


def cancel_action(cancels: list[dict[str, Any]]) -> dict[str, Any]:
    """Annulation par cloid. `{"asset": index, "cloid": "0x…"}` par entree."""
    return {"type": "cancelByCloid", "cancels": cancels}


# --------------------------------------------------------------------------
#  Signature
# --------------------------------------------------------------------------

def action_hash(
    action: dict[str, Any],
    nonce: int,
    *,
    vault_address: str | None = None,
    expires_after_ms: int | None = None,
) -> bytes:
    """Hash keccak-256 de l'action, tel que l'exchange le recalcule.

    L'ordre de concatenation n'est pas negociable : msgpack de l'action, puis
    le nonce sur 8 octets big-endian, puis le marqueur de vault, puis
    l'eventuelle expiration. Toute permutation donne un hash different, donc
    une signature refusee.
    """
    import msgpack
    from eth_utils import keccak

    data = msgpack.packb(action, use_bin_type=True)
    data += nonce.to_bytes(8, "big")

    if vault_address is None:
        data += b"\x00"
    else:
        data += b"\x01" + bytes.fromhex(vault_address.removeprefix("0x"))

    if expires_after_ms is not None:
        data += b"\x00" + expires_after_ms.to_bytes(8, "big")

    return keccak(data)


def phantom_agent(connection_id: bytes, *, is_mainnet: bool) -> dict[str, Any]:
    """L'agent fantome : la structure typee reellement signee.

    `source` distingue les reseaux — "a" pour mainnet, "b" pour testnet. C'est
    le seul endroit ou le reseau intervient dans la signature : le `chainId`,
    lui, reste 1337 des deux cotes.
    """
    return {"source": "a" if is_mainnet else "b", "connectionId": connection_id}


def l1_payload(connection_id: bytes, *, is_mainnet: bool) -> dict[str, Any]:
    """Message EIP-712 complet, pret pour `eth_account`."""
    return {
        "domain": L1_DOMAIN,
        "types": {
            "EIP712Domain": [
                {"name": "name", "type": "string"},
                {"name": "version", "type": "string"},
                {"name": "chainId", "type": "uint256"},
                {"name": "verifyingContract", "type": "address"},
            ],
            **AGENT_TYPES,
        },
        "primaryType": "Agent",
        "message": phantom_agent(connection_id, is_mainnet=is_mainnet),
    }


def sign_l1_action(
    private_key: str,
    action: dict[str, Any],
    nonce: int,
    *,
    is_mainnet: bool,
    vault_address: str | None = None,
    expires_after_ms: int | None = None,
) -> dict[str, Any]:
    """Signe une action L1 et renvoie `{r, s, v}`.

    La cle privee n'entre que par cet argument, et n'est ni journalisee, ni
    stockee, ni renvoyee. Ce module est destine a tourner dans le processus
    signer isole — jamais dans celui qui parle aux modeles (invariant I12).
    """
    from eth_account import Account
    from eth_account.messages import encode_typed_data

    digest = action_hash(action, nonce, vault_address=vault_address,
                         expires_after_ms=expires_after_ms)
    payload = l1_payload(digest, is_mainnet=is_mainnet)
    signed = Account.sign_typed_data(
        private_key,
        domain_data=payload["domain"],
        message_types=AGENT_TYPES,
        message_data=payload["message"],
    ) if hasattr(Account, "sign_typed_data") else Account.sign_message(
        encode_typed_data(full_message=payload), private_key=private_key
    )

    return {
        "r": f"0x{signed.r:064x}",
        "s": f"0x{signed.s:064x}",
        "v": signed.v,
    }


def exchange_request(
    action: dict[str, Any],
    signature: dict[str, Any],
    nonce: int,
    *,
    vault_address: str | None = None,
) -> dict[str, Any]:
    """Corps de la requete POST /exchange."""
    body: dict[str, Any] = {
        "action": action,
        "nonce": nonce,
        "signature": signature,
    }
    if vault_address is not None:
        body["vaultAddress"] = vault_address
    return body
