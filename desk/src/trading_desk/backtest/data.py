"""Chargement des donnees historiques.

Trois sources, par ordre de credibilite decroissante :

1. `fetch_hyperliquid` — l'API Info publique (`candleSnapshot`). C'est la
   source de reference pour produire les baselines du P2.
2. `load_from_store` — les trades ingeres par le P0, agreges en bougies. Utile
   quand le collecteur tourne depuis un moment, et surtout : ce sont les
   memes donnees que verra le live.
3. `synthetic` — marche aleatoire deterministe. Sert **uniquement** a tester
   le moteur, jamais a conclure quoi que ce soit sur une strategie.

Les donnees telechargees sont mises en cache sur disque. Le budget de requetes
Hyperliquid est adosse au volume tradé : re-telecharger six mois d'historique
a chaque essai entame une reserve dont on aura besoin pour trader
(angle mort A-07).
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from decimal import Decimal
from pathlib import Path

from ..contracts.market import Trade
from ..features.bars import (
    INTERVAL_MS, Bar, bars_from_hyperliquid_candles, bars_from_trades,
    synthetic_bars,
)

MAINNET_INFO = "https://api.hyperliquid.xyz/info"
TESTNET_INFO = "https://api.hyperliquid-testnet.xyz/info"

# L'API renvoie au plus ~5000 bougies par appel : on pagine en dessous.
MAX_CANDLES_PER_CALL = 4_500


class DataUnavailable(RuntimeError):
    """L'historique n'a pas pu etre obtenu. Jamais remplace par des donnees
    fabriquees : un backtest sur des barres inventees est pire que pas de
    backtest, parce qu'il produit un chiffre auquel on finit par croire."""


def fetch_hyperliquid(
    asset: str,
    interval: str = "1h",
    days: int = 180,
    *,
    testnet: bool = False,
    cache_dir: str | Path = ".cache",
    timeout_s: float = 30.0,
) -> list[Bar]:
    """Telecharge l'historique de bougies, avec cache disque et pagination."""
    if interval not in INTERVAL_MS:
        raise ValueError(f"intervalle inconnu : {interval}")

    cache = Path(cache_dir)
    cache.mkdir(parents=True, exist_ok=True)
    key = cache / f"{asset}_{interval}_{days}d{'_testnet' if testnet else ''}.json"

    if key.exists():
        raw = json.loads(key.read_text(encoding="utf-8"))
        return bars_from_hyperliquid_candles(raw, asset)

    url = TESTNET_INFO if testnet else MAINNET_INFO
    step = INTERVAL_MS[interval]
    end = int(time.time() * 1000)
    start = end - days * 86_400_000

    collected: list[dict] = []
    cursor = start
    while cursor < end:
        window_end = min(end, cursor + MAX_CANDLES_PER_CALL * step)
        body = json.dumps({
            "type": "candleSnapshot",
            "req": {"coin": asset, "interval": interval,
                    "startTime": cursor, "endTime": window_end},
        }).encode("utf-8")
        req = urllib.request.Request(
            url, data=body, headers={"Content-Type": "application/json"}
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout_s) as resp:
                chunk = json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, ValueError) as exc:
            raise DataUnavailable(
                f"echec du telechargement depuis {url} : {exc}. "
                "Verifier l'acces reseau ; ne pas substituer de donnees simulees."
            ) from exc

        if not chunk:
            break
        collected.extend(chunk)
        last = int(chunk[-1]["t"])
        if last <= cursor:
            break                      # l'API ne progresse plus : on arrete
        cursor = last + step
        time.sleep(0.15)               # courtoisie : on reste loin des limites

    if not collected:
        raise DataUnavailable(f"aucune bougie renvoyee pour {asset} {interval}")

    key.write_text(json.dumps(collected), encoding="utf-8")
    return bars_from_hyperliquid_candles(collected, asset)


