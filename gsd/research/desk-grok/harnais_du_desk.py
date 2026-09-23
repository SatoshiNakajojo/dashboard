#!/usr/bin/env python3
"""
Fait tourner le harnais de backtest DU DESK sur les 208 jours de bougies 1h :
`hl_common.run_portfolio`, `compute_metrics` et `verdict_v2`, avec ses propres
indicateurs (`atr_series` en moyenne simple, `ema_series`) et le `check_exit` de
ses scripts paper — tel quel, puis corrigé.

Ce n'est plus une reconstitution : c'est le code du desk, alimenté par les
mêmes données. Ses fichiers sont passés en argument, pas commités : ce dépôt
est public.

    PYTHONPATH=<pandas> python3 harnais_du_desk.py --cache /chemin/cache --desk /dossier/du/desk
      (le dossier contient hl_common.py, paper_supertrend_live.py,
       paper_donchian_live.py et paper_supertrend_live_corrige.py)
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from dataclasses import dataclass
from pathlib import Path

import pandas as pd


@dataclass
class Trade:
    ticker: str
    side: str
    exit_ts: int
    pnl: float
    R: float
    exit_reason: str
    hors_barre: bool


def charger(chemin: Path, nom: str):
    sys.path.insert(0, str(chemin.parent))
    spec = importlib.util.spec_from_file_location(nom, chemin)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def frames_du_cache(cache: Path, tickers):
    out = {}
    for t in tickers:
        raw = json.loads((cache / f"c_{t}_1h.json").read_text())
        out[t] = pd.DataFrame([{
            "ts": int(c["t"]), "open": float(c["o"]), "high": float(c["h"]),
            "low": float(c["l"]), "close": float(c["c"]), "volume": float(c["v"]),
            "n_trades": int(c.get("n", 0)),
        } for c in raw])
    return out


def simulateur(hl, check_exit, entree):
    """`simulate_fn` au format attendu par hl_common.run_portfolio."""
    def sim(df, i, side, ticker, equity):
        row = df.iloc[i]
        e = entree(row, side)
        if e is None:
            return None
        entry, stop, risk_dist = e
        pos = {"side": side, "entry": entry, "stop_cur": stop, "stop_init": stop,
               "risk_dist": risk_dist, "bars_held": 0, "be_armed": False}
        for j in range(i + 1, len(df)):
            bar = df.iloc[j]
            r = check_exit(pos, bar)
            if r and r.get("event") == "exit":
                px = float(r["exit_px"])
                risque = hl.RISK_PCT * equity
                qty = risque / risk_dist
                brut = qty * ((px - entry) if side == "long" else (entry - px))
                pnl = brut - hl.fee(qty * entry) - hl.fee(qty * px)
                hors = px > float(bar["high"]) + 1e-9 or px < float(bar["low"]) - 1e-9
                return Trade(ticker, side, int(bar["ts"]), pnl, pnl / risque, r["reason"], hors)
        return None
    return sim


def evenements(frames, tickers):
    ev = []
    for prio, t in enumerate(tickers):
        df = frames[t]
        for i in range(len(df)):
            if bool(df["sig_long"].iloc[i]):
                ev.append((int(df["ts"].iloc[i]), prio, t, i, "long"))
            elif bool(df["sig_short"].iloc[i]):
                ev.append((int(df["ts"].iloc[i]), prio, t, i, "short"))
    return ev


def rejouer(hl, frames, add_features, check_exit, entree, label):
    feats = {t: add_features(frames[t]) for t in hl.TICKERS}
    trades, eq = hl.run_portfolio(evenements(feats, hl.TICKERS), feats, simulateur(hl, check_exit, entree))
    tdf = pd.DataFrame([t.__dict__ for t in trades])
    jours = (int(feats["BTC"]["ts"].iloc[-1]) - int(feats["BTC"]["ts"].iloc[0])) / 86_400_000
    m = hl.compute_metrics(tdf, eq, jours, label)
    verdict, _ = hl.verdict_v2(m)
    hors = int(tdf["hors_barre"].sum()) if len(tdf) else 0
    return m, verdict, hors


def ligne(m, verdict, hors):
    return (f"n={m['n_trades']:>4}  réussite {m['winrate']*100:5.1f} %  E[R] {m['expectancy_R']:+.3f}  "
            f"PF {m['profit_factor_raw']:.2f}  maxDD {m['max_dd_equity']*100:+.1f} %  "
            f"→ {verdict:<16} sorties hors barre : {hors}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path)
    ap.add_argument("--desk", required=True, type=Path)
    args = ap.parse_args()

    hl = charger(args.desk / "hl_common.py", "hl_common")
    sys.modules["hl_common"] = hl
    st = charger(args.desk / "paper_supertrend_live.py", "st_desk")
    st_fix = charger(args.desk / "paper_supertrend_live_corrige.py", "st_corrige")
    dn = charger(args.desk / "paper_donchian_live.py", "dn_desk")
    frames = frames_du_cache(args.cache, hl.TICKERS)

    def entree_st(row, side):
        entry, stop = float(row["close"]), float(row["st"])
        rd = entry - stop if side == "long" else stop - entry
        if not rd > 0 or rd / entry < hl.MIN_STOP_PCT:
            return None
        return entry, stop, rd

    def entree_dn(row, side):
        e = dn.evaluate_entry(row, "X")
        if e is None or e["side"] != side:
            return None
        return e["entry"], e["stop_init"], e["risk_dist"]

    debut = pd.to_datetime(int(frames["BTC"]["ts"].iloc[0]), unit="ms").strftime("%d/%m/%Y")
    fin = pd.to_datetime(int(frames["BTC"]["ts"].iloc[-1]), unit="ms").strftime("%d/%m/%Y")
    print(f"harnais du desk (run_portfolio · compute_metrics · verdict_v2) — {debut} → {fin}")
    print()
    print("SUPERTREND V3-1B            déclaré : n=120  réussite 55,8 %  E[R] +0,222  PF 1,92")
    print("  ton ATR (moyenne simple), check_exit tel quel   ",
          ligne(*rejouer(hl, frames, st.add_features, st.check_exit, entree_st, "st")))
    print("  ton ATR (moyenne simple), check_exit corrigé    ",
          ligne(*rejouer(hl, frames, st.add_features, st_fix.check_exit, entree_st, "st_fix")))

    atr_simple = hl.atr_series

    def atr_wilder(df, n):
        prev = df["close"].shift(1)
        tr = pd.concat([df["high"] - df["low"], (df["high"] - prev).abs(), (df["low"] - prev).abs()], axis=1).max(axis=1)
        return tr.ewm(alpha=1 / n, adjust=False).mean()

    st.atr_series = atr_wilder
    print("  ATR de Wilder, check_exit tel quel              ",
          ligne(*rejouer(hl, frames, st.add_features, st.check_exit, entree_st, "st_wilder")))
    st.atr_series = atr_simple

    print()
    print("DONCHIAN B′                 déclaré : n=193  réussite 29 %    E[R] +0,106  PF 1,24")
    print("  ton code, tel quel                              ",
          ligne(*rejouer(hl, frames, dn.add_features, dn.check_exit, entree_dn, "dn")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
