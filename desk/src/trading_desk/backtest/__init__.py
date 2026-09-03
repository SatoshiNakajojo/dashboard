"""Backtest evenementiel. Reutilise le moteur de risque du live, tel quel."""

from .costs import FRICTIONLESS, CostModel
from .data import DataUnavailable, fetch_hyperliquid, load_from_store, load_synthetic
from .engine import (
    BacktestResult, BacktestTrade, benchmark_buy_and_hold, run_backtest,
)
from .report import Metrics, compute_metrics, format_report
from .strategies import BASELINES, EmaCross, RsiReversion, Signal, Strategy

__all__ = [
    "BASELINES", "FRICTIONLESS", "BacktestResult", "BacktestTrade",
    "CostModel", "DataUnavailable", "EmaCross", "Metrics", "RsiReversion",
    "Signal", "Strategy", "benchmark_buy_and_hold", "compute_metrics", "fetch_hyperliquid", "format_report",
    "load_from_store", "load_synthetic", "run_backtest",
]
