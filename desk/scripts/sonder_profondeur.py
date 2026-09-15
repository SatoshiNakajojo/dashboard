#!/usr/bin/env python3
"""Ce que coûte vraiment un ordre, selon sa taille, sur le carnet du moment.

    python3 scripts/sonder_profondeur.py
    python3 scripts/sonder_profondeur.py --actifs BTC ETH SOL DOGE

**Pourquoi ce script existe.** Le modèle de coûts facture 3 bps de glissement
par côté, et `costs.py` dit lui-même que c'est une constante posée faute de
carnet : « en backtest sur bougies, on ne voit pas le carnet ». Elle n'avait
jamais été confrontée.

Ce script prend le carnet RÉEL à l'instant, y fait passer des ordres de
tailles croissantes à travers le simulateur du mode PAPER, et relève le
glissement de chacun. C'est la même mesure que celle qui tourne en
production — `execution/glissement.py` — appliquée à une grille de tailles.

**Ce qu'il faut savoir avant de lire le résultat, et c'est décisif.**

1. **C'est UN instantané.** Un carnet calme et un carnet en cascade n'ont
   rien à voir. Lancer ce script un jour de panique et comparer est l'usage
   qui donne la vraie fourchette — pas une exécution un mardi après-midi.

2. **Le simulateur traverse un carnet FIGÉ.** Il ne modélise ni l'impact
   permanent de l'ordre, ni le retrait des autres participants quand ils le
   voient venir. Le papier reste optimiste, et un chiffre rassurant ici n'est
   pas une garantie.

3. **Un fill tronqué SOUS-ESTIME le coût.** Au-delà de 10 % du carnet
   visible, le simulateur refuse de servir davantage. Le glissement affiché
   est alors celui de la part servie, pas celui de l'ordre demandé — le
   script marque ces cas.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.request
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from trading_desk.contracts.common import EntryStyle, Side
from trading_desk.contracts.market import BookLevel, BookSnapshot
from trading_desk.contracts.orders import OrderIntent, OrderPurpose
from trading_desk.execution.glissement import mesurer
from trading_desk.execution.paper import PART_PROFONDEUR_MAX, PaperExchange

INFO = "https://api.hyperliquid.xyz/info"
TAILLES = (100, 500, 2_000, 10_000, 50_000, 200_000, 1_000_000)


def carnet(coin: str, niveaux: int = 50) -> BookSnapshot:
    req = urllib.request.Request(
        INFO, data=json.dumps({"type": "l2Book", "coin": coin}).encode(),
        headers={"Content-Type": "application/json"})
    d = json.loads(urllib.request.urlopen(req, timeout=25).read())
    bids, asks = d["levels"][0], d["levels"][1]
    return BookSnapshot(
        ts_ms=int(time.time() * 1000), asset=coin,
        bids=tuple(BookLevel(price=Decimal(x["px"]), size=Decimal(x["sz"]))
                   for x in bids[:niveaux]),
        asks=tuple(BookLevel(price=Decimal(x["px"]), size=Decimal(x["sz"]))
                   for x in asks[:niveaux]),
    )


def sonder(snap: BookSnapshot, usd: int) -> tuple[float | None, float]:
    """Le glissement d'un achat agressif de `usd` dollars, et la part servie."""
    ex = PaperExchange()
    ex.on_book(snap)
    mid = (snap.bids[0].price + snap.asks[0].price) / 2
    taille = (Decimal(usd) / mid).quantize(Decimal("0.00001"))
    if taille <= 0:
        return None, 0.0
    intent = OrderIntent(
        intent_id=f"sonde-{snap.asset}-{usd}", mandate_id="sonde",
        asset=snap.asset, side=Side.LONG, purpose=OrderPurpose.ENTRY,
        size=taille, limit_price=mid, style=EntryStyle.MARKET_IOC)
    record = ex.place(intent)
    g = mesurer(intent, record)
    servi = float(record.filled_size) / float(taille)
    return (g.bps if g else None), servi


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--actifs", nargs="+", default=["BTC", "ETH", "SOL"])
    p.add_argument("--tailles", nargs="+", type=int, default=list(TAILLES))
    args = p.parse_args()

    from trading_desk.backtest.costs import CostModel
    suppose = float(CostModel().slippage_bps)

    snaps = {}
    for coin in args.actifs:
        try:
            snaps[coin] = carnet(coin)
        except Exception as exc:
            print(f"  {coin} : carnet indisponible ({str(exc)[:40]})",
                  file=sys.stderr)
    if not snaps:
        print("\n  Aucun carnet lisible. L'API est-elle joignable ?\n")
        return 1

    horodatage = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())
    print("\n  GLISSEMENT D'UN ORDRE AGRESSIF SELON SA TAILLE")
    print(f"  Carnets relevés le {horodatage}. UN instantané — un jour de")
    print("  cascade donnerait tout autre chose.\n")
    print(f"  {'écart mid-ask':>16} " + "".join(f"{c:>13}" for c in snaps))
    ecarts = []
    for s in snaps.values():
        mid = (s.bids[0].price + s.asks[0].price) / 2
        ecarts.append(float((s.asks[0].price - mid) / mid * 10000))
    print(f"  {'':>16} " + "".join(f"{e:>12.2f} " for e in ecarts) + " bps")
    print()
    print(f"  {'taille $':>16} " + "".join(f"{c:>13}" for c in snaps))
    print("  " + "-" * (17 + 13 * len(snaps)))
    for usd in args.tailles:
        ligne = f"  {usd:>16,}"
        for snap in snaps.values():
            bps, servi = sonder(snap, usd)
            cell = f"{bps:+.2f}" if bps is not None else "—"
            if servi < 0.99:
                cell += f"*{servi:.0%}"
            ligne += f"{cell:>13}"
        print(ligne)

    print(f"\n  * = fill TRONQUÉ au-delà de {float(PART_PROFONDEUR_MAX):.0%} du carnet")
    print("    visible : la taille demandée n'a pas été servie, donc le chiffre")
    print("    SOUS-ESTIME le coût réel de l'ordre demandé.")
    print(f"\n  Le modèle de coûts suppose {suppose:.1f} bps par côté.")
    print("  Le simulateur traverse un carnet FIGÉ : ni impact permanent, ni")
    print("  retrait des autres participants. Le papier reste optimiste.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
