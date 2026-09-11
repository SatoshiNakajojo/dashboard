#!/usr/bin/env python3
"""Figer les vecteurs de signature produits par le SDK officiel.

    pip install hyperliquid-python-sdk
    python scripts/vecteurs_signature.py

**Pourquoi figer plutot que dependre du SDK.** Notre implementation de la
signature Hyperliquid n'engage pas seulement du code : elle engage de
l'argent. Elle doit donc etre verifiee a chaque test, sur toute machine,
qu'un paquet tiers soit installe ou non. Un test qui se met en `skip` quand
le SDK manque ne garde rien le jour ou il compte.

Les vecteurs sont donc produits ICI, une fois, par le SDK, et versionnes.
Les tests les rejouent toujours ; quand le SDK est present ils le confrontent
en plus, ce qui detecte une evolution de l'implementation de reference.

**La cle est publique et sans fonds** — c'est celle des tests du SDK. Une
signature deterministe exige une cle fixe ; celle-ci ne peut rien detenir.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

CLE_PUBLIQUE_DE_TEST = (
    "0x0123456789012345678901234567890123456789012345678901234567890123"
)
VAULT = "0x1719884eb866cb12b2287399b15f7db5e7d775ea"

CAS: list[dict] = [
    {"nom": "ordre limite Gtc",
     "action": {"type": "order", "grouping": "na", "orders": [
         {"a": 0, "b": True, "p": "100", "s": "0.1", "r": False,
          "t": {"limit": {"tif": "Gtc"}}}]},
     "nonce": 0},
    {"nom": "ordre passif Alo avec cloid",
     "action": {"type": "order", "grouping": "na", "orders": [
         {"a": 1, "b": False, "p": "3000.5", "s": "2", "r": True,
          "c": "0x00000000000000000000000000000001",
          "t": {"limit": {"tif": "Alo"}}}]},
     "nonce": 1234567890123},
    {"nom": "ordre Ioc",
     "action": {"type": "order", "grouping": "na", "orders": [
         {"a": 4, "b": True, "p": "0.00012345", "s": "1000000", "r": False,
          "t": {"limit": {"tif": "Ioc"}}}]},
     "nonce": 1},
    {"nom": "stop declencheur au marche",
     "action": {"type": "order", "grouping": "na", "orders": [
         {"a": 0, "b": False, "p": "95000", "s": "0.05", "r": True,
          "t": {"trigger": {"isMarket": True, "triggerPx": "95000",
                            "tpsl": "sl"}}}]},
     "nonce": 99},
    {"nom": "prise de benefice",
     "action": {"type": "order", "grouping": "na", "orders": [
         {"a": 0, "b": False, "p": "120000", "s": "0.05", "r": True,
          "t": {"trigger": {"isMarket": True, "triggerPx": "120000",
                            "tpsl": "tp"}}}]},
     "nonce": 100},
    {"nom": "deux ordres groupes",
     "action": {"type": "order", "grouping": "normalTpsl", "orders": [
         {"a": 0, "b": True, "p": "100", "s": "0.1", "r": False,
          "t": {"limit": {"tif": "Gtc"}}},
         {"a": 0, "b": False, "p": "90", "s": "0.1", "r": True,
          "t": {"trigger": {"isMarket": True, "triggerPx": "90",
                            "tpsl": "sl"}}}]},
     "nonce": 555},
    {"nom": "annulation par cloid",
     "action": {"type": "cancelByCloid", "cancels": [
         {"asset": 0, "cloid": "0x00000000000000000000000000000001"}]},
     "nonce": 7},
    {"nom": "action vide",
     "action": {"type": "order", "grouping": "na", "orders": []},
     "nonce": 42},
    {"nom": "coffre",
     "action": {"type": "order", "grouping": "na", "orders": []},
     "nonce": 42, "vault": VAULT},
    {"nom": "expiration",
     "action": {"type": "order", "grouping": "na", "orders": []},
     "nonce": 42, "expires_after_ms": 1700000000000},
    {"nom": "coffre et expiration",
     "action": {"type": "order", "grouping": "na", "orders": []},
     "nonce": 42, "vault": VAULT, "expires_after_ms": 1700000000000},
    # Un nonce a 8 octets pleins : la concatenation big-endian doit tenir.
    {"nom": "nonce maximal",
     "action": {"type": "order", "grouping": "na", "orders": []},
     "nonce": 2 ** 64 - 1},
]


def main() -> int:
    try:
        from eth_account import Account
        from hyperliquid.utils.signing import action_hash, sign_l1_action
    except ImportError:
        print("  hyperliquid-python-sdk absent : pip install hyperliquid-python-sdk",
              file=sys.stderr)
        return 1

    portefeuille = Account.from_key(CLE_PUBLIQUE_DE_TEST)
    vecteurs = []
    for cas in CAS:
        for reseau, mainnet in (("mainnet", True), ("testnet", False)):
            vault = cas.get("vault")
            exp = cas.get("expires_after_ms")
            h = action_hash(cas["action"], vault, cas["nonce"], exp)
            sig = sign_l1_action(portefeuille, cas["action"], vault,
                                 cas["nonce"], exp, mainnet)
            vecteurs.append({
                "nom": f"{cas['nom']} / {reseau}",
                "action": cas["action"],
                "nonce": cas["nonce"],
                "vault": vault,
                "expires_after_ms": exp,
                "is_mainnet": mainnet,
                "action_hash": h.hex(),
                "signature": sig,
            })

    import hyperliquid
    sortie = Path(__file__).resolve().parents[1] / "tests/vecteurs_signature.json"
    sortie.write_text(json.dumps({
        "source": "hyperliquid-python-sdk",
        "version": getattr(hyperliquid, "__version__", "inconnue"),
        "cle": CLE_PUBLIQUE_DE_TEST,
        "avertissement": "cle de test publique du SDK, sans fonds, jamais un secret",
        "vecteurs": vecteurs,
    }, indent=1) + "\n", encoding="utf-8")
    print(f"  {len(vecteurs)} vecteurs -> {sortie}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
