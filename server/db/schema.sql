-- ======================================================
-- File Name : schema.sql
-- Purpose   : Postgres (Neon) tables mirroring server/src/data/*.ts
--             shapes exactly, so the repo layer (server/src/db/repo.ts)
--             has a 1:1 mapping. Converted from the original ClickHouse
--             schema — same table/column names, quoted where they're
--             camelCase so Postgres doesn't fold them to lowercase.
-- Run with  : psql "$DATABASE_URL" -f schema.sql
--             or: npm run db:schema:apply   (pg-based, no psql needed)
-- ======================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- assets.ts : assets ----------
CREATE TABLE IF NOT EXISTS assets
(
    "assetNumber"        TEXT PRIMARY KEY,
    description          TEXT NOT NULL DEFAULT '',
    "assetClass"         TEXT NOT NULL DEFAULT '',
    company              TEXT NOT NULL DEFAULT '',
    "costCenter"         TEXT,
    location             TEXT,
    project              TEXT,
    cost                 NUMERIC(18,2) NOT NULL DEFAULT 0,
    "accumDepreciation"  NUMERIC(18,2) NOT NULL DEFAULT 0,
    nbv                  NUMERIC(18,2) NOT NULL DEFAULT 0,
    method               TEXT NOT NULL DEFAULT '',
    status               TEXT NOT NULL DEFAULT 'Active',  -- Active | Retired | Transferred | Fully Depreciated | Under Review
    -- taxFactPattern (flattened, all nullable — only set for some assets)
    "tfp_placedInService" DATE,
    "tfp_recoveryPeriod"  TEXT,
    "tfp_method"          TEXT,
    "tfp_convention"      TEXT,
    "tfp_bonusPct"        NUMERIC(5,2),
    "tfp_annualRate"      NUMERIC(5,2),
    "tfp_propertyType"    TEXT,
    -- disposal (flattened, only set when status = 'Retired')
    "disp_disposalDate"   DATE,
    "disp_adAtDisposal"   NUMERIC(18,2),
    "disp_gainLoss"       NUMERIC(18,2),
    "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Existing deployments created before the tax-fact-pattern / disposal
-- columns existed (e.g. migrated over from ClickHouse before these were
-- added): CREATE TABLE IF NOT EXISTS above won't add them to an
-- already-existing table, so pick them up here too.
ALTER TABLE assets ADD COLUMN IF NOT EXISTS "tfp_placedInService" DATE;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS "tfp_recoveryPeriod" TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS "tfp_method" TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS "tfp_convention" TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS "tfp_bonusPct" NUMERIC(5,2);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS "tfp_annualRate" NUMERIC(5,2);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS "tfp_propertyType" TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS "disp_disposalDate" DATE;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS "disp_adAtDisposal" NUMERIC(18,2);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS "disp_gainLoss" NUMERIC(18,2);

-- ---------- activity.ts : recentActivity ----------
CREATE TABLE IF NOT EXISTS lifecycle_activity
(
    id            BIGSERIAL PRIMARY KEY,
    "assetNumber" TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    event         TEXT NOT NULL,   -- Addition | Adjustment | Transfer | Retirement | Reinstatement | Reclassification | Transfer In
    amount        NUMERIC(18,2) NOT NULL DEFAULT 0,
    "eventDate"   DATE NOT NULL,
    status        TEXT NOT NULL,   -- Posted | Processing | Pending
    "insertedAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lifecycle_activity_event_date ON lifecycle_activity ("eventDate", "assetNumber");

-- ---------- admin.ts : roles ----------
CREATE TABLE IF NOT EXISTS roles
(
    name         TEXT PRIMARY KEY,
    "userCount"  INTEGER NOT NULL DEFAULT 0,
    access       TEXT NOT NULL DEFAULT '',
    permissions  TEXT NOT NULL DEFAULT '{}'   -- stored as JSON string, parse on read
);

-- ---------- admin.ts : users ----------
CREATE TABLE IF NOT EXISTS users
(
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL DEFAULT '',
    email         TEXT NOT NULL DEFAULT '',
    role          TEXT NOT NULL DEFAULT '',
    "lastActive"  TEXT NOT NULL DEFAULT '',
    status        TEXT NOT NULL DEFAULT '',      -- Active | Invited
    password      TEXT NOT NULL DEFAULT '',      -- prototype only: plaintext, never returned to the client
    "menuAccess"  TEXT NOT NULL DEFAULT '{}'     -- JSON: { [menuId]: { view: bool, edit: bool } } — per-user override of the Role's Permission Matrix defaults
);

-- Existing deployments created before these columns existed:
-- CREATE TABLE IF NOT EXISTS above won't add them, so pick them up here too.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS "menuAccess" TEXT NOT NULL DEFAULT '{}';

-- ---------- admin.ts : reportCatalog ----------
CREATE TABLE IF NOT EXISTS report_catalog
(
    key          TEXT PRIMARY KEY,
    name         TEXT NOT NULL DEFAULT '',
    description  TEXT NOT NULL DEFAULT ''
);

-- ---------- admin.ts : generatedReports ----------
CREATE TABLE IF NOT EXISTS generated_reports
(
    id             BIGSERIAL PRIMARY KEY,
    name           TEXT NOT NULL,
    book           TEXT NOT NULL DEFAULT '',
    period         TEXT NOT NULL DEFAULT '',
    "generatedBy"  TEXT NOT NULL DEFAULT '',
    "reportDate"   DATE NOT NULL,
    format         TEXT NOT NULL,   -- XLSX | PDF | CSV
    status         TEXT NOT NULL,   -- Ready | Draft | Processing
    "csvContent"   TEXT NOT NULL DEFAULT ''   -- the actual CSV text, so "Recently Generated Reports" can be re-downloaded later
);
CREATE INDEX IF NOT EXISTS idx_generated_reports_date ON generated_reports ("reportDate", name);

-- ---------- data/assetClasses.ts : ASSET_CLASS_SEED (Configuration -> Asset Classes page) ----------
-- "sortOrder" preserves the exact row order the table was supplied in,
-- since Postgres otherwise makes no order guarantee without ORDER BY.
-- ratePct is TEXT (not NUMERIC) because a handful of rows are "N/A".
CREATE TABLE IF NOT EXISTS asset_classes
(
    "sortOrder"     INTEGER PRIMARY KEY,
    name            TEXT NOT NULL,
    "propertyType"  TEXT NOT NULL,
    method          TEXT NOT NULL,
    "ratePct"       TEXT NOT NULL,
    convention      TEXT NOT NULL,
    life            TEXT NOT NULL,
    "bonusPct"      TEXT NOT NULL DEFAULT ''
);

-- ---------- Depreciation calc-engine: asset type -> property type / method / convention / rate ----------
-- Replaces the hard-coded ASSET_CONFIG (calc-engine/additions.cjs) and the label->code /
-- code->method maps (services/depreciation.ts). Edit rows here; the server reloads them at boot
-- and after every change made through the API. Seeded once from data/assetTypeConfig.ts.
CREATE TABLE IF NOT EXISTS asset_type_config
(
    code            TEXT PRIMARY KEY,
    label           TEXT NOT NULL UNIQUE,
    "propertyType"  TEXT NOT NULL,
    method          TEXT NOT NULL,
    convention      TEXT NOT NULL,
    rate            NUMERIC NOT NULL DEFAULT 0,
    "sortOrder"     INTEGER NOT NULL DEFAULT 0,
    active          BOOLEAN NOT NULL DEFAULT TRUE
);

-- ---------- Books (was hard-coded in data/books.ts) ----------
-- Seeded once from BOOKS_SEED when empty. "sortOrder" keeps the dropdown order.
CREATE TABLE IF NOT EXISTS books
(
    name                 TEXT PRIMARY KEY,
    description          TEXT NOT NULL DEFAULT '',
    "bookOfRecord"       BOOLEAN NOT NULL DEFAULT FALSE,
    "periodCloseDate"    TEXT NOT NULL DEFAULT '',
    "reportingMonthEnd"  TEXT NOT NULL DEFAULT '',
    "reportingYearEnd"   TEXT NOT NULL DEFAULT '',
    "sortOrder"          INTEGER NOT NULL DEFAULT 0,
    active               BOOLEAN NOT NULL DEFAULT TRUE
);

-- ---------- Bonus depreciation (was client/src/data/bonusDepreciation.js + BonusDepreciation.jsx) ----------
-- Timeline table shown on Configuration -> Bonus Depreciation.
CREATE TABLE IF NOT EXISTS bonus_depreciation_rates
(
    id           SERIAL PRIMARY KEY,
    "year"       TEXT NOT NULL,
    pct          NUMERIC NOT NULL DEFAULT 0,
    lpp          NUMERIC NOT NULL DEFAULT 0,
    law          TEXT NOT NULL DEFAULT '',
    notes        TEXT NOT NULL DEFAULT '',
    highlight    BOOLEAN NOT NULL DEFAULT FALSE,
    "sortOrder"  INTEGER NOT NULL DEFAULT 0,
    active       BOOLEAN NOT NULL DEFAULT TRUE
);

-- Date-range rules behind the Bonus % auto-fill (placed-in-service date -> pct). NULL end = open range.
CREATE TABLE IF NOT EXISTS bonus_depreciation_rules
(
    id               SERIAL PRIMARY KEY,
    "effectiveFrom"  DATE,
    "effectiveTo"    DATE,
    pct              NUMERIC NOT NULL DEFAULT 0,
    label            TEXT NOT NULL DEFAULT '',
    "sortOrder"      INTEGER NOT NULL DEFAULT 0,
    active           BOOLEAN NOT NULL DEFAULT TRUE
);

-- Eligibility rules / excluded property / luxury-auto limits tabs. data = the row's columns as JSON.
CREATE TABLE IF NOT EXISTS bonus_reference_rows
(
    id           SERIAL PRIMARY KEY,
    kind         TEXT NOT NULL,   -- qualifying_rule | excluded_property | vehicle_limit
    data         JSONB NOT NULL,
    "sortOrder"  INTEGER NOT NULL DEFAULT 0,
    active       BOOLEAN NOT NULL DEFAULT TRUE
);

-- ---------- Dropdown choices for the Lifecycle forms (was client/src/data/lifecycleFormSchemas.js) ----------
-- list = rateTable | method | conventionAddition | conventionAdjustment | ... | registerMethodFilter.
-- (The asset-type list comes from asset_type_config; quarters stay in code.)
CREATE TABLE IF NOT EXISTS form_option_lists
(
    list         TEXT NOT NULL,
    value        TEXT NOT NULL,
    "sortOrder"  INTEGER NOT NULL DEFAULT 0,
    active       BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (list, value)
);

-- ---------- Calc-engine regression test cases (moved out of calc-engine/*.cjs) ----------
-- Seeded from db/engine-test-cases.sql. Run them with: npm run test:engine
CREATE TABLE IF NOT EXISTS engine_test_cases
(
    engine            TEXT NOT NULL,
    "caseId"          TEXT NOT NULL,
    name              TEXT NOT NULL,
    inputs            JSONB NOT NULL,
    "expectedOutputs" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "sortOrder"       INTEGER NOT NULL DEFAULT 0,
    active            BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (engine, "caseId")
);

-- ---------- IRS Pub 946 MACRS percentage tables (moved out of calc-engine/rate-tables.cjs) ----------
-- Seeded from db/rate-tables.sql. The server loads these at boot (services/rateTables.ts).
CREATE TABLE IF NOT EXISTS macrs_rate_by_year
(
    "tableKey" TEXT NOT NULL,
    life       INTEGER NOT NULL,
    year       INTEGER NOT NULL,
    "ratePct"  NUMERIC NOT NULL,
    PRIMARY KEY ("tableKey", life, year)
);

CREATE TABLE IF NOT EXISTS macrs_mm_rate
(
    "tableKey"  TEXT NOT NULL,
    month       INTEGER NOT NULL,
    "year1Pct"  NUMERIC NOT NULL,
    "annualPct" NUMERIC NOT NULL,
    PRIMARY KEY ("tableKey", month)
);

CREATE TABLE IF NOT EXISTS macrs_ads_lives
(
    life INTEGER PRIMARY KEY
);

-- ---------- Configuration -> Asset Classes -> "Customize Table" ----------
-- 3 rows (seeded on first read, see db/repo.ts). Name shown in the UI is
-- "<book> - <assetType>", e.g. "GAAP - Acquisition".
CREATE TABLE IF NOT EXISTS asset_class_custom_table
(
    id              SERIAL PRIMARY KEY,
    book            TEXT NOT NULL,
    "assetType"     TEXT NOT NULL,
    "propertyType"  TEXT NOT NULL,
    method          TEXT NOT NULL,
    "ratePct"       TEXT NOT NULL,
    convention      TEXT NOT NULL,
    life            TEXT NOT NULL,
    "bonusPct"      TEXT NOT NULL DEFAULT ''
);

-- Marker: the 3 starter rows above are inserted once; this records it so
-- deleting every rule doesn't bring them back (created on demand by repo.ts too).
CREATE TABLE IF NOT EXISTS asset_class_custom_seeded
(
    done BOOLEAN NOT NULL
);

-- ---------- Configuration -> Asset Classes: FACT TABLE ----------
-- One row per version of a Default/Customize row (see db/repo.ts). Append-only:
-- the triggers below reject UPDATE / DELETE / TRUNCATE, so history never changes.
CREATE TABLE IF NOT EXISTS asset_class_fact_table
(
    id               SERIAL PRIMARY KEY,
    scope            TEXT NOT NULL,
    "classKey"       TEXT NOT NULL,
    name             TEXT NOT NULL DEFAULT '',
    book             TEXT NOT NULL DEFAULT '',
    "effectiveFrom"  DATE NOT NULL,
    "changedAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
    "changedBy"      TEXT NOT NULL DEFAULT '',
    "propertyType"   TEXT NOT NULL DEFAULT '',
    method           TEXT NOT NULL DEFAULT '',
    "ratePct"        TEXT NOT NULL DEFAULT '',
    convention       TEXT NOT NULL DEFAULT '',
    life             TEXT NOT NULL DEFAULT '',
    "bonusPct"       TEXT NOT NULL DEFAULT '',
    changes          TEXT NOT NULL DEFAULT '[]'
);

CREATE OR REPLACE FUNCTION asset_class_fact_table_locked() RETURNS trigger AS $f$
BEGIN RAISE EXCEPTION 'asset_class_fact_table is append-only: rows cannot be changed or deleted'; END;
$f$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS asset_class_fact_table_no_change ON asset_class_fact_table;
CREATE TRIGGER asset_class_fact_table_no_change BEFORE UPDATE OR DELETE ON asset_class_fact_table
  FOR EACH ROW EXECUTE FUNCTION asset_class_fact_table_locked();
DROP TRIGGER IF EXISTS asset_class_fact_table_no_truncate ON asset_class_fact_table;
CREATE TRIGGER asset_class_fact_table_no_truncate BEFORE TRUNCATE ON asset_class_fact_table
  FOR EACH STATEMENT EXECUTE FUNCTION asset_class_fact_table_locked();

-- ---------- activity.ts : dashboardSummary (single-row snapshot table) ----------
CREATE TABLE IF NOT EXISTS dashboard_summary
(
    "snapshotAt"                TIMESTAMPTZ PRIMARY KEY DEFAULT now(),
    "totalAssets"                INTEGER NOT NULL DEFAULT 0,
    "addedThisPeriod"            INTEGER NOT NULL DEFAULT 0,
    "grossCost"                  NUMERIC(20,2) NOT NULL DEFAULT 0,
    "grossCostYtdDeltaPct"       NUMERIC(6,2) NOT NULL DEFAULT 0,
    "netBookValue"               NUMERIC(20,2) NOT NULL DEFAULT 0,
    "depreciationDeltaPct"       NUMERIC(6,2) NOT NULL DEFAULT 0,
    "ytdDepreciation"            NUMERIC(20,2) NOT NULL DEFAULT 0,
    "monthlyDepreciationJson"    TEXT NOT NULL DEFAULT '[]',   -- JSON array
    "assetsByClassJson"          TEXT NOT NULL DEFAULT '[]'    -- JSON array
);

-- ---------- activity.ts : forecast (single-row snapshot table) ----------
CREATE TABLE IF NOT EXISTS forecast_snapshot
(
    "snapshotAt"           TIMESTAMPTZ PRIMARY KEY DEFAULT now(),
    "kpisJson"             TEXT NOT NULL DEFAULT '{}',   -- JSON object
    "expenseByYearJson"    TEXT NOT NULL DEFAULT '[]',   -- JSON array
    "rollForwardJson"      TEXT NOT NULL DEFAULT '[]'    -- JSON array
);

-- ---------- auth.ts : notification feed (login / registration) ----------
-- Persisted so notifications survive a server restart and are only ever
-- removed when the user clicks the X on them.
CREATE TABLE IF NOT EXISTS notifications
(
    seq      BIGSERIAL PRIMARY KEY,
    id       TEXT NOT NULL DEFAULT '',
    name     TEXT NOT NULL DEFAULT '',
    email    TEXT NOT NULL DEFAULT '',
    role     TEXT NOT NULL DEFAULT '',
    at       TEXT NOT NULL DEFAULT '',
    type     TEXT NOT NULL DEFAULT 'login'
);

-- ======================================================
-- END OF FILE : schema.sql
-- ======================================================
