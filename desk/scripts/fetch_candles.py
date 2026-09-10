#!/usr/bin/env python3
"""Télécharge l'historique de bougies Hyperliquid dans un fichier JSON.

Script autonome : **aucune dépendance**, rien à installer. Python 3.9+ suffit.

    python3 fetch_candles.py                    # BTC, 1h, 365 jours
    python3 fetch_candles.py --asset ETH
    python3 fetch_candles.py --asset BTC --interval 4h --days 730

Il existe parce que l'environnement où ce projet est développé n'avait pas
accès à `api.hyperliquid.xyz` (refus de politique réseau). **Ce n'est plus le
cas depuis le 5 septembre 2026** : l'API répond désormais depuis le desk
(`/info` en HTTP 200, ~300 ms). Le script reste néanmoins utile — il n'a
aucune dépendance et tourne sur n'importe quelle machine ayant Internet, ce
qui en fait le moyen le plus simple de reconstituer un jeu de données hors
du projet.

Le fichier écrit contient les bougies brutes, telles que l'API les renvoie.
Rien n'est transformé ni filtré ici : la conversion appartient au projet, pour
que ce script reste vérifiable d'un coup d'œil.

**Ce que l'API conserve.** `candleSnapshot` ne garde qu'environ 5000 bougies
par intervalle. La limite n'est pas un plafond de réponse qu'on contourne en
paginant : c'est de l'historique qui n'existe pas.

    1h  → ~208 jours       4h  → ~833 jours       1d → ~13 ans

Demander `--interval 1h --days 365` renvoie donc 208 jours, quelle que soit la
façon de paginer. Le script le dit maintenant explicitement au lieu d'écrire
un fichier plus court que demandé sans commentaire — c'était le vrai défaut :
pas la période manquante, le silence sur la période manquante.

**Pagination vers l'arrière.** On remonte le temps en reculant `endTime`
plutôt qu'en avançant `startTime`. Deux raisons : les données récentes, qui
comptent le plus, arrivent en premier ; et la boucle s'arrête d'elle-même dès
que l'API cesse de remonter, ce qui rend la limite de rétention visible au
lieu de la laisser deviner. Les fenêtres se chevauchent, donc on déduplique
par horodatage.
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
    now = int(time.time() * 1000)
    target_start = now - args.days * 86_400_000

    print(f"  Téléchargement {args.asset} {args.interval} sur {args.days} jours…")

    # On remonte le temps : chaque appel demande la fenêtre qui précède la
    # bougie la plus ancienne déjà obtenue.
    by_ts: dict[int, dict] = {}
    cursor_end = now
    for _ in range(200):                       # borne dure : jamais de boucle infinie
        window_start = max(target_start, cursor_end - PER_CALL * step)
        try:
            chunk = fetch(url, args.asset, args.interval, window_start, cursor_end)
        except urllib.error.HTTPError as exc:
            print(f"\n  Erreur HTTP {exc.code} : {exc.reason}", file=sys.stderr)
            print("  Vérifier que l'actif existe (BTC, ETH, SOL…).", file=sys.stderr)
            return 2
        except (urllib.error.URLError, TimeoutError) as exc:
            print(f"\n  Réseau injoignable : {exc}", file=sys.stderr)
            return 2

        if not chunk:
            break
        avant = len(by_ts)
        for row in chunk:
            by_ts[int(row["t"])] = row
        if len(by_ts) == avant:
            break                              # l'API ne remonte plus : historique épuisé

        oldest = min(int(r["t"]) for r in chunk)
        if oldest <= target_start:
            break
        cursor_end = oldest - 1
        print(f"    {len(by_ts)} bougies…", end="\r", flush=True)
        time.sleep(0.15)                       # courtoisie : rester loin des limites

    rows = [by_ts[t] for t in sorted(by_ts) if t >= target_start]
    if not rows:
        print("\n  Aucune bougie renvoyée. Vérifier l'actif et l'intervalle.",
              file=sys.stderr)
        return 2

    out = args.out or f"{args.asset}_{args.interval}_{args.days}d.json"
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(rows, fh)

    ts = [int(r["t"]) for r in rows]
    trous = sum(1 for a, b in zip(ts, ts[1:]) if b - a != step)
    jours = (ts[-1] - ts[0]) / 86_400_000
    fmt = "%Y-%m-%d"
    print(f"\n  {len(rows)} bougies écrites dans : {out}")
    print(f"  Période : {time.strftime(fmt, time.gmtime(ts[0] / 1000))} "
          f"→ {time.strftime(fmt, time.gmtime(ts[-1] / 1000))}  ({jours:.0f} jours)")
    if trous:
        print(f"  {trous} discontinuité(s) dans la série.")

    # Dire ce qui manque plutôt que le laisser découvrir : une série plus
    # courte que demandée reste utilisable, une série plus courte que
    # demandée et non signalée fausse toute conclusion sur la période.
    if jours < args.days * 0.9:
        print(f"\n  ATTENTION : {jours:.0f} jours obtenus sur {args.days} demandés.")
        print(f"  Hyperliquid ne conserve qu'environ {len(rows)} bougies en "
              f"{args.interval} : au-delà, l'historique n'existe pas.")
        for alt, ms in sorted(INTERVAL_MS.items(), key=lambda kv: kv[1]):
            if ms > step and len(rows) * ms >= args.days * 86_400_000:
                print(f"  Pour couvrir {args.days} jours : "
                      f"--interval {alt} --days {args.days}")
                break

    print("\n  C'est ce fichier qu'il faut transmettre.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
