"""Lance les baselines et publie leurs chiffres.

    python -m trading_desk.backtest --source hyperliquid --asset BTC --days 365
    python -m trading_desk.backtest --source store --db desk.db
    python -m trading_desk.backtest --source synthetic     # test moteur seulement

Le resultat est ecrit dans `baselines/<actif>_<intervalle>.json` : c'est la
reference figee du P2, celle que le desk multi-agents devra battre au P5.
"""

from __future__ import annotations

import argparse
import json
import sys
from decimal import Decimal
from pathlib import Path

from ..features.bars import Bar
from .costs import FRICTIONLESS, CostModel
from .data import DataUnavailable, fetch_hyperliquid, load_from_store, load_synthetic
from .engine import benchmark_buy_and_hold, run_backtest
from .report import compute_metrics, format_report
from .strategies import BASELINES


def _load(args: argparse.Namespace) -> list[Bar]:
    if args.source == "hyperliquid":
        return fetch_hyperliquid(args.asset, args.interval, args.days,
                                 testnet=args.testnet, cache_dir=args.cache)
    if args.source == "store":
        return load_from_store(args.db, args.asset, args.interval)
    return load_synthetic(args.asset, args.interval, count=args.bars)


def main() -> int:
    p = argparse.ArgumentParser(description="Baselines sans IA — porte P2")
    p.add_argument("--source", choices=["hyperliquid", "store", "synthetic"],
                   default="hyperliquid")
    p.add_argument("--asset", default="BTC")
    p.add_argument("--interval", default="1h",
                   choices=["1m", "5m", "15m", "1h", "4h", "1d"])
    p.add_argument("--days", type=int, default=365)
    p.add_argument("--bars", type=int, default=1500, help="source synthetic")
    p.add_argument("--db", default="desk.db", help="source store")
    p.add_argument("--cache", default=".cache")
    p.add_argument("--testnet", action="store_true")
    p.add_argument("--equity", type=float, default=1000.0)
    p.add_argument("--funding-bps", type=float, default=1.0,
                   help="funding horaire moyen paye par les longs, en bps. "
                        "Hypothese forte : tester 0 et 2 pour voir si la "
                        "conclusion tient.")
    p.add_argument("--out", default="baselines")
    args = p.parse_args()

    try:
        bars = _load(args)
    except DataUnavailable as exc:
        print(f"\n  Données indisponibles : {exc}\n", file=sys.stderr)
        return 2

    if len(bars) < 200:
        print(f"\n  Seulement {len(bars)} barres : trop peu pour une baseline "
              "crédible. Augmenter --days.\n", file=sys.stderr)
        return 2

    if args.source == "synthetic":
        print("\n  ATTENTION — barres synthétiques. Ces chiffres valident le "
              "moteur,\n  ils ne disent RIEN de la rentabilité d'une stratégie.")

    costs = CostModel(funding_bps_per_hour=Decimal(str(args.funding_bps)))
    metrics = []
    payload = {}

    # Reference « detenir l'actif », hors moteur de strategies : sans stop et
    # sans dimensionnement par le risque, sinon ce n'est plus un buy and hold.
    bh = benchmark_buy_and_hold(bars, costs=costs,
                                initial_equity_usd=Decimal(str(args.equity)),
                                interval=args.interval)
    bh_gross = benchmark_buy_and_hold(bars, costs=FRICTIONLESS,
                                      initial_equity_usd=Decimal(str(args.equity)),
                                      interval=args.interval)
    bh_metrics = compute_metrics(bh)
    metrics.append(bh_metrics)
    payload["buy_and_hold"] = {
        "metrics": bh_metrics.model_dump(mode="json"),
        "pnl_sans_couts_usd": str(bh_gross.net_pnl_usd),
        "trades": [t.model_dump(mode="json") for t in bh.trades],
    }

    for name, cls in BASELINES.items():
        result = run_backtest(
            bars, cls(), costs=costs,
            initial_equity_usd=Decimal(str(args.equity)),
            interval=args.interval,
        )
        m = compute_metrics(result)
        metrics.append(m)

        # Le meme run sans aucun cout : l'ecart mesure exactement ce que les
        # frais et le funding retirent a la strategie.
        gross_run = run_backtest(
            bars, cls(), costs=FRICTIONLESS,
            initial_equity_usd=Decimal(str(args.equity)),
            interval=args.interval,
        )
        payload[name] = {
            "metrics": m.model_dump(mode="json"),
            "pnl_sans_couts_usd": str(gross_run.net_pnl_usd),
            "trades": [t.model_dump(mode="json") for t in result.trades[:200]],
        }

    print(format_report(metrics))

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    dest = out / f"{args.asset}_{args.interval}_{args.source}.json"
    dest.write_text(json.dumps({
        "source": args.source,
        "asset": args.asset,
        "interval": args.interval,
        "bars": len(bars),
        "start_ts_ms": bars[0].ts_ms,
        "end_ts_ms": bars[-1].ts_ms,
        "initial_equity_usd": args.equity,
        "costs": costs.model_dump(mode="json"),
        "baselines": payload,
    }, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"  Référence écrite : {dest}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
