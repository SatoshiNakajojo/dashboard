#!/usr/bin/env python3
"""Pourquoi 166 perpétuels sur 234 n'ont-ils pas de calendrier ?

    python3 scripts/sonder_couverture_unlocks.py

**À lancer depuis le VPS.** `defillama-datasets.llama.fi` et
`api.coingecko.com` ne sont pas joignables depuis l'environnement de
développement ; le VPS les atteint, c'est lui qui alimente le rituel.

**Le Python du système suffit**, et c'est voulu : ce script n'importe que
`trading_desk.deblocages`, qui ne dépend de rien. Le VPS n'héberge que la
collecte, ses dépendances vivent dans un venv réservé à l'utilisateur
`desk`, et un diagnostic qui exigerait cet interpréteur-là serait
inexécutable par qui administre la machine.

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

Il **ne filtre rien avant de lire**. Il télécharge chaque protocole du
calendrier DefiLlama et lit son `gecko_id`, qui est le seul rapprochement
qui fasse foi. Si ce `gecko_id` correspond à un perpétuel coté, le jeton est
récupérable — quel que soit le nom du protocole.

C'est exactement l'inverse de la collecte, et c'est le point : filtrer avant
de lire, c'est décider sans savoir.

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

# La regle vient de `trading_desk.deblocages`, jamais recopiee ici : une
# copie derive un jour, et la derive ne se voit pas dans les chiffres.
#
# Ce module n'importe RIEN — c'est ce qui permet a ce diagnostic de tourner
# avec le Python du systeme. Il vivait dans `sentinelle.triggers`, qui tire
# pydantic via `Bar`, et ce script mourait alors sur « No module named
# 'pydantic' » puis sur « Permission denied » en essayant d'emprunter le
# venv reserve a l'utilisateur `desk`.
from trading_desk.deblocages import (  # noqa: E402
    DEBLOCAGE_PART_MAX,
    DEBLOCAGE_PART_MIN,
    deblocages_retenus,
)

DATASETS = "https://defillama-datasets.llama.fi"
HYPERLIQUID = "https://api.hyperliquid.xyz/info"
COINGECKO = "https://api.coingecko.com/api/v3"
REESSAYABLES = {408, 429, 500, 502, 503, 504}
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


def _get(url: str, cache: Path | None = None, essais: int = 3) -> object | None:
    """Lit une URL, avec cache disque. **Et dit pourquoi quand ça rate.**

    La première version renvoyait `None` sans un mot. Le script annonçait
    alors « LISTE INDISPONIBLE — le miroir a refusé » sur une machine où le
    rituel hebdomadaire interroge le MÊME miroir avec succès, et il n'y avait
    aucun moyen de savoir si c'était un 429, un 403 ou une coupure réseau.

    Un diagnostic qui cache la cause de sa propre panne ne diagnostique rien.
    """
    if cache and cache.exists():
        try:
            return json.loads(cache.read_text())
        except ValueError:
            cache.unlink()
    dernier = ""
    for tentative in range(1, essais + 1):
        try:
            req = urllib.request.Request(url, headers=ENTETES)
            with urllib.request.urlopen(req, timeout=90) as r:
                charge = json.loads(r.read(60_000_000))
            if cache:
                cache.parent.mkdir(parents=True, exist_ok=True)
                cache.write_text(json.dumps(charge))
            return charge
        except urllib.error.HTTPError as exc:
            dernier = f"HTTP {exc.code} {exc.reason}"
            # 402, 401, 403 et 404 ne changeront pas d'avis dans deux
            # secondes : les réessayer ne fait que retarder le message utile.
            if exc.code not in REESSAYABLES:
                break
        except Exception as exc:
            dernier = f"{type(exc).__name__}: {str(exc)[:80]}"
        if tentative < essais:
            time.sleep(2 ** tentative)
    print(f"       ÉCHEC {url}\n             {dernier}", file=sys.stderr)
    return None


def perps_hyperliquid() -> set[str]:
    req = urllib.request.Request(
        HYPERLIQUID, data=json.dumps({"type": "meta"}).encode(),
        headers={**ENTETES, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        meta = json.loads(r.read())
    return {u["name"].upper() for u in meta["universe"]}


def table_coingecko(perps: set[str], dossier: Path | None = None) -> dict[str, str]:
    """gecko_id -> ticker, restreinte aux perpétuels cotés.

    **Le même endpoint que la collecte**, `/coins/list`, et pour une raison
    mesurée : `/coins/markets` est lourd, sévèrement limité sur l'offre
    gratuite, et refusé depuis une IP de datacenter — 0 identifiant sur 234
    lors du premier essai depuis le VPS, là où le rituel hebdomadaire
    interroge `/coins/list` avec succès sur la même machine.

    On garde TOUTES les correspondances d'un ticker. Des dizaines de jetons
    se nomment « SUI » ou « OP », et ce n'est pas ici qu'on tranche : c'est
    le `gecko_id` du fichier DefiLlama qui le fera, et lui est unique. Trier
    par capitalisation serait un jugement de plus, pris sans source.
    """
    liste = _get(f"{COINGECKO}/coins/list", (dossier / "cg_liste.json") if dossier else None)
    table: dict[str, str] = {}
    for piece in liste or []:                        # type: ignore[union-attr]
        symbole = (piece.get("symbol") or "").upper()
        if symbole in perps and piece.get("id"):
            table[piece["id"]] = symbole
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

    print("\n  2/4  Table CoinGecko (gecko_id -> ticker)…", flush=True)
    table = table_coingecko(perps, dossier=cache)
    print(f"       {len(table)} identifiants correspondant à un perpétuel")
    if not table:
        print("       TABLE VIDE — sans elle aucun rapprochement n'est "
              "confirmable.\n       La cause est imprimée ci-dessus.",
              file=sys.stderr)
        return 1

    print("\n  3/4  Liste des protocoles DefiLlama…", flush=True)
    slugs = _get(f"{DATASETS}/emissionsProtocolsList", cache / "liste.json")
    if isinstance(slugs, dict):
        slugs = slugs.get("protocols") or slugs.get("data") or []
    slugs = sorted({s for s in (slugs or []) if isinstance(s, str)})
    if not slugs:
        print("       LISTE INDISPONIBLE. La cause est imprimée ci-dessus ; "
              "le rituel\n       hebdomadaire interroge le même miroir, donc "
              "comparez avec\n       `journalctl -u rituel-deblocages`.",
              file=sys.stderr)
        return 1
    print(f"       {len(slugs)} protocoles")

    # ON LES TÉLÉCHARGE TOUS, ET C'EST TOUT LE SUJET.
    #
    # `fetch_unlocks.py` ne tire que les slugs « plausibles » — ceux dont le
    # nom ressemble à un ticker. Or les slugs sont des NOMS DE PROTOCOLE :
    # `layerzero` pour ZRO, `ethena` pour ENA, `celestia` pour TIA. Le seul
    # rapprochement qui fasse foi est le `gecko_id`, et il n'est lisible
    # qu'une fois le fichier téléchargé. Filtrer avant de lire, c'est
    # décider sans savoir — et c'est ce qui plafonne la couverture à 68.
    print(f"\n  4/4  Rapprochement par gecko_id ({len(slugs)} fichiers)…",
          flush=True)
    rapport: dict[str, dict] = {ticker: {"classe": DEJA, "a_venir": 0, "slug": None}
                                for ticker in sorted(perps) if ticker in deja}
    vus: dict[str, str] = {}
    tires = refuses = 0
    for i, slug in enumerate(slugs, 1):
        if tires >= args.max_telechargements:
            break
        detail = _get(f"{DATASETS}/emissions/{slug}", cache / f"{slug}.json",
                      essais=1)
        tires += 1
        time.sleep(args.pause)
        if not isinstance(detail, dict):
            refuses += 1
            continue
        gecko = detail.get("gecko_id") or ""
        ticker = table.get(gecko)
        # Pas de gecko_id reconnu : ce protocole n'est pas un perpétuel coté,
        # ou son identifiant n'est pas celui que CoinGecko publie. On
        # n'invente pas de rapprochement — associer deux homonymes daterait
        # les événements du mauvais actif, et rien ne le signalerait.
        if not ticker or ticker in deja:
            continue
        vus[ticker] = slug
        classe, n = classer(evenements_du_detail(detail), maintenant)
        # Un ticker peut apparaître sous deux protocoles. On garde le plus
        # généreux : c'est celui qui portera les positions.
        ancien = rapport.get(ticker)
        if ancien is None or n > ancien["a_venir"]:
            rapport[ticker] = {"classe": classe, "a_venir": n, "slug": slug}
        if n:
            print(f"       {ticker:<8} {slug:<26} {n:>3} déblocages à venir",
                  flush=True)
        if i % 50 == 0:
            print(f"       … {i}/{len(slugs)}", flush=True)

    for ticker in sorted(perps):
        rapport.setdefault(ticker, {"classe": INCONNU, "a_venir": 0, "slug": None})
    if refuses:
        print(f"       {refuses} fichiers refusés par le miroir", file=sys.stderr)

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
