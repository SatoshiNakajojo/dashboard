#!/usr/bin/env python3
"""Que valent les sources actions, vraiment ? Sonder avant d'écrire.

    python3 scripts/sonder_sources_actions.py

Ce script ne parse rien et ne conclut rien. Il frappe chaque source
candidate, rapporte ce qui revient, et s'arrête là.

## Pourquoi cette étape existe

`fetch_unlocks.py` a d'abord été écrit contre une API supposée. Elle était
devenue payante — 402 sur chaque appel — et la structure de données que le
parseur attendait n'existait pas. Le script était propre, testé, et
entièrement faux. Il a fallu une sonde pour découvrir la forme réelle, puis
le réécrire.

Le coût d'une sonde est de trois minutes. Le coût d'un parseur écrit sur une
structure devinée, c'est un jeu de données silencieusement faux dont on tire
des conclusions.

## Ce qu'il faut trouver, et pourquoi c'est en deux morceaux

**Les dates.** Un *lockup* d'IPO expire par convention 180 jours après
l'introduction. La règle est publique et posée d'avance ; ce qu'il faut,
c'est une liste d'introductions qui ne soit pas choisie à la main.

Une liste écrite de mémoire ne contiendrait que les IPO dont on se souvient
— les grosses, les survivantes. C'est exactement le biais de survie que ce
projet combat depuis le début, et il suffirait à fabriquer l'effet.

**Les cours.** Des bougies journalières, sur au moins un an après
l'introduction, pour les tickers retenus.

## Sur l'en-tête envoyé à la SEC

La SEC demande un `User-Agent` identifiant l'appelant et refuse les requêtes
anonymes. Ce script en envoie un descriptif, sans donnée personnelle. Si la
SEC refuse quand même, `--contact` permet d'y mettre votre propre adresse —
c'est votre décision, pas la mienne, et rien n'est envoyé sans que vous
l'ayez tapé.
"""

from __future__ import annotations

import argparse
import json
import urllib.error
import urllib.request

SOURCES = [
    ("stooq / cours journaliers",
     "https://stooq.com/q/d/l/?s=aapl.us&i=d", "csv"),
    ("stooq / ticker récent (IPO 2024)",
     "https://stooq.com/q/d/l/?s=rddt.us&i=d", "csv"),
    ("SEC / table ticker vers CIK",
     "https://www.sec.gov/files/company_tickers.json", "json"),
    ("SEC / recherche plein texte des prospectus 424B4",
     "https://efts.sec.gov/LATEST/search-index?q=%22initial%20public%20offering%22"
     "&dateRange=custom&startdt=2024-01-01&enddt=2024-03-31&forms=424B4", "json"),
    ("SEC / API de recherche (autre chemin)",
     "https://efts.sec.gov/LATEST/search-index?q=test&forms=424B4", "json"),
    ("Nasdaq / calendrier des IPO",
     "https://api.nasdaq.com/api/ipo/calendar?date=2024-01", "json"),
    ("Yahoo / bougies journalières",
     "https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=2y&interval=1d",
     "json"),
]


def _forme(donnee, profondeur: int = 0, max_p: int = 2) -> str:
    """Décrit la STRUCTURE d'une réponse, pas son contenu.

    C'est la seule chose qui compte à ce stade : un parseur se casse sur une
    forme inattendue, jamais sur une valeur inattendue.
    """
    espace = "  " * (profondeur + 1)
    if isinstance(donnee, dict):
        if profondeur >= max_p:
            return f"objet ({len(donnee)} clés : {', '.join(list(donnee)[:6])})"
        lignes = []
        for cle in list(donnee)[:8]:
            lignes.append(f"\n{espace}{cle}: "
                          f"{_forme(donnee[cle], profondeur + 1, max_p)}")
        reste = f"\n{espace}… {len(donnee) - 8} autres" if len(donnee) > 8 else ""
        return "objet {" + "".join(lignes) + reste + "}"
    if isinstance(donnee, list):
        if not donnee:
            return "liste vide"
        return (f"liste de {len(donnee)}, premier = "
                f"{_forme(donnee[0], profondeur + 1, max_p)}")
    if isinstance(donnee, str):
        court = donnee[:60].replace("\n", " ")
        return f'"{court}…"' if len(donnee) > 60 else f'"{donnee}"'
    return f"{type(donnee).__name__} {donnee}"


def sonder(nom: str, url: str, genre: str, agent: str) -> None:
    print(f"\n  {nom}")
    print(f"  {url[:96]}")
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": agent,
            "Accept": "application/json, text/csv, */*",
        })
        with urllib.request.urlopen(req, timeout=25) as r:
            brut = r.read()
            print(f"    HTTP {r.status} · {len(brut)} octets")
    except urllib.error.HTTPError as exc:
        corps = exc.read()[:200].decode("utf-8", "replace")
        print(f"    HTTP {exc.code} — {exc.reason}")
        if corps.strip():
            print(f"    corps : {corps}")
        return
    except Exception as exc:
        # On rattrape TOUT : une sonde qui tombe sur la troisième source
        # n'apprend rien des quatre suivantes, et c'est justement la
        # comparaison entre sources qui décide de la suite.
        print(f"    ÉCHEC — {type(exc).__name__} : {exc}")
        return

    if genre == "csv":
        lignes = brut.decode("utf-8", "replace").splitlines()
        print(f"    {len(lignes)} lignes")
        for ligne in lignes[:3]:
            print(f"      {ligne[:100]}")
        if len(lignes) > 4:
            print(f"      …\n      {lignes[-1][:100]}")
        return
    try:
        print(f"    {_forme(json.loads(brut))}")
    except json.JSONDecodeError:
        print(f"    pas du JSON : {brut[:160].decode('utf-8', 'replace')}")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--contact", default=None,
                   help="adresse à mettre dans le User-Agent si la SEC "
                        "refuse l'en-tête par défaut. Rien n'est envoyé "
                        "sans que vous l'ayez tapée.")
    args = p.parse_args()
    agent = (f"desk-research/1.0 ({args.contact})" if args.contact
             else "desk-research/1.0")

    print("\n  SONDE DES SOURCES ACTIONS")
    print("  " + "=" * 74)
    print(f"  User-Agent : {agent}")
    print("  Aucun parseur n'est écrit avant que cette sortie soit lue.")
    for nom, url, genre in SOURCES:
        sonder(nom, url, genre, agent)
    print("\n  " + "=" * 74)
    print("  Collez cette sortie telle quelle. Ce qui m'intéresse :")
    print("    · quelles sources répondent 200 ;")
    print("    · si stooq sert bien des bougies pour un ticker RÉCENT ;")
    print("    · quelle source donne une liste d'IPO non choisie à la main.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
