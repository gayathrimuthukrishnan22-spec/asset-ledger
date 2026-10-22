-- ======================================================
-- File Name : schema-core.sql
-- Purpose   : The two tables that were still living only in
--             server/data-store.json — an asset's Lifecycle Timeline
--             and its year-by-year depreciation schedule. With these,
--             Postgres holds the WHOLE core book (assets + timeline +
--             schedule + asset_transactions ledger) and
--             data-store.json is no longer a source of truth.
--
-- Run with  : psql "$DATABASE_URL" -f schema-core.sql
--             (run AFTER schema.sql, which creates the assets table.)
-- ======================================================

-- ---------- Asset Detail -> Lifecycle Timeline ----------
-- One row per timeline entry. `seq` is the entry's position in the
-- asset's timeline (0 = newest), so the full list round-trips in order.
-- The repo layer deletes an asset's rows before re-inserting them, so
-- there is never a stale tail left behind when a timeline shrinks.
CREATE TABLE IF NOT EXISTS asset_timeline
(
    "assetNumber"  TEXT NOT NULL,
    seq            INTEGER NOT NULL,
    "entryDate"    TEXT NOT NULL,   -- display form, e.g. 'APR 21, 2026'
    title          TEXT NOT NULL,
    description    TEXT NOT NULL DEFAULT '',
    done           SMALLINT NOT NULL DEFAULT 0,
    "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY ("assetNumber", seq)
);

-- ---------- Asset Detail -> Depreciation Schedule ----------
-- One row per schedule YEAR per asset. This is what the Dashboard's
-- Monthly Depreciation Expense chart and the Forecasting roll-forward
-- read, so it needs to be real columnar rows (not a JSON blob) —
-- otherwise every chart refresh means parsing JSON in the app instead
-- of aggregating in SQL.
CREATE TABLE IF NOT EXISTS asset_depreciation_schedule
(
    "assetNumber"        TEXT NOT NULL,
    seq                  INTEGER NOT NULL,   -- 0-based year index
    year                 TEXT NOT NULL,      -- display label, e.g. '2026 (Yr 1)'
    "fiscalYear"         INTEGER NOT NULL,   -- 2026 — the sortable/queryable one
    "openingNbv"         NUMERIC(20,2) NOT NULL DEFAULT 0,
    rate                 NUMERIC(9,4) NOT NULL DEFAULT 0,    -- percent
    depreciation         NUMERIC(20,2) NOT NULL DEFAULT 0,
    "accumDepreciation"  NUMERIC(20,2) NOT NULL DEFAULT 0,
    "closingNbv"         NUMERIC(20,2) NOT NULL DEFAULT 0,
    "updatedAt"          TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY ("assetNumber", seq)
);

-- ---------- Handy view: monthly depreciation straight from SQL ----------
-- Same number the Dashboard computes in TypeScript, available to any
-- SQL client / BI tool. Splits each schedule year evenly across 12
-- months; the app applies the finer in-service-window split.
CREATE OR REPLACE VIEW v_monthly_depreciation AS
SELECT
    "fiscalYear",
    sum(depreciation)                       AS annual_depreciation,
    sum(depreciation) / 12                  AS avg_monthly_depreciation,
    count(DISTINCT "assetNumber")           AS depreciating_assets
FROM asset_depreciation_schedule
WHERE depreciation > 0
GROUP BY "fiscalYear"
ORDER BY "fiscalYear";

-- ======================================================
-- END OF FILE : schema-core.sql
-- ======================================================
