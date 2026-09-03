"""Supervision : API JSON, flux SSE, interface, kill switch."""

from .server import create_app
from .state import DeskState, demo_account

__all__ = ["DeskState", "create_app", "demo_account"]
