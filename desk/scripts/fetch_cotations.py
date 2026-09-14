#!/usr/bin/env python3
"""L'univers complet des perpétuels Hyperliquid — délistés compris.

    python3 scripts/fetch_cotations.py            # data/cotations.json

**Pourquoi ce fichier existe, et pourquoi il vaut plus que son contenu.**
Toutes les études de ce dépôt qui portent sur une coupe d'actifs souffrent du
même défaut, écrit noir sur blanc dans `RECHERCHE.md` : *« l'univers est
choisi par le volume d'aujourd'hui ; ceux qui sont morts pendant l'année sont
absents »*. C'est le biais du survivant, et il ne peut que flatter.

Il se trouve que l'API Hyperliquid permet de le corriger, ce que personne
n'avait vérifié. `meta` publie **234 perpétuels dont 56 marqués
`isDelisted`**, et `candleSnapshot` sert l'historique complet de ces
délistés — jusqu'à leur dernier jour. MATIC répond de 2020-10-22 à
2024-09-09, RNDR de 2023-02-03 à 2024-07-21.

Autrement dit : on peut reconstituer l'univers **tel qu'il était à chaque
date**, et non tel qu'il a survécu. C'est rare en crypto, et c'est ce qui
rend testable une hypothèse événementielle sur les cotations.

**Ce que le fichier contient, et ce qu'il ne prétend pas contenir.** Pour
chaque perpétuel : le drapeau de délistage, la première et la dernière bougie
journalière, et la série complète. La première bougie n'est PAS toujours la
date de cotation — pour les actifs présents dès l'ouverture de l'exchange,
c'est la date de début des données, qui est antérieure. La distinction est
faite par le script d'analyse, pas ici : ce fichier collecte, il ne juge pas.

**Aucun filtre de volume, aucun filtre de liquidité.** Filtrer ici
reconstruirait exactement le biais qu'on cherche à éliminer. Les filtres
appartiennent à l'étude, où ils sont déclarés et comptés.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

INFO = "https://api.hyperliquid.xyz/info"
JOUR_MS = 86_400_000
# L'API rend au plus 5 000 bougies par appel. En journalier, une pagination
# suffit pour les actifs les plus anciens ; on la fait quand meme, parce que
# se fier a une limite non documentee est la facon dont on perd trois ans
# d'historique sans s'en apercevoir.
MAX_BOUGIES = 5000


def _post(charge: dict, essais: int = 4, timeout: float = 40.0):
    dernier: Exception | None = None
    for n in range(essais):
        try:
            req = urllib.request.Request(
                INFO, data=json.dumps(charge).encode(),
                headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read())
        except (urllib.error.URLError, TimeoutError, ValueError) as exc:
            dernier = exc
            time.sleep(1.5 * (n + 1))
    raise RuntimeError(f"API injoignable apres {essais} essais : {dernier}")


def bougies(coin: str, fin_ms: int) -> list[dict]:
    """Toutes les bougies journalieres, de l'origine a `fin_ms`."""
    out: list[dict] = []
    curseur = 0
    while True:
        chunk = _post({"type": "candleSnapshot",
                       "req": {"coin": coin, "interval": "1d",
                               "startTime": curseur, "endTime": fin_ms}})
        if not chunk:
            break
        out.extend(chunk)
        dernier = int(chunk[-1]["t"])
        if len(chunk) < MAX_BOUGIES or dernier <= curseur:
            break
        curseur = dernier + JOUR_MS
        time.sleep(0.2)
    # Dedoublonnage par horodatage : la pagination peut recouvrir d'une bougie.
    vues: dict[int, dict] = {}
    for b in out:
        vues[int(b["t"])] = b
    return [vues[t] for t in sorted(vues)]


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--out", default="data/cotations.json")
    p.add_argument("--pause", type=float, default=0.2,
                   help="secondes entre deux actifs, par courtoisie")
    args = p.parse_args()

    maintenant = int(time.time() * 1000)
    meta = _post({"type": "meta"})
    univers = meta.get("universe", [])
    print(f"\n  {len(univers)} perpétuels publiés par l'exchange, "
          f"dont {sum(1 for a in univers if a.get('isDelisted'))} délistés.\n")

    actifs: dict[str, dict] = {}
    for i, a in enumerate(univers, 1):
        nom = a["name"]
        try:
            b = bougies(nom, maintenant)
        except Exception as exc:
            print(f"  {i:>3}/{len(univers)}  {nom:<12} échec : {str(exc)[:46]}",
                  file=sys.stderr)
            continue
        if not b:
            print(f"  {i:>3}/{len(univers)}  {nom:<12} aucune bougie")
            continue
        actifs[nom] = {
            "delisté": bool(a.get("isDelisted")),
            "sz_decimals": a.get("szDecimals"),
            "premiere_ms": int(b[0]["t"]),
            "derniere_ms": int(b[-1]["t"]),
            # On ne garde que ce dont une etude d'evenement a besoin. Le carnet
            # n'existe pas retroactivement de toute facon.
            "bougies": [
                {"t": int(x["t"]), "o": float(x["o"]), "h": float(x["h"]),
                 "l": float(x["l"]), "c": float(x["c"]), "v": float(x["v"])}
                for x in b
            ],
        }
        d0 = dt.datetime.fromtimestamp(b[0]["t"] / 1000, dt.UTC).date()
        dN = dt.datetime.fromtimestamp(b[-1]["t"] / 1000, dt.UTC).date()
        marque = "délisté" if a.get("isDelisted") else ""
        print(f"  {i:>3}/{len(univers)}  {nom:<12} {len(b):>5} bougies  "
              f"{d0} → {dN}  {marque}")
        time.sleep(args.pause)

    chemin = Path(args.out)
    chemin.parent.mkdir(parents=True, exist_ok=True)
    chemin.write_text(json.dumps({
        "collecte_ms": maintenant,
        "source": "api.hyperliquid.xyz/info",
        "actifs": actifs,
    }, ensure_ascii=False), encoding="utf-8")

    vivants = sum(1 for a in actifs.values() if not a["delisté"])
    print(f"\n  {chemin} — {len(actifs)} actifs "
          f"({vivants} cotés, {len(actifs) - vivants} délistés), "
          f"{chemin.stat().st_size / 1e6:.1f} Mo\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
