#!/usr/bin/env python3
"""Telecharge l'historique de funding Hyperliquid dans un fichier JSON.

Script autonome, sans dependance, comme `fetch_candles.py`.

`backtest/costs.py` traite aujourd'hui le funding comme une CONSTANTE payee
par les longs. Son propre docstring signale la limite : « le funding reel
oscille, change de signe, et remunere parfois les longs ». Tant que
`api.hyperliquid.xyz` etait refuse par la politique reseau, cette constante
etait la seule option. Elle ne l'est plus.

    python3 scripts/fetch_funding.py --asset BTC --days 365

L'API renvoie au plus 500 entrees par appel, en pas horaire — soit environ
20 jours. Le script pagine en remontant le temps.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request

MAINNET = "https://api.hyperliquid.xyz/info"
PAR_APPEL = 500          # plafond de l'API
HEURE_MS = 3_600_000


def _post(body: dict, tentatives: int = 4) -> list:
    donnees = json.dumps(body).encode()
    for essai in range(tentatives):
        try:
            req = urllib.request.Request(
                MAINNET, data=donnees,
                headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read())
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            if essai == tentatives - 1:
                raise
            attente = 2 ** essai
            print(f"    reseau : {exc} — nouvelle tentative dans {attente}s",
                  file=sys.stderr)
            time.sleep(attente)
    return []


def fetch(asset: str, days: int) -> list[dict]:
    """Remonte le temps par tranches jusqu'a couvrir `days` jours."""
    fin = int(time.time() * 1000)
    debut_vise = fin - days * 24 * HEURE_MS
    tout: dict[int, dict] = {}

    curseur = debut_vise
    while curseur < fin:
        lot = _post({"type": "fundingHistory", "coin": asset,
                     "startTime": curseur, "endTime": fin})
        if not lot:
            break
        for e in lot:
            tout[int(e["time"])] = e
        dernier = max(int(e["time"]) for e in lot)
        if dernier <= curseur:
            break
        curseur = dernier + 1
        print(f"    {len(tout)} entrees…", end="\r", file=sys.stderr)
        if len(lot) < PAR_APPEL:
            break

    return [tout[k] for k in sorted(tout)]


def main() -> int:
    p = argparse.ArgumentParser(description="Funding Hyperliquid → JSON")
    p.add_argument("--asset", default="BTC")
    p.add_argument("--days", type=int, default=365)
    p.add_argument("--out", default=None)
    args = p.parse_args()

    lignes = fetch(args.asset, args.days)
    if not lignes:
        print(f"  Aucune donnee pour {args.asset}.", file=sys.stderr)
        return 2

    chemin = args.out or f"data/{args.asset}_funding.json"
    with open(chemin, "w", encoding="utf-8") as f:
        json.dump(lignes, f)

    debut = time.strftime("%Y-%m-%d", time.gmtime(int(lignes[0]["time"]) / 1000))
    fin = time.strftime("%Y-%m-%d", time.gmtime(int(lignes[-1]["time"]) / 1000))
    couverture = (int(lignes[-1]["time"]) - int(lignes[0]["time"])) / (24 * HEURE_MS)
    print(f"  {len(lignes):>6} entrees  {args.asset:<5} {debut} → {fin} "
          f"({couverture:.0f} jours)  →  {chemin}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
