#!/usr/bin/env python3
"""Pourquoi 166 perpétuels sur 234 n'ont-ils pas de calendrier ?

    python3 scripts/sonder_couverture_unlocks.py            # le diagnostic
    python3 scripts/sonder_couverture_unlocks.py --profond  # + les détails

**À lancer depuis le VPS.** `defillama-datasets.llama.fi` et
`api.coingecko.com` ne sont pas joignables depuis l'environnement de
développement ; le VPS les atteint, c'est lui qui alimente le rituel.

## Ce que ce script cherche, et pourquoi il vient avant le code

Le calendrier couvre 68 jetons, dont **21 seulement ont encore un déblocage
à venir**. À 5 événements par an et par jeton actif, ça donne 105 événements
par an — et il en faudrait une centaine de jetons actifs pour en avoir 500.

Avant d'aller brancher une deuxième source de données, il faut savoir où
passent les 166 perpétuels manquants. Trois causes possibles, et elles
appellent des remèdes qui n'ont rien à voir :

1. **DefiLlama ne les connaît pas** — il faut alors une autre source ;
2. **DefiLlama les connaît mais on ne les rapproche pas** — c'est un défaut
   chez nous, et il se corrige gratuitement ;
3. **On les rapproche mais leur vesting est fini** — il n'y a rien à
   gagner, ces jetons ne débloqueront plus jamais.

Construire une deuxième source alors que la cause est la 2 reviendrait à
poser un second tuyau à côté d'une fuite.

## Le défaut soupçonné

`fetch_unlocks.py` ne télécharge que les protocoles « plausibles » :

    s.upper() in perps  ou  s.lower() in table  ou  s commence par un ticker

Or les slugs DefiLlama sont des NOMS DE PROTOCOLE, pas des tickers :
`layerzero` pour ZRO, `ethena` pour ENA, `celestia` pour TIA. Le filtre
attrape `aptos` → APT par préfixe et rate les autres. Et le rapprochement
qui fait foi — `gecko_id`, présent dans le fichier de détail — n'est lu
qu'APRÈS ce filtre, donc jamais pour les protocoles écartés.

Le filtre existait pour ne pas tirer 372 fichiers de plusieurs mégaoctets
sur un miroir gratuit. C'est une politesse raisonnable qui est devenue le
plafond de couverture du projet, sans que personne ne l'ait décidé.

## Comment celui-ci s'y prend

Il inverse le sens du rapprochement. Plutôt que de filtrer la liste de
DefiLlama par ressemblance de nom, il part des perpétuels et leur trouve un
identifiant CoinGecko **par capitalisation** — le jeton coté sur Hyperliquid
est, à de très rares exceptions près, le plus gros de ceux qui portent son
ticker. Puis il cherche cet identifiant dans le calendrier de DefiLlama.

Il ne modifie RIEN. Il télécharge, classe, et écrit un rapport.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

RACINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RACINE / "src"))

from trading_desk.sentinelle.triggers import (  # noqa: E402
    DEBLOCAGE_PART_MAX,
    DEBLOCAGE_PART_MIN,
    deblocages_retenus,
)

DATASETS = "https://defillama-datasets.llama.fi"
HYPERLIQUID = "https://api.hyperliquid.xyz/info"
COINGECKO = "https://api.coingecko.com/api/v3"
ENTETES = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
           "Accept": "application/json"}
JOUR_MS = 86_400_000

# Les classes de diagnostic. L'ordre est celui du rapport, du plus
# actionnable au moins.
INCONNU = "inconnu de DefiLlama"
RATE = "connu mais RATE par le filtre actuel"
EPUISE = "connu, vesting termine"
TROP_PETIT = "connu, mais aucun deblocage dans la bande"
DEJA = "deja couvert"


def _get(url: str, cache: Path | None = None, essais: int = 2) -> object | None:
    """Lit une URL, avec cache disque. `None` si elle refuse.

    Le cache n'est pas un confort : ce script tire potentiellement deux
    cents fichiers de plusieurs megaoctets sur un miroir gratuit, et le
    relancer apres une coupure ne doit pas tout retelecharger.
    """
    if cache and cache.exists():
        try:
            return json.loads(cache.read_text())
        except ValueError:
            cache.unlink()
    for tentative in range(essais):
        try:
            req = urllib.request.Request(url, headers=ENTETES)
            with urllib.request.urlopen(req, timeout=90) as r:
                charge = json.loads(r.read(60_000_000))
            if cache:
                cache.parent.mkdir(parents=True, exist_ok=True)
                cache.write_text(json.dumps(charge))
            return charge
        except urllib.error.HTTPError as exc:
            if exc.code in (408, 429, 500, 502, 503, 504) and tentative == 0:
                time.sleep(3)
                continue
            return None
        except Exception:
            if tentative == 0:
                time.sleep(3)
                continue
            return None
    return None


def perps_hyperliquid() -> set[str]:
    req = urllib.request.Request(
        HYPERLIQUID, data=json.dumps({"type": "meta"}).encode(),
        headers={**ENTETES, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        meta = json.loads(r.read())
    return {u["name"].upper() for u in meta["universe"]}


def identifiants_par_capitalisation(perps: set[str], pages: int = 5,
                                    dossier: Path | None = None) -> dict[str, str]:
    """ticker -> identifiant CoinGecko du plus gros jeton qui le porte.

    **C'est ici que se joue la justesse du rapprochement.** Des dizaines de
    jetons se nomment « SUI » ou « OP » ; prendre le premier venu daterait
    les evenements du mauvais actif, et rien ne le signalerait ensuite. La
    capitalisation tranche : celui qu'Hyperliquid cote est, sauf exception
    tres rare, le plus gros de ses homonymes.

    On ne descend pas en dessous du millieme rang : un perpetuel cote sur
    Hyperliquid n'est jamais une micro-capitalisation, et fouiller plus bas
    ne ferait qu'augmenter le risque d'homonyme.
    """
    table: dict[str, str] = {}
    for page in range(1, pages + 1):
        url = (f"{COINGECKO}/coins/markets?vs_currency=usd&order=market_cap_desc"
               f"&per_page=250&page={page}&sparkline=false")
        cache = (dossier / f"cg_markets_{page}.json") if dossier else None
        lot = _get(url, cache)
        if not isinstance(lot, list) or not lot:
            break
        for piece in lot:
            ticker = (piece.get("symbol") or "").upper()
            # Le premier rencontre gagne : la liste est deja triee par
            # capitalisation decroissante.
            if ticker in perps and ticker not in table and piece.get("id"):
                table[ticker] = piece["id"]
        time.sleep(1.5)          # l'API gratuite plafonne a ~30 appels/minute
    return table


def evenements_du_detail(detail: dict) -> list[dict]:
    """Les deblocages dates, avec la MEME lecture que `fetch_unlocks.py`.

    Cette fonction est volontairement un decalque. Si les deux divergeaient,
    le diagnostic promettrait une couverture que la collecte ne livrerait
    pas — exactement le genre de chiffre qui a l'air d'un resultat et qui
    decrit autre chose.
    """
    meta = detail.get("metadata") or {}
    bruts = meta.get("unlockEvents") or []
    if not isinstance(bruts, list):
        return []
    cumul: dict[int, float] = {}
    documents = (detail.get("documentedData") or {}).get("data") or []
    for categorie in documents if isinstance(documents, list) else []:
        for point in (categorie.get("data") or []):
            ts, valeur = point.get("timestamp"), point.get("unlocked")
            if ts is None or valeur is None:
                continue
            cumul[int(ts)] = cumul.get(int(ts), 0.0) + float(valeur)
    dates = sorted(cumul)

    def offre_a(ts: int) -> float:
        precedent = 0.0
        for date in dates:
            if date >= ts:
                break
            precedent = cumul[date]
        return precedent

    out = []
    for evt in bruts:
        if not isinstance(evt, dict) or evt.get("timestamp") is None:
            continue
        cliff = float((evt.get("summary") or {}).get("totalTokensCliff") or 0)
        if cliff <= 0:
            continue
        offre = offre_a(int(evt["timestamp"]))
        if offre <= 0:
            continue
        out.append({"ts_ms": int(evt["timestamp"]) * 1000,
                    "part_offre": cliff / offre,
                    "debloque": cliff, "lineaire": 0.0, "categories": []})
    return out


def classer(evts: list[dict], maintenant_ms: int) -> tuple[str, int]:
    """La classe d'un jeton, et combien d'evenements a venir il apporte.

    Un jeton dont tous les deblocages sont passes ne rapportera jamais rien :
    le compter dans la couverture gonflerait un chiffre qui ne se traduit par
    aucune position.
    """
    if not evts:
        return TROP_PETIT, 0
    a_venir = [e for e in deblocages_retenus(evts) if e["ts_ms"] > maintenant_ms]
    if a_venir:
        return RATE, len(a_venir)
    dans_la_bande = [e for e in evts
                     if DEBLOCAGE_PART_MIN <= e["part_offre"] < DEBLOCAGE_PART_MAX]
    return (EPUISE if dans_la_bande else TROP_PETIT), 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--calendrier", default="data/unlocks.json")
    p.add_argument("--rapport", default="data/couverture_unlocks.json")
    p.add_argument("--cache", default=".cache/couverture")
    p.add_argument("--max-telechargements", type=int, default=250,
                   help="borne de politesse envers un miroir gratuit")
    p.add_argument("--pause", type=float, default=0.4)
    args = p.parse_args()

    cache = Path(args.cache)
    maintenant = int(time.time() * 1000)

    print("\n  1/4  Perpétuels Hyperliquid…", flush=True)
    perps = perps_hyperliquid()
    deja = set(json.loads(Path(args.calendrier).read_text())) if Path(args.calendrier).exists() else set()
    print(f"       {len(perps)} perpétuels, {len(deja)} déjà au calendrier")

    print("\n  2/4  Identifiants CoinGecko, par capitalisation…", flush=True)
    table = identifiants_par_capitalisation(perps, dossier=cache)
    print(f"       {len(table)}/{len(perps)} perpétuels identifiés")
    sans_id = sorted(perps - set(table))
    if sans_id:
        print(f"       {len(sans_id)} sans identifiant : {', '.join(sans_id[:15])}"
              + (" …" if len(sans_id) > 15 else ""))

    print("\n  3/4  Liste des protocoles DefiLlama…", flush=True)
    slugs = _get(f"{DATASETS}/emissionsProtocolsList", cache / "liste.json")
    if isinstance(slugs, dict):
        slugs = slugs.get("protocols") or slugs.get("data") or []
    slugs = {s for s in (slugs or []) if isinstance(s, str)}
    if not slugs:
        print("       LISTE INDISPONIBLE — le miroir a refusé. Rien à "
              "diagnostiquer.", file=sys.stderr)
        return 1
    print(f"       {len(slugs)} protocoles")

    print("\n  4/4  Rapprochement par identifiant…", flush=True)
    rapport: dict[str, dict] = {}
    tires = 0
    for ticker in sorted(perps):
        if ticker in deja:
            rapport[ticker] = {"classe": DEJA, "a_venir": 0, "slug": None}
            continue
        ident = table.get(ticker)
        # Le slug DefiLlama vaut le plus souvent l'identifiant CoinGecko.
        # Quand ce n'est pas le cas, on n'invente pas : on laisse le jeton
        # en « inconnu » plutot que de le rapprocher d'un homonyme.
        if not ident or ident not in slugs:
            rapport[ticker] = {"classe": INCONNU, "a_venir": 0, "slug": None}
            continue
        if tires >= args.max_telechargements:
            rapport[ticker] = {"classe": "non verifie (plafond atteint)",
                               "a_venir": 0, "slug": ident}
            continue
        detail = _get(f"{DATASETS}/emissions/{ident}", cache / f"{ident}.json")
        tires += 1
        time.sleep(args.pause)
        if not isinstance(detail, dict):
            rapport[ticker] = {"classe": INCONNU, "a_venir": 0, "slug": ident}
            continue
        # Le gecko_id du detail fait foi : il confirme que le protocole
        # DefiLlama est bien le jeton qu'Hyperliquid cote.
        if (detail.get("gecko_id") or "") != ident:
            rapport[ticker] = {"classe": INCONNU, "a_venir": 0, "slug": ident}
            continue
        classe, n = classer(evenements_du_detail(detail), maintenant)
        rapport[ticker] = {"classe": classe, "a_venir": n, "slug": ident}
        if n:
            print(f"       {ticker:<8} {ident:<24} {n:>3} déblocages à venir",
                  flush=True)

    Path(args.rapport).parent.mkdir(parents=True, exist_ok=True)
    Path(args.rapport).write_text(json.dumps(rapport, indent=1, sort_keys=True))

    compte: dict[str, int] = {}
    for x in rapport.values():
        compte[x["classe"]] = compte.get(x["classe"], 0) + 1
    gagnes = sum(x["a_venir"] for x in rapport.values())
    jetons_gagnes = sum(1 for x in rapport.values() if x["classe"] == RATE)

    print("\n  " + "=" * 72)
    print("  DIAGNOSTIC DE COUVERTURE")
    print("  " + "=" * 72)
    for classe in (DEJA, RATE, EPUISE, TROP_PETIT, INCONNU):
        if classe in compte:
            print(f"    {classe:<40} {compte[classe]:>4}")
    for classe, n in sorted(compte.items()):
        if classe not in (DEJA, RATE, EPUISE, TROP_PETIT, INCONNU):
            print(f"    {classe:<40} {n:>4}")
    print("  " + "-" * 72)
    print(f"    jetons RÉCUPÉRABLES sans nouvelle source   {jetons_gagnes:>4}")
    print(f"    déblocages à venir qu'ils apportent        {gagnes:>4}")
    print("  " + "-" * 72)
    if jetons_gagnes:
        print("  Le défaut est CHEZ NOUS, pas chez DefiLlama : ces jetons sont")
        print("  dans le calendrier de la source et le filtre par nom les rate.")
        print("  Correction gratuite, aucune nouvelle dépendance.")
    if compte.get(INCONNU):
        print(f"  {compte[INCONNU]} perpétuels restent hors de DefiLlama. C'est eux,")
        print("  et eux seuls, qui justifieraient une seconde source.")
    print(f"\n  Rapport écrit dans {args.rapport}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
