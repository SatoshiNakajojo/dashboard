"""Backtest evenementiel. Reutilise le moteur de risque du live, tel quel."""

from .costs import FRICTIONLESS, CostModel
from .data import (
    DataUnavailable, fetch_hyperliquid, load_from_file, load_from_store,
    load_synthetic,
)
from .engine import (
    BacktestResult, BacktestTrade, benchmark_buy_and_hold, run_backtest,
)
from .null_model import (
    NullResult, format_null_report, randomization_test,
)
from .report import Metrics, compute_metrics, format_report
from .strategies import BASELINES, EmaCross, RsiReversion, Signal, Strategy

__all__ = [
    "BASELINES", "FRICTIONLESS", "BacktestResult", "BacktestTrade",
    "CostModel", "DataUnavailable", "EmaCross", "Metrics", "NullResult",
    "RsiReversion", "Signal", "Strategy", "benchmark_buy_and_hold",
    "compute_metrics", "fetch_hyperliquid", "format_null_report",
    "format_report", "load_from_file", "load_from_store", "load_synthetic",
    "randomization_test", "run_backtest",
]
