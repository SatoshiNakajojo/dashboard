-- Schema PostgreSQL + TimescaleDB, cible pour le VPS.
-- Le decoupage des tables est identique a celui de la version SQLite
-- (src/trading_desk/storage/sqlite_store.py) : le code applicatif ne sait pas
-- laquelle des deux il utilise.

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ---------------------------------------------------------------- marche ---

CREATE TABLE IF NOT EXISTS trades (
    ts       TIMESTAMPTZ      NOT NULL,
    asset    TEXT             NOT NULL,
    price    NUMERIC(38, 12)  NOT NULL,
    size     NUMERIC(38, 12)  NOT NULL,
    is_buy   BOOLEAN          NOT NULL
);
SELECT create_hypertable('trades', 'ts', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_trades_asset_ts ON trades (asset, ts DESC);

-- On persiste des agregats de carnet, pas chaque niveau de chaque snapshot :
-- ce qui sert en aval, c'est le spread, le desequilibre et la profondeur.
CREATE TABLE IF NOT EXISTS book_samples (
    ts          TIMESTAMPTZ     NOT NULL,
    asset       TEXT            NOT NULL,
    best_bid    NUMERIC(38, 12),
    best_ask    NUMERIC(38, 12),
    spread_bps  NUMERIC(18, 6),
    imbalance   NUMERIC(18, 6),
    bid_depth   NUMERIC(38, 12),
    ask_depth   NUMERIC(38, 12)
);
SELECT create_hypertable('book_samples', 'ts', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_book_asset_ts ON book_samples (asset, ts DESC);

CREATE TABLE IF NOT EXISTS marks (
    ts               TIMESTAMPTZ     NOT NULL,
    asset            TEXT            NOT NULL,
    mark             NUMERIC(38, 12) NOT NULL,
    oracle           NUMERIC(38, 12),
    funding_rate_bps NUMERIC(18, 6),
    open_interest    NUMERIC(38, 12)
);
SELECT create_hypertable('marks', 'ts', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_marks_asset_ts ON marks (asset, ts DESC);

-- Retention : les trades bruts servent surtout au rejeu recent ; les
-- agregats, eux, doivent survivre. A ajuster selon l'espace disque du VPS.
SELECT add_retention_policy('trades', INTERVAL '90 days', if_not_exists => TRUE);
SELECT add_retention_policy('book_samples', INTERVAL '180 days', if_not_exists => TRUE);

-- --------------------------------------------------------------- decision ---

-- Append-only. Aucun UPDATE ni DELETE n'est emis par le code applicatif.
-- C'est la table qui permet de repondre a "pourquoi cette decision", des mois
-- plus tard : prompts complets, version exacte du modele, sorties de chaque
-- agent, etat de marche horodate.
CREATE TABLE IF NOT EXISTS decision_journal (
    journal_ref TEXT        PRIMARY KEY,
    ts          TIMESTAMPTZ NOT NULL,
    kind        TEXT        NOT NULL,
    mandate_id  TEXT,
    payload     JSONB       NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_journal_ts ON decision_journal (ts DESC);
CREATE INDEX IF NOT EXISTS idx_journal_mandate ON decision_journal (mandate_id);

REVOKE UPDATE, DELETE ON decision_journal FROM PUBLIC;

CREATE TABLE IF NOT EXISTS mandates (
    mandate_id TEXT        PRIMARY KEY,
    ts         TIMESTAMPTZ NOT NULL,
    payload    JSONB       NOT NULL
);

-- ------------------------------------------------------------- execution ---

-- Un fill est un evenement fiscal. Cette table doit pouvoir etre exportee
-- telle quelle, des le premier trade : reconstruire douze mois a posteriori
-- depuis des logs partiels est un cauchemar (angle mort A-15).
CREATE TABLE IF NOT EXISTS fills (
    fill_id  TEXT            PRIMARY KEY,
    ts       TIMESTAMPTZ     NOT NULL,
    cloid    TEXT,
    asset    TEXT            NOT NULL,
    side     TEXT            NOT NULL,
    size     NUMERIC(38, 12) NOT NULL,
    price    NUMERIC(38, 12) NOT NULL,
    fee_usd  NUMERIC(38, 12) NOT NULL,
    is_maker BOOLEAN         NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fills_ts ON fills (ts DESC);

CREATE TABLE IF NOT EXISTS halts (
    ts     TIMESTAMPTZ NOT NULL,
    reason TEXT        NOT NULL,
    detail TEXT
);
CREATE INDEX IF NOT EXISTS idx_halts_ts ON halts (ts DESC);
