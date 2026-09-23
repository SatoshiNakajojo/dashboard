#!/usr/bin/env python3
"""
Banc d'essai : fait tourner le logger paper du desk — l'original et le corrigé —
exactement comme la routine le ferait, passage par passage, sur l'historique.

- Horloge simulée. À chaque passage, l'API simulée rend les bougies 1h closes
  ET la bougie en cours, comme Hyperliquid. La bougie en cours est reconstituée
  à partir du premier quart d'heure de l'heure (bougies 15 min) : les passages
  ont donc lieu à :15 au lieu de :05. Déclaré — le mécanisme est identique.
- L'original tourne toutes les DEUX heures, comme la routine du desk.
  Le corrigé tourne toutes les heures.
- `hl_common` n'a pas été fourni : un substitut minimal est écrit, avec une ATR
  de Wilder — celle qui retrouve le backtest déclaré à la deuxième décimale.

    PYTHONPATH=<pandas> python3 simulation_paper.py --cache /chemin/cache \
        --orig paper_supertrend_live.py --fix paper_supertrend_live.corrige.py

Les deux scripts du desk ne sont pas dans ce dépôt, qui est public : ils sont
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
from pathlib import Path

H = 3_600_000
Q = 900_000
TICKERS = ["BTC", "ETH", "SOL"]
FEE = 0.00035


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


STUB = '''
import json, math
from datetime import datetime, timezone
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
TICKERS = ["BTC", "ETH", "SOL"]
MIN_STOP_PCT = 0.004
MARCHE = None

def fetch_candles(coin, interval, start, end):
    return MARCHE.candles(coin, start, end)

def atr_series(df, n):
    prev = df["close"].shift(1)
    tr = pd.concat([df["high"] - df["low"], (df["high"] - prev).abs(), (df["low"] - prev).abs()], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / n, adjust=False).mean()

def ms_to_iso(ms):
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def write_json(path, obj):
    Path(path).write_text(json.dumps(obj, default=str))
'''


class Horloge:
    def __init__(self, marche):
        self.m = marche

    def time(self):
        return self.m.now_ms / 1000


def charger(script: Path, nom: str, marche: Marche, dossier: Path):
    dossier.mkdir(parents=True, exist_ok=True)
    (dossier / "hl_common.py").write_text(STUB)
    shutil.copy(script, dossier / "paper_supertrend_live.py")
    sys.modules.pop("hl_common", None)
    sys.path.insert(0, str(dossier))
    spec = importlib.util.spec_from_file_location(nom, dossier / "paper_supertrend_live.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    sys.modules["hl_common"].MARCHE = marche
    mod.time = Horloge(marche)
    sys.path.remove(str(dossier))
    return mod


def trades(dossier: Path, marche: Marche):
    barres = {t: {int(c["t"]): c for c in marche.h1[t]} for t in TICKERS}
    evts = [json.loads(l) for l in (dossier / "paper" / "supertrend_signals.jsonl").read_text().splitlines() if l.strip()]
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
            haut, bas = float(b["h"]), float(b["l"])
            out.append({
                "R": (brut - FEE * (ent + px)) / risque,
                "motif": e["exit_reason"],
                "hors_barre": px > haut + 1e-9 or px < bas - 1e-9,
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
            f"E[R] {statistics.fmean(Rs):+.3f}  PF {g/p if p else float('inf'):.2f}  "
            f"sorties hors de la barre : {hors}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path)
    ap.add_argument("--orig", required=True, type=Path)
    ap.add_argument("--fix", required=True, type=Path)
    ap.add_argument("--jours", type=int, default=50)
    args = ap.parse_args()

    marche = Marche(args.cache)
    debut_q = max(min(marche.q[t]) for t in TICKERS)
    fin = min(int(marche.h1[t][-1]["t"]) for t in TICKERS)
    t0 = max((debut_q // H + 1) * H, fin - args.jours * 24 * H)
    heures = list(range(t0, fin, H))

    base = Path(tempfile.mkdtemp(prefix="banc_"))
    orig = charger(args.orig, "paper_origine", marche, base / "origine")
    fix = charger(args.fix, "paper_corrige", marche, base / "corrige")

    erreurs = {"origine": 0, "corrige": 0}
    for h in heures:
        marche.now_ms = h + Q
        if (h // H) % 2 == 0:
            try:
                orig.run_once()
            except Exception as exc:
                erreurs["origine"] += 1
                if erreurs["origine"] < 3:
                    print("origine :", repr(exc))
        try:
            fix.run_once()
        except Exception as exc:
            erreurs["corrige"] += 1
            if erreurs["corrige"] < 3:
                print("corrigé :", repr(exc))

    print(f"fenêtre simulée : {len(heures)} heures ({len(heures)//24} jours) · "
          f"passages en échec : origine {erreurs['origine']}, corrigé {erreurs['corrige']}")
    print()
    print(f"  logger d'origine, toutes les 2 h    {resume(trades(base / 'origine', marche))}")
    print(f"  logger corrigé, toutes les heures   {resume(trades(base / 'corrige', marche))}")
    shutil.rmtree(base, ignore_errors=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
