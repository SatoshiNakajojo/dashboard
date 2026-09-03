"""Persistance. Le journal de decisions est append-only, par construction."""

from .sqlite_store import SCHEMA, SqliteStore, Store

__all__ = ["SCHEMA", "SqliteStore", "Store"]
