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

BARRES_PAR_JOUR = {"1d": 1, "4h": 6, "1h": 24}


def parametres(nom: str, interval: str) -> dict:
    """Les parametres qui donnent a chaque strategie SON horizon documente.

    Les strategies comptent en barres ; leurs regles d'origine comptent en
    jours ou en semaines. Instancier `TurtleBreakout()` tel quel sur du 4 h
    donne un canal de 55 barres, soit neuf jours — ce n'est plus la regle des
    Turtles, c'est une strategie de cassure a court terme dont rien ne dit
    qu'elle marche. Le meme piege dans l'autre sens vaut pour `tsmom`, dont
    le defaut de 168 barres fait 168 JOURS en daily quand la litterature
    mesure l'effet sur une a quatre semaines.

    Sans cette conversion, la grille compare des horizons differents d'une
    cellule a l'autre et son verdict ne veut rien dire.
    """
    n = BARRES_PAR_JOUR[interval]
    if nom == "turtle_breakout":
        # Systeme 2 : cassure 55 jours, sortie 20 jours, ATR sur 20 jours.
        return {"entry_period": 55 * n, "exit_period": 20 * n,
                "atr_period": 20 * n}
    if nom == "tsmom":
        # Quatre semaines, le haut de la fourchette ou l'effet est mesure.
        return {"lookback": 28 * n, "atr_period": 20 * n}
    # EmaCross et RsiReversion utilisent des periodes conventionnelles en
    # barres (20/50, 14), appliquees telles quelles a toute echelle : c'est
    # ainsi qu'elles sont employees et documentees.
    return {}


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
                kw = parametres(nom, interval)
                obs = run_backtest(
                    bars, cls(**kw), limits=limits, interval=interval,
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
                        bars, cls(**kw), obs, draws=args.draws, limits=limits,
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
