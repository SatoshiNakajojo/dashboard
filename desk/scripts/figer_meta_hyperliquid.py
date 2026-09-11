#!/usr/bin/env python3
"""Figer les metadonnees d'actifs que l'exchange publie.

    python scripts/figer_meta_hyperliquid.py            # testnet
    python scripts/figer_meta_hyperliquid.py --mainnet

**Pourquoi les figer.** Le formatage des prix et des tailles est la premiere
cause de rejet d'ordre, et il depend entierement de `szDecimals`, qui varie
par actif. Un test qui ne verifie le formateur que sur BTC ne prouve rien :
BTC a cinq decimales de taille, DOGE en a zero, et c'est aux extremes que
les regles se cassent.

On veut donc valider sur TOUT l'univers de l'exchange, a chaque test, y
compris hors reseau. D'ou l'instantane versionne.

Il n'est pas une source de verite pour le desk, qui lit toujours `meta` en
direct au demarrage : c'est une reference de TEST. Un ecart entre les deux
est une information — l'exchange a ajoute des actifs ou change une
precision — et c'est pour ca que le test compare aussi en direct quand le
reseau repond.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from trading_desk.execution.hyperliquid_client import HyperliquidClient


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--mainnet", action="store_true")
    p.add_argument("--out", default="tests/meta_hyperliquid.json")
    args = p.parse_args()

    reseau = "mainnet" if args.mainnet else "testnet"
    client = HyperliquidClient(
        account_address="0x" + "00" * 20,
        private_key=None,
        testnet=not args.mainnet,
    )
    meta = client.load_meta()
    actifs = {
        nom: {"index": m.index, "sz_decimals": m.sz_decimals,
              "is_spot": m.is_spot, "max_leverage": m.max_leverage}
        for nom, m in sorted(meta.items())
    }
    sortie = Path(__file__).resolve().parents[1] / args.out
    sortie.write_text(json.dumps(
        {"reseau": reseau, "actifs": actifs}, indent=1) + "\n", encoding="utf-8")
    par_dec: dict[int, int] = {}
    for m in actifs.values():
        par_dec[m["sz_decimals"]] = par_dec.get(m["sz_decimals"], 0) + 1
    print(f"  {len(actifs)} actifs ({reseau}) -> {sortie}")
    print("  szDecimals :", ", ".join(
        f"{k}→{v} actifs" for k, v in sorted(par_dec.items())))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
