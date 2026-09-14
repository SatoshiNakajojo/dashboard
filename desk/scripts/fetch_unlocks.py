#!/usr/bin/env python3
"""Récupère les calendriers de déblocage (token unlocks) et les bougies.

    python3 scripts/fetch_unlocks.py --out data/unlocks.json

**À lancer depuis votre machine.** L'environnement où ce code est écrit
n'atteint ni `llama.fi` ni CoinGecko.

## D'où viennent les données, et pourquoi de là

`api.llama.fi/emissions` est passé **payant** (402, « Upgrade to the paid API
plan ») — vérifié le 6 septembre 2026, avec un témoin gratuit qui répondait
200 au même moment, ce qui écarte le blocage d'IP. Le **miroir statique**
`defillama-datasets.llama.fi`, lui, répond toujours et sans quota :

    /emissionsProtocolsList   la liste des 372 protocoles
    /emissions/{slug}         le calendrier d'un protocole

## Ce qu'on lit, et ce qu'on ne lit pas

DefiLlama publie déjà les déblocages datés dans `metadata.unlockEvents` : une
entrée par date, avec `summary.totalTokensCliff`. On les lit tels quels
plutôt que de dériver la série cumulée — dériver introduirait des sauts
parasites aux frontières de catégories, là où la source a déjà fait le
travail proprement.

**Seuls les déblocages « cliff » comptent comme événements.** Un déblocage
`linear` libère des jetons en continu : il n'a pas de date, et le tester
comme un événement daté reviendrait à mesurer un jour au hasard dans une
rampe. Le montant linéaire est conservé à titre indicatif, jamais comme
déclencheur.

## Le rapprochement slug -> ticker est VÉRIFIÉ, jamais supposé

Le slug DefiLlama n'est pas le ticker du perpétuel : `sei` -> `SEI` marche,
`arbitrum` -> `ARB` non. On construit donc la correspondance depuis
CoinGecko (`/coins/list`, gratuit), et **on la confirme** contre le
`gecko_id` que DefiLlama renvoie dans sa propre réponse. Tout rapprochement
non confirmé est écarté avec un avertissement — jamais accepté en silence.
Associer deux jetons homonymes daterait les événements du mauvais actif, et
l'erreur serait invisible dans les résultats.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

DATASETS = "https://defillama-datasets.llama.fi"
HYPERLIQUID = "https://api.hyperliquid.xyz/info"
COINGECKO = "https://api.coingecko.com/api/v3"

ENTETES = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
           "Accept": "application/json"}

# Codes qui peuvent guerir en reessayant. Tous les autres 4xx sont des refus
# definitifs : un 402, 401, 403 ou 404 ne changera pas d'avis dans deux
# secondes, et les reessayer ne fait que retarder le message utile.
REESSAYABLES = {408, 429, 500, 502, 503, 504}


def _get(url: str, essais: int = 3, octets: int = 60_000_000) -> object:
    for tentative in range(1, essais + 1):
        try:
            req = urllib.request.Request(url, headers=ENTETES)
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read(octets))
        except urllib.error.HTTPError as exc:
            if exc.code not in REESSAYABLES or tentative == essais:
                raise
            time.sleep(2 ** tentative)
        except (urllib.error.URLError, TimeoutError, ValueError):
            if tentative == essais:
                raise
            time.sleep(2 ** tentative)
    return None


def _post(url: str, charge: dict) -> object:
    req = urllib.request.Request(
        url, data=json.dumps(charge).encode(),
        headers={**ENTETES, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def perps_hyperliquid() -> set[str]:
    meta = _post(HYPERLIQUID, {"type": "meta"})
    return {u["name"].upper() for u in meta["universe"]}   # type: ignore[index]


def table_coingecko(perps: set[str]) -> dict[str, str]:
    """gecko_id -> ticker, restreinte aux perpétuels tradables.

    Un ticker peut correspondre à plusieurs `id` CoinGecko (les homonymes
    sont légion : des dizaines de jetons se nomment « SUI » ou « OP »). On
    garde toutes les correspondances : c'est le `gecko_id` renvoyé par
    DefiLlama qui tranchera, et lui est unique.
    """
    liste = _get(f"{COINGECKO}/coins/list")
    table: dict[str, str] = {}
    for piece in liste or []:                              # type: ignore[union-attr]
        symbole = (piece.get("symbol") or "").upper()
        if symbole in perps and piece.get("id"):
            table[piece["id"]] = symbole
    return table


def evenements(detail: dict) -> list[dict]:
    """Les déblocages datés d'un protocole, depuis `metadata.unlockEvents`.

    `part_offre` rapporte le déblocage à ce qui a DÉJÀ été débloqué à cette
    date — somme des catégories dans `documentedData.data`. Ce n'est pas
    exactement l'offre en circulation (elle inclut des réserves non
    circulantes), mais c'est un dénominateur cohérent, disponible pour tous
    les protocoles, et calculé de la même façon partout. Un dénominateur
    imparfait mais uniforme vaut mieux qu'un dénominateur juste pour trois
    jetons et absent pour les autres.
    """
    meta = detail.get("metadata") or {}
    bruts = meta.get("unlockEvents") or []
    if not isinstance(bruts, list):
        return []

    # Cumul de l'offre débloquée, toutes catégories, par horodatage.
    cumul: dict[int, float] = {}
    documents = (detail.get("documentedData") or {}).get("data") or []
    for categorie in documents if isinstance(documents, list) else []:
        for point in (categorie.get("data") or []):
            ts, valeur = point.get("timestamp"), point.get("unlocked")
            if ts is None or valeur is None:
                continue
            cumul[int(ts)] = cumul.get(int(ts), 0.0) + float(valeur)
    dates_cumul = sorted(cumul)

    def offre_a(ts: int) -> float:
        """Offre débloquée JUSTE AVANT `ts`.

        Strictement avant : inclure le déblocage lui-même dans son propre
        dénominateur écraserait mécaniquement les gros événements — un
        déblocage qui doublerait l'offre afficherait 50 % au lieu de 100 %.
        """
        precedent = 0.0
        for date in dates_cumul:
            if date >= ts:
                break
            precedent = cumul[date]
        return precedent

    sorties = []
    for evt in bruts:
        if not isinstance(evt, dict):
            continue
        ts = evt.get("timestamp")
        if ts is None:
            continue
        resume = evt.get("summary") or {}
        cliff = float(resume.get("totalTokensCliff") or 0)
        lineaire = float(resume.get("totalTokensLinear") or 0)
        if cliff <= 0:
            # Purement linéaire : pas de date, donc pas d'événement.
            continue
        offre = offre_a(int(ts))
        if offre <= 0:
            continue
        categories = sorted({a.get("category") for a in (evt.get("cliffAllocations") or [])
                             if isinstance(a, dict) and a.get("category")})
        sorties.append({
            "ts_ms": int(ts) * 1000,          # la source est en SECONDES
            "debloque": cliff,
            "lineaire": lineaire,
            "part_offre": cliff / offre,
            "categories": categories,
        })
    return sorties


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--out", default="data/unlocks.json")
    p.add_argument("--part-min", type=float, default=0.005,
                   help="ignore les déblocages sous ce %% de l'offre déjà "
                        "débloquée. 0,5 %% par défaut : en dessous, l'effet "
                        "serait indétectable sous le bruit quotidien.")
    p.add_argument("--part-max", type=float, default=3.0,
                   help="garde-fou. Au-delà de 300 %%, c'est presque toujours "
                        "un dénominateur aberrant, pas un vrai déblocage.")
    p.add_argument("--jours-bougies", type=int, default=1500)
    p.add_argument("--sans-bougies", action="store_true")
    args = p.parse_args()

    print("\n  1/4  Perpétuels Hyperliquid…")
    perps = perps_hyperliquid()
    print(f"       {len(perps)} perpétuels")

    print("\n  2/4  Table CoinGecko (gecko_id -> ticker)…")
    table = table_coingecko(perps)
    print(f"       {len(table)} identifiants correspondant à un perpétuel")

    print("\n  3/4  Liste des protocoles (miroir statique)…")
    slugs = _get(f"{DATASETS}/emissionsProtocolsList")
    if isinstance(slugs, dict):
        slugs = slugs.get("protocols") or slugs.get("data") or []
    slugs = [s for s in (slugs or []) if isinstance(s, str)]    # type: ignore[union-attr]
    print(f"       {len(slugs)} protocoles")

    # On ne télécharge que les candidats plausibles : ces fichiers pèsent
    # plusieurs mégaoctets chacun, et en tirer 372 pour en garder 40 serait
    # discourtois envers un miroir gratuit.
    plausibles = [s for s in slugs
                  if s.upper() in perps
                  or s.lower() in table
                  or any(s.lower().startswith(t.lower()) for t in perps)]
    print(f"       {len(plausibles)} candidats plausibles à vérifier")

    print("\n  4/4  Calendriers, avec vérification du rapprochement…")
    resultat: dict[str, list[dict]] = {}
    ecartes: list[str] = []
    for slug in sorted(plausibles):
        try:
            detail = _get(f"{DATASETS}/emissions/{slug}")
        except Exception as exc:
            print(f"       {slug:<22} indisponible ({str(exc)[:50]})")
            continue
        if not isinstance(detail, dict):
            continue

        gecko = detail.get("gecko_id") or ""
        ticker = table.get(gecko, "")
        if not ticker:
            # Le rapprochement n'est pas confirmé par une source exogène.
            # On l'écarte : associer deux homonymes daterait les événements
            # du mauvais actif, et rien ne le signalerait ensuite.
            ecartes.append(f"{slug} (gecko_id={gecko or '?'})")
            continue

        evts = [e for e in evenements(detail)
                if args.part_min <= e["part_offre"] <= args.part_max]
        if evts:
            resultat.setdefault(ticker, []).extend(evts)
        print(f"       {slug:<22} -> {ticker:<7} {len(evts):>4} déblocages "
              f"≥ {args.part_min:.1%}")
        time.sleep(0.3)

    for ticker in resultat:
        resultat[ticker].sort(key=lambda e: e["ts_ms"])

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(resultat, indent=1))
    total = sum(len(v) for v in resultat.values())
    print(f"\n  {total} déblocages sur {len(resultat)} jetons -> {args.out}")

    if ecartes:
        print(f"\n  {len(ecartes)} protocoles écartés faute de rapprochement "
              f"confirmé :\n       {', '.join(ecartes[:12])}"
              + (" …" if len(ecartes) > 12 else ""))

    # Contrôle de vraisemblance. Une part de 800 % ou un jeton sans aucun
    # événement signale un problème de lecture, pas un fait de marché — et il
    # vaut mieux le voir ici que dans les p-values.
    if resultat:
        print("\n  Contrôle de vraisemblance :")
        for ticker, evts in sorted(resultat.items()):
            parts = sorted(e["part_offre"] for e in evts)
            print(f"       {ticker:<7} {len(evts):>4} évts   "
                  f"médiane {parts[len(parts) // 2]:>7.1%}   "
                  f"max {parts[-1]:>8.1%}")

    if args.sans_bougies:
        return 0

    print("\n  Bougies journalières…")
    import subprocess
    ici = Path(__file__).resolve().parent
    for ticker in sorted(resultat):
        cible = Path(f"data/{ticker}_1d_real.json")
        if cible.exists():
            print(f"       {ticker:<7} déjà présent")
            continue
        subprocess.run(
            [sys.executable, str(ici / "fetch_candles.py"), "--asset", ticker,
             "--interval", "1d", "--days", str(args.jours_bougies),
             "--out", str(cible)], check=False)

    print("\n  Terminé. Analyse :")
    print(f"      python3 scripts/valider_unlocks.py --unlocks {args.out} "
          "--tirages 2000\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
