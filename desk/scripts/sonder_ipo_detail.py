#!/usr/bin/env python3
"""Deuxième sonde : la STRUCTURE interne des deux sources retenues.

    python3 scripts/sonder_ipo_detail.py

La première sonde a tranché quelles sources répondent. Celle-ci regarde
dedans, et elle répond à trois questions dont dépend tout le reste.

**Le calendrier Nasdaq couvre-t-il plusieurs années ?** Une réplication sur
six mois d'introductions n'aurait pas les cent événements que le
pré-enregistrement exige avant de conclure quoi que ce soit.

**Yahoo sert-il un ticker RÉCENT ?** Toute la question porte sur des
sociétés introduites il y a moins de deux ans. Une source qui ne couvrirait
que les valeurs établies mesurerait exactement la population qui n'a pas de
*lockup*.

**Où trouver la taille de la libération ?** Le pré-enregistrement stratifie
par part du flottant. Si ce chiffre n'existe nulle part, la substitution
devra être écrite AVANT la mesure — c'est prévu, et c'est le seul écart
autorisé.

Aucun parseur n'est écrit tant que cette sortie n'est pas lue.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request

AGENT = "desk-research/1.0"


def _get(url: str):
    req = urllib.request.Request(url, headers={
        "User-Agent": AGENT, "Accept": "application/json, */*"})
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.loads(r.read())


def _essai(titre: str, fn) -> None:
    print(f"\n  {titre}")
    print("  " + "-" * 72)
    try:
        fn()
    except urllib.error.HTTPError as exc:
        print(f"    HTTP {exc.code} — {exc.reason}")
    except Exception as exc:
        print(f"    ÉCHEC — {type(exc).__name__} : {exc}")


def nasdaq_structure() -> None:
    d = _get("https://api.nasdaq.com/api/ipo/calendar?date=2024-03")["data"]
    priced = d.get("priced") or {}
    print(f"    colonnes : {priced.get('headers')}")
    lignes = priced.get("rows") or []
    print(f"    {len(lignes)} introductions cotées en mars 2024")
    for ligne in lignes[:3]:
        print(f"      {json.dumps(ligne, ensure_ascii=False)}")


def nasdaq_couverture() -> None:
    total = 0
    for annee in (2023, 2024, 2025):
        n_annee = 0
        for mois in (1, 4, 7, 10):
            try:
                d = _get(f"https://api.nasdaq.com/api/ipo/calendar"
                         f"?date={annee}-{mois:02d}")["data"]
                n = len((d.get("priced") or {}).get("rows") or [])
            except Exception:
                n = -1
            n_annee += max(n, 0)
            print(f"      {annee}-{mois:02d} : {n:>3} cotées")
        total += n_annee
    print(f"    sur ces 12 mois échantillonnés : {total} introductions")
    print(f"    extrapolé à 36 mois pleins : ~{total * 3} — le "
          f"pré-enregistrement en exige 100 minimum")


def yahoo_recent() -> None:
    for ticker, quand in (("RDDT", "IPO mars 2024"), ("ARM", "IPO sept. 2023"),
                          ("SPY", "la référence")):
        try:
            r = _get(f"https://query1.finance.yahoo.com/v8/finance/chart/"
                     f"{ticker}?range=5y&interval=1d")["chart"]["result"][0]
            meta, ts = r["meta"], r.get("timestamp") or []
            import datetime as dt
            debut = dt.datetime.fromtimestamp(ts[0], dt.UTC).date() if ts else "—"
            print(f"    {ticker:<6} {quand:<16} {len(ts):>5} bougies, "
                  f"depuis {debut}")
            if ticker == "RDDT":
                interessants = [k for k in meta
                                if "hare" in k or "loat" in k or "arket" in k]
                print(f"           champs de taille dans meta : "
                      f"{interessants or 'AUCUN'}")
                print(f"           toutes les clés de meta : {sorted(meta)}")
                ind = r["indicators"]
                print(f"           indicateurs : {list(ind)} → "
                      f"{list(ind['quote'][0])}")
        except Exception as exc:
            print(f"    {ticker:<6} ÉCHEC — {type(exc).__name__} : {exc}")


def sec_source() -> None:
    d = _get("https://efts.sec.gov/LATEST/search-index"
             "?q=%22lock-up%22&forms=424B4&startdt=2024-03-01&enddt=2024-03-31")
    hits = d["hits"]["hits"]
    print(f"    {d['hits']['total']} au total, {len(hits)} rendus")
    if hits:
        print(f"    clés de _source : {sorted(hits[0]['_source'])}")
        print(f"    exemple : {json.dumps(hits[0]['_source'], ensure_ascii=False)[:400]}")


def main() -> int:
    print("\n  SONDE DÉTAILLÉE — structure interne des sources retenues")
    print("  " + "=" * 74)
    _essai("Nasdaq · structure d'un mois d'introductions", nasdaq_structure)
    _essai("Nasdaq · couverture sur trois ans", nasdaq_couverture)
    _essai("Yahoo · un ticker récent, et les champs de taille", yahoo_recent)
    _essai("SEC · champs d'un prospectus 424B4", sec_source)
    print("\n  " + "=" * 74)
    print("  Ce que je cherche dans cette sortie :")
    print("    · les colonnes exactes du calendrier Nasdaq ;")
    print("    · si Yahoo remonte bien avant l'introduction d'un titre récent ;")
    print("    · UN champ, où que ce soit, qui donne la taille de la")
    print("      libération ou le flottant — sinon la substitution devra")
    print("      être écrite avant la mesure.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
