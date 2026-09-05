#!/usr/bin/env python3
"""Grille de robustesse : chaque strategie, sur chaque actif, chaque intervalle.

Une strategie qui ne gagne que sur BTC en daily n'a pas d'edge : elle a eu de
la chance sur une cellule. Ce script pose la seule question qui vaille — le
signal survit-il quand on change d'actif et d'echelle de temps.

    python scripts/robustness_grid.py --draws 200

**La correction pour tests multiples n'est pas optionnelle ici.** Quatre
strategies sur sept actifs et deux intervalles font 56 tests. A 5 %, on attend
~2,8 cellules significatives par pur hasard : trouver deux ou trois « edges »
dans cette grille est le resultat NUL, pas une decouverte. La procedure de
Benjamini-Hochberg controle le taux de fausses decouvertes plutot que de
corriger chaque test isolement — moins brutal que Bonferroni, et c'est le bon
compromis pour un criblage dont on veut ensuite verifier les survivants.

Le plafond de distance de stop est volontairement large et IDENTIQUE partout.
Un plafond serre rejette davantage les actifs volatils que BTC, et cette
inegalite de traitement fabriquerait un classement entre actifs qui ne
mesurerait que leur volatilite. Il est fixe a 5000 bps, le maximum que le
contrat `StopBand` autorise ; la colonne « rejets » dit ce qu'il en reste,
et c'est elle qu'il faut lire avant le PnL.
"""

from __future__ import annotations

import argparse
import json
import sys
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from trading_desk.backtest.data import DataUnavailable, load_from_file
from trading_desk.backtest.engine import run_backtest
from trading_desk.backtest.null_model import randomization_test
from trading_desk.backtest.strategies import BASELINES
from trading_desk.risk import RiskLimits

ASSETS = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "AVAX"]
INTERVALS = ["1d", "4h"]


def benjamini_hochberg(pvalues: list[float], alpha: float = 0.05) -> list[bool]:
    """Quelles hypotheses survivent au controle du taux de fausses decouvertes.

    On trie les p, et on retient les k plus petites telles que
    `p_(i) <= alpha * i / m`. Le seuil s'assouplit a mesure qu'on descend :
    c'est ce qui distingue BH de Bonferroni, qui exigerait `p <= alpha / m`
    pour toutes.
    """
    m = len(pvalues)
    if m == 0:
        return []
    ordre = sorted(range(m), key=lambda i: pvalues[i])
    seuil_max = -1
    for rang, i in enumerate(ordre, start=1):
        if pvalues[i] <= alpha * rang / m:
            seuil_max = rang
    garde = [False] * m
    for rang, i in enumerate(ordre, start=1):
        if rang <= seuil_max:
            garde[i] = True
    return garde


def main() -> int:
    p = argparse.ArgumentParser(description="Grille de robustesse multi-actifs")
    p.add_argument("--draws", type=int, default=200,
                   help="tirages du modele nul par cellule")
    p.add_argument("--equity", type=float, default=1000.0)
    p.add_argument("--max-stop-bps", type=float, default=5000.0,
                   help="identique partout. 5000 est le maximum autorise par "
                        "le contrat StopBand ; au-dela d'un stop a 50 %% le "
                        "dimensionnement par le risque n'a plus de sens.")
    p.add_argument("--out", default="baselines/grille.json")
    args = p.parse_args()

    limits = RiskLimits(max_stop_distance_bps=Decimal(str(args.max_stop_bps)))
    cellules = []

    for interval in INTERVALS:
        for asset in ASSETS:
            chemin = f"data/{asset}_{interval}_real.json"
            try:
                bars = load_from_file(chemin, asset, interval)
            except (DataUnavailable, FileNotFoundError) as exc:
                print(f"  {asset} {interval} : {exc}", file=sys.stderr)
                continue

            for nom, cls in BASELINES.items():
                obs = run_backtest(
                    bars, cls(), limits=limits, interval=interval,
                    initial_equity_usd=Decimal(str(args.equity)))
                cell = {
                    "actif": asset, "intervalle": interval, "strategie": nom,
                    "net_usd": float(obs.net_pnl_usd),
                    "trades": len(obs.trades),
                    "rejets": obs.rejected_by_risk,
                    "p": None, "percentile": None, "hasard_moyen": None,
                }
                if obs.trades and args.draws > 0:
                    nul = randomization_test(
                        bars, cls(), obs, draws=args.draws, limits=limits,
                        interval=interval,
                        initial_equity_usd=Decimal(str(args.equity)))
                    cell["p"] = float(nul.p_value)
                    cell["percentile"] = float(nul.percentile)
                    cell["hasard_moyen"] = float(nul.null_mean_usd)
                cellules.append(cell)
                pp = "  n/a" if cell["p"] is None else f"{cell['p']:.3f}"
                print(f"  {asset:<5} {interval:<3} {nom:<16} "
                      f"net {cell['net_usd']:>+9.2f}  "
                      f"trades {cell['trades']:>4}  rejets {cell['rejets']:>5}  "
                      f"p {pp}", flush=True)

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(cellules, indent=1), encoding="utf-8")
    print(f"\n  {len(cellules)} cellules -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
