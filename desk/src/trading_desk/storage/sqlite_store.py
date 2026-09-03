"""Persistance locale sur SQLite.

Le P0 doit tourner sur un portable sans rien installer. SQLite le permet ;
Postgres + TimescaleDB reste la cible pour le VPS (voir `sql/001_schema.sql`,
meme decoupage de tables). Les deux implementations respectent le meme
protocole `Store`, de sorte que le reste du code ne sait pas laquelle il
utilise.

Table centrale : `decision_journal`. Elle est en **append-only** et porte, pour
chaque decision, le prompt complet, l'identifiant exact du modele, les sorties
intermediaires et l'etat de marche horodate. C'est la parade a l'angle mort
A-12 : quand une decision coute de l'argent, il faut pouvoir repondre a
"pourquoi", des mois plus tard.
"""

from __future__ import annotations

import json
import sqlite3
import threading
from decimal import Decimal
from pathlib import Path
from typing import Any, Protocol

from ..contracts.common import now_ms
from ..contracts.market import BookSnapshot, MarkPrice, Trade
from ..contracts.orders import Fill

SCHEMA = """
CREATE TABLE IF NOT EXISTS trades (
    ts_ms   INTEGER NOT NULL,
    asset   TEXT    NOT NULL,
    price   TEXT    NOT NULL,
    size    TEXT    NOT NULL,
    is_buy  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trades_asset_ts ON trades(asset, ts_ms);

CREATE TABLE IF NOT EXISTS book_samples (
    ts_ms       INTEGER NOT NULL,
    asset       TEXT    NOT NULL,
    best_bid    TEXT,
    best_ask    TEXT,
    spread_bps  TEXT,
    imbalance   TEXT,
    bid_depth   TEXT,
    ask_depth   TEXT
);
CREATE INDEX IF NOT EXISTS idx_book_asset_ts ON book_samples(asset, ts_ms);

CREATE TABLE IF NOT EXISTS marks (
    ts_ms            INTEGER NOT NULL,
    asset            TEXT    NOT NULL,
    mark             TEXT    NOT NULL,
    oracle           TEXT,
    funding_rate_bps TEXT,
    open_interest    TEXT
);
CREATE INDEX IF NOT EXISTS idx_marks_asset_ts ON marks(asset, ts_ms);

-- Append-only. Aucun UPDATE ni DELETE n'est emis sur cette table par le code.
CREATE TABLE IF NOT EXISTS decision_journal (
    journal_ref TEXT PRIMARY KEY,
    ts_ms       INTEGER NOT NULL,
    kind        TEXT    NOT NULL,
    mandate_id  TEXT,
    payload     TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_journal_ts ON decision_journal(ts_ms);

CREATE TABLE IF NOT EXISTS mandates (
    mandate_id  TEXT PRIMARY KEY,
    ts_ms       INTEGER NOT NULL,
    payload     TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS fills (
    fill_id  TEXT PRIMARY KEY,
    ts_ms    INTEGER NOT NULL,
    cloid    TEXT,
    asset    TEXT    NOT NULL,
    side     TEXT    NOT NULL,
    size     TEXT    NOT NULL,
    price    TEXT    NOT NULL,
    fee_usd  TEXT    NOT NULL,
    is_maker INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fills_ts ON fills(ts_ms);

CREATE TABLE IF NOT EXISTS halts (
    ts_ms  INTEGER NOT NULL,
    reason TEXT    NOT NULL,
    detail TEXT
);
"""


class Store(Protocol):
    def write_trade(self, t: Trade) -> None: ...
    def write_book(self, b: BookSnapshot) -> None: ...
    def write_mark(self, m: MarkPrice) -> None: ...
    def write_fill(self, f: Fill) -> None: ...
    def journal(self, kind: str, payload: dict[str, Any], mandate_id: str | None) -> str: ...
    def recent_journal(self, limit: int) -> list[dict[str, Any]]: ...


def _s(v: Decimal | None) -> str | None:
    return format(v, "f") if v is not None else None


