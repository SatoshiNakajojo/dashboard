#!/usr/bin/env python3
"""Télécharge l'historique de bougies Hyperliquid dans un fichier JSON.

Script autonome : **aucune dépendance**, rien à installer. Python 3.9+ suffit.

    python3 fetch_candles.py                    # BTC, 1h, 365 jours
    python3 fetch_candles.py --asset ETH
    python3 fetch_candles.py --asset BTC --interval 4h --days 730

Il existe parce que l'environnement où ce projet est développé n'a pas accès
à `api.hyperliquid.xyz` (refus de politique réseau). Ce fichier se lance
depuis n'importe quelle machine ayant Internet, et produit exactement les
données dont le backtest a besoin.

Le fichier écrit contient les bougies brutes, telles que l'API les renvoie.
Rien n'est transformé ni filtré ici : la conversion appartient au projet, pour
que ce script reste vérifiable d'un coup d'œil.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request

MAINNET = "https://api.hyperliquid.xyz/info"
TESTNET = "https://api.hyperliquid-testnet.xyz/info"

INTERVAL_MS = {
    "1m": 60_000, "5m": 300_000, "15m": 900_000,
    "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000,
}

# L'API renvoie au plus ~5000 bougies par appel : on pagine en dessous.
PER_CALL = 4_500


def fetch(url: str, coin: str, interval: str, start: int, end: int) -> list:
    body = json.dumps({
        "type": "candleSnapshot",
        "req": {"coin": coin, "interval": interval,
                "startTime": start, "endTime": end},
    }).encode("utf-8")
    req = urllib.request.Request(
        url, data=body, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> int:
    p = argparse.ArgumentParser(description="Bougies Hyperliquid → JSON")
    p.add_argument("--asset", default="BTC")
    p.add_argument("--interval", default="1h", choices=sorted(INTERVAL_MS))
    p.add_argument("--days", type=int, default=365)
    p.add_argument("--testnet", action="store_true")
    p.add_argument("--out", default=None)
    args = p.parse_args()

    url = TESTNET if args.testnet else MAINNET
    step = INTERVAL_MS[args.interval]
    end = int(time.time() * 1000)
    cursor = end - args.days * 86_400_000

    print(f"  Téléchargement {args.asset} {args.interval} sur {args.days} jours…")
    rows: list = []
    while cursor < end:
        window_end = min(end, cursor + PER_CALL * step)
        try:
            chunk = fetch(url, args.asset, args.interval, cursor, window_end)
        except urllib.error.HTTPError as exc:
            print(f"\n  Erreur HTTP {exc.code} : {exc.reason}", file=sys.stderr)
            print("  Vérifier que l'actif existe (BTC, ETH, SOL…).", file=sys.stderr)
            return 2
        except (urllib.error.URLError, TimeoutError) as exc:
            print(f"\n  Réseau injoignable : {exc}", file=sys.stderr)
            return 2

        if not chunk:
            break
        rows.extend(chunk)
        last = int(chunk[-1]["t"])
        if last <= cursor:
            break                      # l'API ne progresse plus
        cursor = last + step
        print(f"    {len(rows)} bougies…", end="\r", flush=True)
        time.sleep(0.15)               # courtoisie : rester loin des limites

    if not rows:
        print("\n  Aucune bougie renvoyée. Vérifier l'actif et l'intervalle.",
              file=sys.stderr)
        return 2

    out = args.out or f"{args.asset}_{args.interval}_{args.days}d.json"
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(rows, fh)

    first_ts = int(rows[0]["t"]) / 1000
    last_ts = int(rows[-1]["t"]) / 1000
    fmt = "%Y-%m-%d"
    print(f"\n  {len(rows)} bougies écrites dans : {out}")
    print(f"  Période : {time.strftime(fmt, time.gmtime(first_ts))} "
          f"→ {time.strftime(fmt, time.gmtime(last_ts))}")
    print("\n  C'est ce fichier qu'il faut transmettre.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
