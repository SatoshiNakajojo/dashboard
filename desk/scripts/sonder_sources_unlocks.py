#!/usr/bin/env python3
"""Quelle source de calendriers de déblocage est encore joignable ?

    python3 scripts/sonder_sources_unlocks.py

`api.llama.fi/emissions` a répondu **402 Payment Required**. Deux causes
possibles, et elles appellent des remèdes opposés :

- **l'endpoint est passé payant** — il faut alors une autre source ;
- **l'IP est refusée** — les adresses de datacenter (Hetzner, OVH, AWS) sont
  souvent filtrées par les API gratuites derrière Cloudflare. Le code
  fonctionnerait alors tel quel depuis une connexion résidentielle.

Ce script tranche. Il interroge un endpoint **certainement gratuit**
(`/protocols`) en même temps que ceux qui nous intéressent :

- `/protocols` marche mais `/emissions` non  -> l'endpoint a bougé ;
- **rien** ne marche                          -> c'est l'IP ou le réseau.

Lancez-le depuis le VPS **et** depuis votre Mac : si le Mac répond et pas le
VPS, la réponse est définitive.

Aucune dépendance, aucune écriture. Il lit et il rapporte.
"""

from __future__ import annotations

import urllib.error
import urllib.request

SOURCES = [
    # (libellé, url, ce que ça prouve)
    ("témoin gratuit", "https://api.llama.fi/protocols",
     "si CECI échoue, le problème est l'IP ou le réseau, pas l'endpoint"),
    ("emissions (v1)", "https://api.llama.fi/emissions", "la source d'origine"),
    ("emission d'un protocole", "https://api.llama.fi/emission/aptos",
     "parfois encore gratuit quand la liste ne l'est plus"),
    ("jeux de données", "https://defillama-datasets.llama.fi/emissionsProtocolsList",
     "miroir statique, sans quota"),
    ("front-end", "https://defillama.com/api/emissions",
     "ce que le site appelle lui-même"),
    ("CoinGecko témoin", "https://api.coingecko.com/api/v3/ping",
     "un second témoin, sur un autre hébergeur"),
]


def sonder(url: str, timeout: int = 25) -> tuple[str, str]:
    req = urllib.request.Request(url, headers={
        # Certaines API refusent un User-Agent d'automate mais acceptent un
        # navigateur. Le distinguer d'un vrai blocage d'IP demande ce test.
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        "Accept": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            brut = r.read(2000)
            return f"{r.status} OK", brut[:220].decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        return f"{exc.code} {exc.reason}", (exc.read()[:180].decode("utf-8", "replace")
                                            if exc.fp else "")
    except (urllib.error.URLError, TimeoutError) as exc:
        return "injoignable", str(exc)[:180]


def main() -> int:
    print(f"\n  Sonde depuis cette machine — {len(SOURCES)} sources\n")
    resultats = []
    for libelle, url, pourquoi in SOURCES:
        etat, extrait = sonder(url)
        resultats.append((libelle, etat))
        print(f"  {libelle:<26} {etat}")
        print(f"      {url}")
        print(f"      ({pourquoi})")
        if extrait.strip():
            print(f"      reçu : {extrait.strip()[:200]}")
        print()

    par_libelle = dict(resultats)
    temoin = par_libelle.get("témoin gratuit", "")
    print("  " + "=" * 66)
    if temoin.startswith("2"):
        marche = [nom for nom, etat in resultats
                  if etat.startswith("2") and nom != "témoin gratuit"]
        print("  Le témoin gratuit répond : le réseau et l'IP vont bien.")
        if marche:
            print(f"  Sources exploitables : {', '.join(marche)}")
        else:
            print("  Mais AUCUNE source de déblocages ne répond : elles sont")
            print("  passées payantes. Il faut changer de source.")
    else:
        print("  Le témoin gratuit lui-même échoue : le problème n'est PAS")
        print("  l'endpoint. C'est l'IP de cette machine ou son réseau.")
        print("  Relancez cette sonde depuis votre Mac pour confirmer.")
    print("  " + "=" * 66)
    print("\n  Collez cette sortie entière : elle dit quoi faire ensuite.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
