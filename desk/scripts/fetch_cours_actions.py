#!/usr/bin/env python3
"""Les bougies journalières des sociétés introduites, depuis Yahoo.

    python3 scripts/fetch_cours_actions.py --lockups data/lockups.json

Écrit un fichier par ticker au format du projet, pour que `load_from_file`
les relise sans code spécial — la même fonction que celle qui a servi aux
déblocages, aux stratégies et aux déclencheurs.

## La vérification croisée, et c'est elle qui compte

Yahoo donne `meta.firstTradeDate` : la première cotation, indépendante du
`pricedDate` de Nasdaq. **Les deux doivent coïncider.**

Un écart systématique signalerait qu'une des deux sources ne dit pas ce que
je crois — que `pricedDate` est la date de tarification et non de première
cotation, par exemple, ou que Yahoo remonte à une cotation antérieure sur
une autre place. La fenêtre J-7/J-1 serait alors décalée de plusieurs jours
sur *tous* les événements, et la campagne entière mesurerait autre chose
sans qu'aucune erreur ne se déclenche.

C'était inscrit au pré-enregistrement avant d'écrire ce script. L'écart est
compté, rapporté, et au-delà de `--ecart-max` jours l'événement est écarté.

## Ce qui est compté plutôt qu'effacé

Un ticker absent de Yahoo — radié, renommé, jamais indexé — est **compté et
nommé**, pas ignoré en silence. Ces disparues ne sont pas au hasard : ce
sont les échecs, et leur nombre borne la portée de tout ce qui suivra.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

AGENT = "desk-research/1.0"
JOUR_MS = 86_400_000


def _get(url: str, essais: int = 3):
    for n in range(essais):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": AGENT, "Accept": "application/json, */*"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as exc:
            if exc.code not in (408, 429) and exc.code < 500:
                raise
        except (urllib.error.URLError, TimeoutError):
            pass
        if n + 1 < essais:
            time.sleep(2 ** n)
    raise RuntimeError("trois échecs")


def bougies(brut: dict, ticker: str) -> tuple[list[dict], int | None]:
    """Convertit une réponse Yahoo au format de bougies du projet.

    Une barre dont un champ manque est **écartée, pas comblée**. Yahoo rend
    `null` sur les séances sans cotation ; les remplacer par la clôture
    précédente fabriquerait des barres qui n'ont pas eu lieu, et le comptage
    de touches d'un niveau les compterait comme de vraies visites.
    """
    res = brut["chart"]["result"][0]
    meta, ts = res["meta"], res.get("timestamp") or []
    q = res["indicators"]["quote"][0]
    out = []
    for i, t in enumerate(ts):
        o, h, low, c = q["open"][i], q["high"][i], q["low"][i], q["close"][i]
        if None in (o, h, low, c):
            continue
        v = q.get("volume", [None] * len(ts))[i] or 0
        debut = int(t) * 1000
        out.append({"t": debut, "T": debut + JOUR_MS - 1, "s": ticker,
                    "i": "1d", "o": f"{o:.6f}", "h": f"{h:.6f}",
                    "l": f"{low:.6f}", "c": f"{c:.6f}", "v": f"{v}", "n": 0})
    premiere = meta.get("firstTradeDate")
    return out, int(premiere) * 1000 if premiere else None


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--lockups", default="data/lockups.json")
    p.add_argument("--dossier", default="data/actions")
    p.add_argument("--ecart-max", type=int, default=5,
                   help="jours d'écart tolérés entre la date Nasdaq et la "
                        "première cotation Yahoo")
    p.add_argument("--min-bougies", type=int, default=90,
                   help="pré-enregistré : moins de 90 séances, pas de mesure")
    args = p.parse_args()

    chemin = Path(args.lockups)
    if not chemin.exists():
        print(f"\n  {chemin} introuvable. Lancez d'abord "
              "`python3 scripts/fetch_lockups.py`.\n", file=sys.stderr)
        return 2
    evts = json.loads(chemin.read_text())
    dossier = Path(args.dossier)
    dossier.mkdir(parents=True, exist_ok=True)

    print(f"\n  {len(evts)} sociétés à récupérer\n")
    ok, absents, courts, decales = 0, [], [], []
    ecarts = []
    for n, e in enumerate(evts, 1):
        t = e["ticker"]
        cible = dossier / f"{t}_1d_real.json"
        if cible.exists():
            ok += 1
            continue
        try:
            brut = _get(f"https://query1.finance.yahoo.com/v8/finance/chart/"
                        f"{t}?range=5y&interval=1d")
            barres, premiere = bougies(brut, t)
        except Exception:
            absents.append(t)
            continue

        if len(barres) < args.min_bougies:
            courts.append(t)
            continue
        if premiere is not None:
            ecart = abs(premiere - e["introduction_ms"]) / JOUR_MS
            ecarts.append(ecart)
            if ecart > args.ecart_max:
                decales.append((t, round(ecart)))
                continue
        cible.write_text(json.dumps(barres))
        ok += 1
        print(f"    {n}/{len(evts)}  {t:<6} {len(barres):>5} séances",
              end="\r", flush=True)
        time.sleep(0.25)

    print(f"\n\n  {ok} séries écrites dans {dossier}/")
    if absents:
        print(f"\n  {len(absents)} introuvables chez Yahoo — radiées, "
              "renommées, ou jamais indexées :")
        print(f"    {', '.join(absents[:20])}"
              + (f" … et {len(absents) - 20} autres" if len(absents) > 20 else ""))
        print("  Ces disparues ne sont pas au hasard : ce sont les échecs, et")
        print("  leur nombre borne la portée de tout ce qui suivra.")
    if courts:
        print(f"\n  {len(courts)} sous {args.min_bougies} séances "
              "(pré-enregistré) : "
              f"{', '.join(courts[:15])}")
    if decales:
        print(f"\n  {len(decales)} écartées pour DÉSACCORD DE DATE entre "
              "Nasdaq et Yahoo :")
        for t, j in decales[:12]:
            print(f"    {t:<6} {j} jours d'écart")
    if ecarts:
        ecarts.sort()
        median = ecarts[len(ecarts) // 2]
        print(f"\n  Vérification croisée des dates : écart médian "
              f"{median:.1f} jour(s)")
        if median > args.ecart_max:
            print("  ----> ALERTE. Un écart médian élevé ne se rattrape pas "
                  "événement par\n        événement : il signifie que les deux "
                  "sources ne parlent pas de\n        la même date, et que "
                  "TOUTE la campagne serait décalée.")
        else:
            print("  Les deux sources s'accordent. La fenêtre J-7/J-1 porte "
                  "bien sur\n  les jours qu'on croit.")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