class SqliteStore:
    """Store synchrone protege par un verrou.

    Le debit vise (quelques centaines d'ecritures/seconde) reste tres en deca
    de ce que SQLite encaisse en WAL. Passer a Postgres quand on multiplie les
    actifs, pas avant.
    """

    def __init__(self, path: str | Path = "desk.db") -> None:
        self.path = str(path)
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(self.path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        # WAL : les lectures de l'interface de supervision ne bloquent pas
        # l'ingestion, et inversement.
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._conn.executescript(SCHEMA)
        self._conn.commit()
        self._seq = 0

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    # ------------------------------------------------------------- ecritures

    def write_trade(self, t: Trade) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT INTO trades (ts_ms, asset, price, size, is_buy) VALUES (?,?,?,?,?)",
                (t.ts_ms, t.asset, _s(t.price), _s(t.size), int(t.is_buy)),
            )

    def write_book(self, b: BookSnapshot) -> None:
        """On echantillonne des agregats, pas le carnet complet.

        Conserver chaque niveau de chaque snapshot fait exploser le volume pour
        une valeur analytique faible : ce qui sert en aval, ce sont le spread,
        le desequilibre et la profondeur.
        """
        with self._lock:
            self._conn.execute(
                "INSERT INTO book_samples "
                "(ts_ms, asset, best_bid, best_ask, spread_bps, imbalance, bid_depth, ask_depth) "
                "VALUES (?,?,?,?,?,?,?,?)",
                (
                    b.ts_ms, b.asset, _s(b.best_bid), _s(b.best_ask),
                    _s(b.spread_bps), _s(b.imbalance()),
                    _s(b.depth_usd("bid")), _s(b.depth_usd("ask")),
                ),
            )

    def write_mark(self, m: MarkPrice) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT INTO marks (ts_ms, asset, mark, oracle, funding_rate_bps, open_interest) "
                "VALUES (?,?,?,?,?,?)",
                (m.ts_ms, m.asset, _s(m.mark), _s(m.oracle),
                 _s(m.funding_rate_bps), _s(m.open_interest_usd)),
            )

    def write_fill(self, f: Fill) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT OR IGNORE INTO fills "
                "(fill_id, ts_ms, cloid, asset, side, size, price, fee_usd, is_maker) "
                "VALUES (?,?,?,?,?,?,?,?,?)",
                (f.fill_id, f.ts_ms, f.cloid, f.asset, f.side.value,
                 _s(f.size), _s(f.price), _s(f.fee_usd), int(f.is_maker)),
            )
            self._conn.commit()

    def journal(
        self, kind: str, payload: dict[str, Any], mandate_id: str | None = None
    ) -> str:
        """Ecrit une entree et renvoie sa reference.

        C'est cette reference que porte le champ `journal_ref` des mandats et
        des sorties d'agents : le mandat reste petit, le raisonnement reste
        retrouvable.
        """
        with self._lock:
            self._seq += 1
            ref = f"jr_{now_ms()}_{self._seq:04d}"
            self._conn.execute(
                "INSERT INTO decision_journal (journal_ref, ts_ms, kind, mandate_id, payload) "
                "VALUES (?,?,?,?,?)",
                (ref, now_ms(), kind, mandate_id,
                 json.dumps(payload, default=str, ensure_ascii=False)),
            )
            self._conn.commit()
            return ref

    def write_mandate(self, mandate_id: str, payload: dict[str, Any]) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT OR REPLACE INTO mandates (mandate_id, ts_ms, payload) VALUES (?,?,?)",
                (mandate_id, now_ms(), json.dumps(payload, default=str, ensure_ascii=False)),
            )
            self._conn.commit()

    def write_halt(self, reason: str, detail: str = "") -> None:
        with self._lock:
            self._conn.execute(
                "INSERT INTO halts (ts_ms, reason, detail) VALUES (?,?,?)",
                (now_ms(), reason, detail),
            )
            self._conn.commit()

    def commit(self) -> None:
        with self._lock:
            self._conn.commit()

    # -------------------------------------------------------------- lectures

    def recent_journal(self, limit: int = 50) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT journal_ref, ts_ms, kind, mandate_id, payload "
                "FROM decision_journal ORDER BY ts_ms DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [
            {
                "journal_ref": r["journal_ref"],
                "ts_ms": r["ts_ms"],
                "kind": r["kind"],
                "mandate_id": r["mandate_id"],
                "payload": json.loads(r["payload"]),
            }
            for r in rows
        ]

    def counts(self) -> dict[str, int]:
        with self._lock:
            out = {}
            for table in ("trades", "book_samples", "marks", "fills", "decision_journal"):
                out[table] = self._conn.execute(
                    f"SELECT COUNT(*) AS n FROM {table}"  # noqa: S608 - liste fermee
                ).fetchone()["n"]
            return out

    def last_prices(self) -> dict[str, str]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT asset, price FROM trades t WHERE ts_ms = "
                "(SELECT MAX(ts_ms) FROM trades WHERE asset = t.asset) GROUP BY asset"
            ).fetchall()
        return {r["asset"]: r["price"] for r in rows}