def load_from_store(
    db_path: str | Path, asset: str, interval: str = "1h"
) -> list[Bar]:
    """Reconstruit des bougies depuis les trades ingeres par le P0."""
    import sqlite3

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            "SELECT ts_ms, asset, price, size, is_buy FROM trades "
            "WHERE asset = ? ORDER BY ts_ms",
            (asset,),
        ).fetchall()
    finally:
        conn.close()

    trades = [
        Trade(asset=r["asset"], price=Decimal(r["price"]), size=Decimal(r["size"]),
              is_buy=bool(r["is_buy"]), ts_ms=r["ts_ms"])
        for r in rows
    ]
    if not trades:
        raise DataUnavailable(
            f"aucun trade {asset} dans {db_path}. "
            "Laisser tourner `python -m trading_desk` pour remplir la base."
        )
    return bars_from_trades(trades, interval, asset=asset)


def load_synthetic(asset: str = "BTC", interval: str = "1h",
                   count: int = 1_500, seed: int = 7) -> list[Bar]:
    """Barres deterministes. Pour tester le moteur, pas pour conclure."""
    return synthetic_bars(asset=asset, interval=interval, count=count, seed=seed)


def load_from_file(
    path: str | Path,
    asset: str = "BTC",
    interval: str = "1h",
    *,
    max_gap_ratio: float = 0.02,
) -> list[Bar]:
    """Charge un fichier de bougies produit par `scripts/fetch_candles.py`.

    C'est la porte d'entree quand la machine qui developpe n'a pas acces a
    l'API : quelqu'un lance le script ailleurs et transmet le JSON.

    Un fichier venu de l'exterieur est une donnee non verifiee. On refuse
    plutot que de corriger :

    - **actif different** : un backtest BTC sur des bougies ETH ne produit pas
      une erreur, il produit un chiffre faux ;
    - **intervalle different** de celui annonce : les couts de funding sont
      factures a l'heure, un intervalle mal lu les multiplie ou les divise ;
    - **trop de trous** : au-dela de `max_gap_ratio`, la serie n'est plus
      continue et les stops se declenchent sur des barres qui n'existent pas.

    Un trou isole est tolere et signale, parce qu'une coupure d'API d'une
    heure sur six mois ne change aucune conclusion — mais il est compte.
    """
    p = Path(path)
    try:
        raw = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise DataUnavailable(f"fichier illisible : {p} ({exc})") from exc

    if not isinstance(raw, list) or not raw:
        raise DataUnavailable(
            f"{p} ne contient pas une liste de bougies. Attendu : la sortie "
            "brute de `scripts/fetch_candles.py`."
        )

    coins = {str(r.get("s", asset)).upper() for r in raw if isinstance(r, dict)}
    if coins and coins != {asset.upper()}:
        raise DataUnavailable(
            f"le fichier contient {sorted(coins)} mais le backtest demande "
            f"{asset.upper()}. Relancer avec --asset {sorted(coins)[0]}."
        )

    intervals = {str(r.get("i", interval)) for r in raw if isinstance(r, dict)}
    if intervals and intervals != {interval}:
        raise DataUnavailable(
            f"le fichier est en {sorted(intervals)} mais le backtest demande "
            f"{interval}. Le funding est facture a l'heure : un intervalle mal "
            f"lu fausse les couts. Relancer avec --interval {sorted(intervals)[0]}."
        )

    bars = bars_from_hyperliquid_candles(raw, asset.upper())
    if len(bars) < 2:
        raise DataUnavailable(f"{p} : {len(bars)} barre(s) exploitable(s)")

    rejetees = len(raw) - len(bars)
    step = INTERVAL_MS[interval]
    trous = sum(1 for a, b in zip(bars, bars[1:]) if b.ts_ms - a.ts_ms != step)
    manquantes = sum(
        (b.ts_ms - a.ts_ms) // step - 1
        for a, b in zip(bars, bars[1:]) if b.ts_ms - a.ts_ms > step
    )
    attendu = (bars[-1].ts_ms - bars[0].ts_ms) // step + 1
    ratio = manquantes / attendu if attendu else 0.0

    if ratio > max_gap_ratio:
        raise DataUnavailable(
            f"{p} : {manquantes} barres manquantes sur {attendu} "
            f"({ratio:.1%}), au-dela du seuil de {max_gap_ratio:.0%}. "
            "Une serie discontinue declenche des stops sur des barres qui "
            "n'ont pas existe. Re-telecharger."
        )

    if trous or rejetees:
        print(f"  Fichier accepte avec reserve : {trous} discontinuite(s), "
              f"{manquantes} barre(s) manquante(s), {rejetees} rejetee(s).")

    return bars
