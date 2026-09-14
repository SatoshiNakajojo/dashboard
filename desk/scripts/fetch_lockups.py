#!/usr/bin/env python3
"""Les expirations de *lockup*, depuis le calendrier d'introductions Nasdaq.

    python3 scripts/fetch_lockups.py --debut 2023-01 --fin 2025-12

Écrit `data/lockups.json` : un événement daté par introduction retenue.

## Ce script ne devine rien

Chaque champ qu'il lit a été vu dans une sonde, le 8 septembre 2026 :

    proposedTickerSymbol · companyName · proposedSharePrice
    sharesOffered · pricedDate · dealStatus

C'est la leçon de `fetch_unlocks.py`, dont la première version lisait une
structure supposée sur une API devenue payante : propre, testée,
entièrement fausse.

## Les règles, et elles viennent du pré-enregistrement

Elles ont été écrites AVANT toute mesure, dans
`docs/preenregistrement-lockup-actions.md` et son amendement. Ce script les
applique, il ne les choisit pas.

**Expiration à J+180.** Convention de marché, pas un réglage.

**Les SPAC sont exclues** sur `proposedSharePrice == "10.00"`. La sonde a
montré que ce critère englobe les neuf sociétés au nom en « Acquisition »
d'un échantillon de 57 — c'est donc le plus large des deux, et le plus
simple. Elles représentaient 21 % du calendrier.

**Seules les introductions RÉELLEMENT cotées.** Le calendrier sépare
`priced`, `filed`, `upcoming` et `withdrawn` ; ne lire que `priced` écarte
d'emblée les dépôts sans suite. Une société dont l'introduction a été
retirée n'a jamais eu de *lockup*.

## Ce que ce script NE filtre pas, à dessein

Rien pour cause de faillite, de radiation ou de mauvaise performance. Un
ticker radié depuis reste dans le fichier. C'est au collecteur de cours de
constater son absence, et ce constat sera compté — pas effacé.
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

AGENT = "desk-research/1.0"
JOUR_MS = 86_400_000

# Le pré-enregistrement. Modifier une de ces valeurs demande un amendement
# écrit AVANT la mesure suivante, dans son propre commit.
LOCKUP_JOURS = 180
PRIX_SPAC = "10.00"


def _get(url: str, essais: int = 3):
    for n in range(essais):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": AGENT, "Accept": "application/json, */*"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as exc:
            # 429 et 5xx sont transitoires ; un 404 ne le sera jamais.
            if exc.code not in (408, 429) and exc.code < 500:
                raise
        except (urllib.error.URLError, TimeoutError):
            pass
        if n + 1 < essais:
            time.sleep(2 ** n)
    raise RuntimeError(f"trois échecs sur {url}")


def mois_entre(debut: str, fin: str) -> list[tuple[int, int]]:
    a1, m1 = (int(x) for x in debut.split("-"))
    a2, m2 = (int(x) for x in fin.split("-"))
    out = []
    while (a1, m1) <= (a2, m2):
        out.append((a1, m1))
        m1 += 1
        if m1 > 12:
            a1, m1 = a1 + 1, 1
    return out


def _entier(texte: str | None) -> int | None:
    """« 6,250,000 » -> 6250000. Une valeur illisible vaut None, pas zéro.

    Zéro passerait pour une introduction sans actions offertes, ce qui
    n'existe pas, et fausserait toute part calculée dessus.
    """
    if not texte:
        return None
    try:
        return int(str(texte).replace(",", "").replace("$", "").strip())
    except ValueError:
        return None


def evenements(rows: list[dict]) -> list[dict]:
    """Un événement par introduction retenue, avec sa date d'expiration."""
    out = []
    for r in rows:
        if (r.get("dealStatus") or "").strip() != "Priced":
            continue
        if (r.get("proposedSharePrice") or "").strip() == PRIX_SPAC:
            continue
        ticker = (r.get("proposedTickerSymbol") or "").strip().upper()
        if not ticker or not ticker.isalpha():
            continue
        try:
            introduction = dt.datetime.strptime(
                r["pricedDate"], "%m/%d/%Y").replace(tzinfo=dt.UTC)
        except (KeyError, ValueError, TypeError):
            continue
        expiration = introduction + dt.timedelta(days=LOCKUP_JOURS)
        out.append({
            "ticker": ticker,
            "societe": (r.get("companyName") or "").strip(),
            "introduction_ms": int(introduction.timestamp() * 1000),
            "expiration_ms": int(expiration.timestamp() * 1000),
            "actions_offertes": _entier(r.get("sharesOffered")),
            "prix_introduction": r.get("proposedSharePrice"),
            "bourse": (r.get("proposedExchange") or "").strip(),
        })
    return out


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--debut", default="2023-01", help="AAAA-MM inclus")
    p.add_argument("--fin", default="2025-12", help="AAAA-MM inclus")
    p.add_argument("--out", default="data/lockups.json")
    args = p.parse_args()

    mois = mois_entre(args.debut, args.fin)
    print(f"\n  {len(mois)} mois, de {args.debut} à {args.fin}\n")

    tous, spac, non_cotees = [], 0, 0
    for annee, m in mois:
        try:
            d = _get(f"https://api.nasdaq.com/api/ipo/calendar"
                     f"?date={annee}-{m:02d}")["data"]
        except Exception as exc:
            print(f"    {annee}-{m:02d} ÉCHEC — {exc}", file=sys.stderr)
            continue
        rows = (d.get("priced") or {}).get("rows") or []
        spac += sum(1 for r in rows
                    if (r.get("proposedSharePrice") or "").strip() == PRIX_SPAC)
        non_cotees += sum(1 for r in rows
                          if (r.get("dealStatus") or "").strip() != "Priced")
        gardes = evenements(rows)
        tous += gardes
        print(f"    {annee}-{m:02d} : {len(rows):>3} cotées, "
              f"{len(gardes):>3} retenues", end="\r", flush=True)

    # Un même ticker peut apparaître deux fois (correction du calendrier).
    # On garde la première introduction : une société ne s'introduit qu'une
    # fois, et un doublon compterait deux fois le même événement.
    vus, uniques = set(), []
    for e in sorted(tous, key=lambda x: x["introduction_ms"]):
        if e["ticker"] not in vus:
            vus.add(e["ticker"])
            uniques.append(e)

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(uniques, indent=1, ensure_ascii=False))

    print(f"\n\n  {len(uniques)} introductions retenues "
          f"({len(tous) - len(uniques)} doublons écartés)")
    print(f"  {spac} SPAC exclues (prix {PRIX_SPAC} $)")
    if non_cotees:
        print(f"  {non_cotees} lignes non « Priced » ignorées")
    sans_actions = sum(1 for e in uniques if e["actions_offertes"] is None)
    if sans_actions:
        print(f"  {sans_actions} sans nombre d'actions lisible — elles restent "
              "dans le\n  test principal, qui n'en a pas besoin")
    print(f"\n  Écrit dans {args.out}")
    print(f"  Expiration = introduction + {LOCKUP_JOURS} jours "
          "(pré-enregistré)\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
