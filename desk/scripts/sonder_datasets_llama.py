#!/usr/bin/env python3
"""Trouve la forme d'URL et la STRUCTURE des calendriers sur le miroir statique.

    python3 scripts/sonder_datasets_llama.py

`api.llama.fi/emissions` est passé payant (402), mais
`defillama-datasets.llama.fi/emissionsProtocolsList` répond toujours. Reste
à savoir sous quelle URL on récupère le calendrier d'UN protocole, et à quoi
ressemble sa structure.

Ce script cherche les deux et **imprime l'arborescence de ce qu'il trouve**.
Sans cette structure, j'écrirais le parseur à l'aveugle — et un parseur
écrit à l'aveugle sur un format deviné produit des dates fausses en silence,
ce qui est bien pire qu'une erreur.

Aucune dépendance. Il lit et il rapporte.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request

BASE = "https://defillama-datasets.llama.fi"
FORMES = [
    "{base}/emissions/{slug}",
    "{base}/emissions/{slug}.json",
    "{base}/emission/{slug}",
    "{base}/emissionsProtocols/{slug}",
]
ENTETES = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
           "Accept": "application/json"}


def lire(url: str, octets: int = 4_000_000):
    req = urllib.request.Request(url, headers=ENTETES)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read(octets))


def arbre(valeur, prefixe: str = "", profondeur: int = 0, max_p: int = 5) -> None:
    """Imprime la forme, pas le contenu : les clés, les types, les tailles."""
    marge = "    " + "  " * profondeur
    if profondeur > max_p:
        print(f"{marge}…")
        return
    if isinstance(valeur, dict):
        print(f"{marge}{prefixe}dict, {len(valeur)} clés : "
              f"{', '.join(list(valeur)[:12])}")
        for cle in list(valeur)[:6]:
            arbre(valeur[cle], f"{cle} = ", profondeur + 1, max_p)
    elif isinstance(valeur, list):
        print(f"{marge}{prefixe}liste de {len(valeur)}")
        if valeur:
            arbre(valeur[0], "[0] ", profondeur + 1, max_p)
    else:
        texte = repr(valeur)
        print(f"{marge}{prefixe}{type(valeur).__name__} = "
              f"{texte[:70]}{'…' if len(texte) > 70 else ''}")


def main() -> int:
    print("\n  1/3  Liste des protocoles…")
    try:
        liste = lire(f"{BASE}/emissionsProtocolsList")
    except Exception as exc:
        print(f"       échec : {exc}")
        return 2
    if isinstance(liste, dict):
        liste = liste.get("protocols") or liste.get("data") or []
    print(f"       {len(liste)} protocoles")

    # Un slug qui est AUSSI un perpétuel Hyperliquid : c'est l'intersection
    # qui nous intéresse, autant sonder dessus.
    prefere = [s for s in liste if isinstance(s, str)
               and s.lower() in {"sei", "aptos", "sui", "arbitrum", "optimism",
                                 "celestia", "jupiter", "lido", "dydx"}]
    slug = prefere[0] if prefere else next(s for s in liste if isinstance(s, str))
    print(f"       protocole sondé : {slug}")

    print("\n  2/3  Forme d'URL…")
    detail = None
    trouvee = ""
    for forme in FORMES:
        url = forme.format(base=BASE, slug=slug)
        try:
            detail = lire(url)
            trouvee = url
            print(f"       200  {url}")
            break
        except urllib.error.HTTPError as exc:
            print(f"       {exc.code:<4} {url}")
        except Exception as exc:
            print(f"       ---  {url}  ({str(exc)[:60]})")

    if detail is None:
        print("\n  Aucune forme ne répond. Collez cette sortie : je cherche")
        print("  une autre piste (le dépôt GitHub des adaptateurs).\n")
        return 2

    print(f"\n  3/3  Structure de {trouvee}\n")
    arbre(detail)

    # La seule chose dont le parseur a besoin : une série datée de quantités
    # débloquées. On la cherche explicitement pour que la réponse soit nette.
    print("\n  Recherche d'une série datée…")
    def chercher(v, chemin="racine", profondeur=0):
        if profondeur > 6:
            return
        if isinstance(v, dict):
            cles = set(v)
            if {"timestamp"} & cles and cles & {"unlocked", "value", "amount"}:
                print(f"       trouvé en {chemin} : {json.dumps(v)[:160]}")
                return
            for c, sv in list(v.items())[:12]:
                chercher(sv, f"{chemin}.{c}", profondeur + 1)
        elif isinstance(v, list) and v:
            chercher(v[0], f"{chemin}[0]", profondeur + 1)
    chercher(detail)

    print("\n  Collez cette sortie entière : elle contient tout ce qu'il faut")
    print("  pour écrire le parseur correctement du premier coup.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
