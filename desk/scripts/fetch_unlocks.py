#!/usr/bin/env python3
"""Récupère les calendriers de déblocage (token unlocks) et les bougies.

    python3 scripts/fetch_unlocks.py --out data/unlocks.json

**À lancer depuis VOTRE machine.** L'environnement où ce code a été écrit
n'atteint pas `api.llama.fi` — sa politique réseau ne laisse passer
qu'une liste d'hôtes, dont Hyperliquid fait partie mais pas DefiLlama. Ce
script n'a donc **jamais tourné contre l'API réelle** : il est écrit d'après
la forme documentée, et la première exécution est la vôtre. C'est aussi
pourquoi il affiche la structure brute de ce qu'il reçoit avant d'en faire
quoi que ce soit — si la forme a changé, on le verra tout de suite au lieu
de le découvrir dans les résultats.

Trois étapes :

1. la liste des protocoles ayant un calendrier d'émission (DefiLlama) ;
2. l'intersection avec les perpétuels listés sur Hyperliquid — un déblocage
   sur un jeton qu'on ne peut pas trader n'a aucun intérêt pour ce desk ;
3. les bougies journalières de cette intersection.

**L'univers n'est jamais choisi à la main.** Il est l'intersection de deux
listes exogènes. Sélectionner « les jetons dont je me souviens qu'ils ont
chuté » serait le biais de survivance à l'envers, et il produirait un
résultat garanti d'avance.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from itertools import pairwise
from pathlib import Path

LLAMA = "https://api.llama.fi"
HYPERLIQUID = "https://api.hyperliquid.xyz/info"


def _get(url: str, essais: int = 3) -> object:
    for tentative in range(1, essais + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "desk/1.0"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read())
        except (urllib.error.URLError, TimeoutError, ValueError) as exc:
            if tentative == essais:
                raise
            attente = 2 ** tentative
            print(f"    échec ({exc}), nouvel essai dans {attente} s…",
                  file=sys.stderr)
            time.sleep(attente)
    return None


def _post(url: str, charge: dict) -> object:
    donnees = json.dumps(charge).encode()
    req = urllib.request.Request(
        url, data=donnees,
        headers={"Content-Type": "application/json", "User-Agent": "desk/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def perps_hyperliquid() -> set[str]:
    meta = _post(HYPERLIQUID, {"type": "meta"})
    return {u["name"] for u in meta["universe"]}          # type: ignore[index]


def evenements(protocole: dict) -> list[dict]:
    """Extrait les déblocages datés d'un protocole DefiLlama.

    La réponse de `/emission/{slug}` porte des séries d'émission par
    catégorie. Un « déblocage » est un SAUT dans la quantité en circulation :
    on dérive donc la série plutôt que de chercher un champ « unlock » qui
    n'existe pas sous ce nom.
    """
    sorties: list[dict] = []
    documents = protocole.get("documentedData") or protocole.get("data") or {}
    series = documents.get("data") if isinstance(documents, dict) else None
    if not isinstance(series, list):
        return sorties

    par_date: dict[int, float] = {}
    for categorie in series:
        for point in (categorie.get("data") or []):
            ts = point.get("timestamp")
            valeur = point.get("unlocked")
            if ts is None or valeur is None:
                continue
            par_date[int(ts)] = par_date.get(int(ts), 0.0) + float(valeur)

    dates = sorted(par_date)
    for precedent, courant in pairwise(dates):
        avant, apres = par_date[precedent], par_date[courant]
        if avant <= 0 or apres <= avant:
            continue
        saut = apres - avant
        sorties.append({
            "ts_ms": courant * 1000,
            "debloque": saut,
            # La part de l'offre en circulation est LA variable qui compte :
            # un déblocage de 0,1 % et un de 20 % n'ont rien à voir, et les
            # mélanger noierait le second dans le premier.
            "part_offre": saut / avant,
        })
    return sorties


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--out", default="data/unlocks.json")
    p.add_argument("--jours-bougies", type=int, default=1500)
    p.add_argument("--part-min", type=float, default=0.005,
                   help="ignore les déblocages sous ce %% de l'offre. 0,5 %% "
                        "par défaut : en dessous, l'effet serait indétectable "
                        "sous le bruit quotidien d'un jeton crypto.")
    p.add_argument("--sans-bougies", action="store_true",
                   help="ne récupérer que le calendrier")
    args = p.parse_args()

    print("\n  1/3  Perpétuels listés sur Hyperliquid…")
    perps = perps_hyperliquid()
    print(f"       {len(perps)} perpétuels")

    print("\n  2/3  Calendriers d'émission (DefiLlama)…")
    liste = _get(f"{LLAMA}/emissions")
    if isinstance(liste, dict):
        liste = liste.get("protocols") or liste.get("data") or []
    if not isinstance(liste, list) or not liste:
        print("\n  La réponse de /emissions n'a pas la forme attendue.",
              file=sys.stderr)
        print(f"  Reçu : {json.dumps(liste)[:600]}", file=sys.stderr)
        print("\n  Envoyez-moi ces lignes : le script s'adapte en une minute.",
              file=sys.stderr)
        return 2
    print(f"       {len(liste)} protocoles avec calendrier")

    # Un symbole peut manquer, être en minuscules, ou différer du perp.
    # On ne rapproche que sur une correspondance EXACTE en majuscules : un
    # rapprochement approximatif associerait des jetons homonymes, et
    # l'erreur serait invisible dans les résultats.
    candidats = {}
    for proto in liste:
        symbole = (proto.get("symbol") or proto.get("token") or "").upper()
        slug = proto.get("gecko_id") or proto.get("name") or proto.get("slug")
        if symbole and symbole in perps and slug:
            candidats[symbole] = str(slug).lower().replace(" ", "-")
    print(f"       {len(candidats)} jetons tradables ET avec calendrier : "
          f"{', '.join(sorted(candidats))}")
    if not candidats:
        print("\n  Aucune intersection — vérifiez la forme des symboles.",
              file=sys.stderr)
        print(f"  Premier protocole reçu : {json.dumps(liste[0])[:500]}",
              file=sys.stderr)
        return 2

    print("\n  3/3  Déblocages datés, protocole par protocole…")
    resultat: dict[str, list[dict]] = {}
    for symbole, slug in sorted(candidats.items()):
        try:
            detail = _get(f"{LLAMA}/emission/{slug}")
        except Exception as exc:
            print(f"       {symbole:<8} indisponible ({exc})")
            continue
        if not isinstance(detail, dict):
            continue
        evts = [e for e in evenements(detail) if e["part_offre"] >= args.part_min]
        if evts:
            resultat[symbole] = evts
        print(f"       {symbole:<8} {len(evts):>4} déblocages ≥ "
              f"{args.part_min:.1%} de l'offre")
        time.sleep(0.3)          # courtoisie envers une API gratuite

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(resultat, indent=1))
    total = sum(len(v) for v in resultat.values())
    print(f"\n  {total} déblocages sur {len(resultat)} jetons -> {args.out}")

    if args.sans_bougies:
        return 0

    print("\n  Bougies journalières…")
    import subprocess
    racine = Path(__file__).resolve().parent
    for symbole in sorted(resultat):
        cible = Path(f"data/{symbole}_1d_real.json")
        if cible.exists():
            print(f"       {symbole:<8} déjà présent")
            continue
        subprocess.run(
            [sys.executable, str(racine / "fetch_candles.py"),
             "--asset", symbole, "--interval", "1d",
             "--days", str(args.jours_bougies), "--out", str(cible)],
            check=False)

    print("\n  Terminé. Analyse :")
    print("      python3 scripts/valider_unlocks.py --unlocks "
          f"{args.out} --tirages 2000\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
