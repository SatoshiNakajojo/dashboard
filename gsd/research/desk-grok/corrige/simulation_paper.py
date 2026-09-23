#!/usr/bin/env python3
"""
Banc d'essai : fait tourner un logger paper du desk — l'original et le corrigé —
exactement comme la routine le ferait, passage par passage, sur l'historique.

- Le VRAI `hl_common.py` du desk est chargé ; seuls `fetch_candles` (l'API) et
  `ROOT` (le dossier d'écriture) sont remplacés. Indicateurs, frais et plancher
  sont donc ceux du desk.
- Horloge simulée. À chaque passage, l'API simulée rend les bougies 1h closes
  ET la bougie en cours, comme Hyperliquid. La bougie en cours est reconstituée
  à partir du premier quart d'heure de l'heure (bougies 15 min) : les passages
  ont donc lieu à :15 au lieu de :05. Déclaré — le mécanisme est identique.
- L'original tourne toutes les DEUX heures, comme la routine du desk. Le corrigé
  tourne toutes les heures ; `--cadence-corrige 2` le fait tourner toutes les
  deux heures pour vérifier qu'il trouve les mêmes trades.

    PYTHONPATH=<pandas> python3 simulation_paper.py --cache /chemin/cache \\
        --hl-common hl_common.py --script paper_supertrend_live.py \\
        --orig <original> --fix <corrigé> --signaux supertrend_signals.jsonl

Les scripts du desk ne sont pas dans ce dépôt, qui est public : ils sont
passés en argument.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import shutil
import statistics
import sys
import tempfile
import time
from pathlib import Path

H = 3_600_000
Q = 900_000
TICKERS = ["BTC", "ETH", "SOL"]
FEE = 0.00035

SURCHARGE = '''

# ---- surcharges du banc d'essai : l'API et le dossier d'écriture ----------
ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
MARCHE = None


def fetch_candles(coin, interval, start_ms, end_ms):
    return MARCHE.candles(coin, start_ms, end_ms)
'''


class Marche:
    """L'API Hyperliquid simulée, avec son horloge."""

    def __init__(self, cache: Path):
        self.now_ms = 0
        self.h1 = {}
        self.q = {}
        for t in TICKERS:
            self.h1[t] = json.loads((cache / f"c_{t}_1h.json").read_text())
            self.q[t] = {int(c["t"]): c for c in json.loads((cache / f"c_{t}_15m.json").read_text())}

    def candles(self, coin, start, end):
        out = [c for c in self.h1[coin] if int(c["t"]) >= start and int(c["t"]) + H <= end]
        heure = (end // H) * H
        q = self.q[coin].get(heure)
        if q is not None and heure >= start and heure + Q <= end:
            # La bougie en cours, telle qu'Hyperliquid la rend à :15.
            out.append({"t": heure, "o": q["o"], "h": q["h"], "l": q["l"],
                        "c": q["c"], "v": q.get("v", "0"), "n": q.get("n", 0)})
        return out


def charger(hl_common: Path, script: Path, nom_script: str, nom: str,
            marche: Marche, dossier: Path):
    dossier.mkdir(parents=True, exist_ok=True)
    (dossier / "hl_common.py").write_text(hl_common.read_text(encoding="utf-8") + SURCHARGE, encoding="utf-8")
    shutil.copy(script, dossier / nom_script)
    sys.modules.pop("hl_common", None)
    sys.path.insert(0, str(dossier))
    spec = importlib.util.spec_from_file_location(nom, dossier / nom_script)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    sys.modules["hl_common"].MARCHE = marche
    sys.path.remove(str(dossier))
    return mod


def trades(dossier: Path, signaux: str, marche: Marche):
    barres = {t: {int(c["t"]): c for c in marche.h1[t]} for t in TICKERS}
    lignes = (dossier / "paper" / signaux).read_text().splitlines()
    evts = [json.loads(ligne) for ligne in lignes if ligne.strip()]
    out, ouvert = [], None
    for e in evts:
        if e["event"] == "entry":
            ouvert = e
        elif e["event"] == "exit" and ouvert is not None:
            L = e["side"] == "long"
            ent, px = float(e["entry"]), float(e["exit"])
            risque = abs(ent - float(ouvert["stop"]))
            brut = (px - ent) if L else (ent - px)
            b = barres[e["ticker"]][int(e["bar_ts"])]
            out.append({
                "R": (brut - FEE * (ent + px)) / risque,
                "motif": e["exit_reason"],
                "hors_barre": px > float(b["h"]) + 1e-9 or px < float(b["l"]) - 1e-9,
            })
            ouvert = None
    return out


def resume(tr):
    if not tr:
        return "aucun trade"
    Rs = [t["R"] for t in tr]
    g, p = sum(x for x in Rs if x > 0), -sum(x for x in Rs if x <= 0)
    hors = sum(1 for t in tr if t["hors_barre"])
    return (f"n={len(Rs):>3}  réussite {sum(1 for x in Rs if x > 0)/len(Rs)*100:5.1f} %  "
            f"E[R] {statistics.fmean(Rs):+.3f}  PF {g/p if p else float('inf'):5.2f}  "
            f"sorties hors de la barre : {hors}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path)
    ap.add_argument("--hl-common", required=True, type=Path)
    ap.add_argument("--script", required=True, help="nom de fichier attendu, ex. paper_donchian_live.py")
    ap.add_argument("--orig", required=True, type=Path)
    ap.add_argument("--fix", required=True, type=Path)
    ap.add_argument("--signaux", required=True, help="ex. donchian_signals.jsonl")
    ap.add_argument("--jours", type=int, default=50)
    ap.add_argument("--cadence-corrige", type=int, default=1, choices=(1, 2))
    args = ap.parse_args()

    marche = Marche(args.cache)
    # Les scripts du desk importent parfois `time` à l'intérieur d'une fonction :
    # seule une horloge remplacée au niveau du module `time` les atteint tous.
    time.time = lambda: marche.now_ms / 1000

    debut_q = max(min(marche.q[t]) for t in TICKERS)
    fin = min(int(marche.h1[t][-1]["t"]) for t in TICKERS)
    t0 = max((debut_q // H + 1) * H, fin - args.jours * 24 * H)
    heures = list(range(t0, fin, H))

    base = Path(tempfile.mkdtemp(prefix="banc_"))
    orig = charger(args.hl_common, args.orig, args.script, "logger_origine", marche, base / "origine")
    fix = charger(args.hl_common, args.fix, args.script, "logger_corrige", marche, base / "corrige")

    erreurs = {"origine": 0, "corrige": 0}
    for h in heures:
        marche.now_ms = h + Q
        pair = (h // H) % 2 == 0
        if pair:
            try:
                orig.run_once()
            except Exception as exc:
                erreurs["origine"] += 1
                if erreurs["origine"] < 3:
                    print("origine :", repr(exc))
        if args.cadence_corrige == 1 or pair:
            try:
                fix.run_once()
            except Exception as exc:
                erreurs["corrige"] += 1
                if erreurs["corrige"] < 3:
                    print("corrigé :", repr(exc))
    # un dernier passage, pour que le corrigé toutes les deux heures rattrape la fin
    marche.now_ms = fin + H + Q
    try:
        fix.run_once()
    except Exception:
        pass

    cad = "toutes les heures" if args.cadence_corrige == 1 else "toutes les 2 h"
    print(f"{args.script} — {len(heures)} heures simulées ({len(heures)//24} jours) · "
          f"passages en échec : origine {erreurs['origine']}, corrigé {erreurs['corrige']}")
    print(f"  logger d'origine, toutes les 2 h   {resume(trades(base / 'origine', args.signaux, marche))}")
    print(f"  logger corrigé, {cad:<17} {resume(trades(base / 'corrige', args.signaux, marche))}")
    shutil.rmtree(base, ignore_errors=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
