#!/usr/bin/env python3
"""Collecter de quoi tester un portage de financement en coupe transversale.

    python3 scripts/fetch_carry.py                 # 60 actifs, 365 jours
    python3 scripts/fetch_carry.py --actifs 30

**Ce qu'on cherche.** Sur Hyperliquid, le financement est positif la plupart
du temps : les longs paient les shorts. Mesure sur les sept actifs deja
collectes, un an horaire — positif 64 a 83 % des heures, soit 0 a 6 % par an
pour un short constant. Mais un short constant n'est pas un portage : il
porte tout le risque de prix.

Ce qui peut en etre un, c'est un ECART. Le financement ne paie pas pareil
partout : en fevrier 2026, AVAX encaissait +0,42 % sur le mois quand SOL en
payait 1,35 — 21 % d'ecart annualise. Vendre le cote qui paie cher et
acheter celui qui paie peu laisse une position dont une bonne part du
risque de prix se compense, puisque ces actifs bougent ensemble.

C'est la corrélation entre cryptos — celle qui a ruine l'independance de la
grille de robustesse — qui devient ici un atout au lieu d'un defaut.

**Pourquoi elargir.** Sept actifs ne suffisent pas a classer quoi que ce
soit : le meilleur et le pire d'un echantillon de sept sont du bruit. Une
strategie de classement a besoin de largeur, et c'est la seule dimension
qu'on puisse gagner — l'API ne rend qu'un an d'historique de financement,
donc le temps est fixe.

**L'univers est choisi AVANT de regarder les resultats** : les N actifs les
plus echanges sur 24 h, delistes exclus. Le choisir apres serait garder ceux
qui arrangent, et c'est la facon la plus discrete de truquer une mesure.

**On stocke des sommes QUOTIDIENNES, pas l'horaire.** Un an d'horaire pour
soixante actifs fait 50 Mo ; les sommes quotidiennes font quelques centaines
de kilo-octets, et une strategie a rebalancement mensuel n'a pas besoin de
plus fin. L'horaire reste recuperable de l'API pendant un an.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fetch_funding import _post  # noqa: E402

JOUR_MS = 86_400_000


def univers(n: int) -> list[str]:
    """Les n actifs les plus echanges, delistes exclus."""
    meta, ctxs = _post({"type": "metaAndAssetCtxs"})
    lignes = []
    for a, c in zip(meta["universe"], ctxs, strict=True):
        if a.get("isDelisted"):
            continue
        lignes.append((float(c.get("dayNtlVlm") or 0), a["name"]))
    lignes.sort(reverse=True)
    return [nom for _, nom in lignes[:n]]


def _jour(ts_ms: int) -> str:
    return datetime.fromtimestamp(ts_ms / 1000, timezone.utc).strftime("%Y-%m-%d")


def funding_quotidien(actif: str, jours: int) -> dict[str, float]:
    from fetch_funding import fetch
    somme: dict[str, float] = defaultdict(float)
    for e in fetch(actif, jours):
        somme[_jour(int(e["time"]))] += float(e["fundingRate"])
    return dict(somme)


def clotures(actif: str, jours: int) -> dict[str, float]:
    fin = int(time.time() * 1000)
    lot = _post({"type": "candleSnapshot", "req": {
        "coin": actif, "interval": "1d",
        "startTime": fin - jours * JOUR_MS, "endTime": fin}})
    return {_jour(int(b["t"])): float(b["c"]) for b in lot or []}


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--actifs", type=int, default=60)
    p.add_argument("--jours", type=int, default=365)
    p.add_argument("--out", default="data/carry.json")
    args = p.parse_args()

    noms = univers(args.actifs)
    print(f"\n  {len(noms)} actifs, les plus échangés sur 24 h :")
    print("    " + " ".join(noms))

    sortie = Path(args.out)
    donnees: dict[str, dict] = {}
    if sortie.exists():
        # Reprise : une collecte de dix minutes ne doit pas repartir de zéro
        # parce que le réseau a hoqueté sur le cinquantième actif.
        donnees = json.loads(sortie.read_text())["actifs"]
        print(f"  {len(donnees)} déjà collectés, on reprend")

    for i, actif in enumerate(noms, 1):
        if actif in donnees:
            continue
        try:
            f = funding_quotidien(actif, args.jours)
            c = clotures(actif, args.jours)
        except Exception as exc:                      # noqa: BLE001
            print(f"  {actif:<8} échec : {exc}", file=sys.stderr)
            continue
        donnees[actif] = {"funding": f, "close": c}
        sortie.parent.mkdir(parents=True, exist_ok=True)
        sortie.write_text(json.dumps(
            {"jours": args.jours, "actifs": donnees}), encoding="utf-8")
        print(f"  {i:>3}/{len(noms)}  {actif:<8}"
              f"{len(f):>5} j de financement  {len(c):>5} clôtures", flush=True)

    print(f"\n  {len(donnees)} actifs -> {sortie}  "
          f"({sortie.stat().st_size / 1e6:.1f} Mo)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
