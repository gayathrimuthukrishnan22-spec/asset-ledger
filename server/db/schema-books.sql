-- ======================================================
-- File Name : schema-books.sql
-- Purpose   : One stored entry PER BOOK per asset. When an asset is
--             added (or its cost / terms change), the app writes a
--             row for every book in data/books.ts (GAAP, Federal Tax,
--             Federal Tax - E&P, DE, IA, ... all 15) plus that book's
--             own year-by-year depreciation schedule, built from the
--             book's Customize Table rule (or mirrored from Federal
--             Tax when the book has no rule for the asset's class).
--
-- Run with  : psql "$DATABASE_URL" -f schema-books.sql
--             (run AFTER schema.sql / schema-core.sql.)
-- ======================================================

-- ---------- one row per (asset, book): the book's summary entry ----------
CREATE TABLE IF NOT EXISTS asset_book_entry
(
    "assetNumber"        TEXT NOT NULL,
    book                 TEXT NOT NULL,
    "ruleSource"         TEXT NOT NULL DEFAULT 'stored',   -- stored | book-rule | federal-mirror
    "ruleName"           TEXT NOT NULL DEFAULT '',         -- e.g. 'GAAP - Machinery' (book-rule only)
    method               TEXT NOT NULL DEFAULT '',
    convention           TEXT NOT NULL DEFAULT '',
    life                 TEXT NOT NULL DEFAULT '',
    cost                 NUMERIC(20,2) NOT NULL DEFAULT 0,
    "accumDepreciation"  NUMERIC(20,2) NOT NULL DEFAULT 0,
    nbv                  NUMERIC(20,2) NOT NULL DEFAULT 0,
    sig                  TEXT NOT NULL DEFAULT '',         -- fingerprint of the inputs this row was built from
    "updatedAt"          TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY ("assetNumber", book)
);

-- ---------- one row per (asset, book, year): that book's schedule ----------
CREATE TABLE IF NOT EXISTS asset_book_schedule
(
    "assetNumber"        TEXT NOT NULL,
    book                 TEXT NOT NULL,
    seq                  INTEGER NOT NULL,
    year                 TEXT NOT NULL,
    "fiscalYear"         INTEGER NOT NULL,
    "openingNbv"         NUMERIC(20,2) NOT NULL DEFAULT 0,
    rate                 NUMERIC(9,4) NOT NULL DEFAULT 0,
    depreciation         NUMERIC(20,2) NOT NULL DEFAULT 0,
    "accumDepreciation"  NUMERIC(20,2) NOT NULL DEFAULT 0,
    "closingNbv"         NUMERIC(20,2) NOT NULL DEFAULT 0,
    "updatedAt"          TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY ("assetNumber", book, seq)
);
CREATE INDEX IF NOT EXISTS idx_asset_book_schedule_book_year ON asset_book_schedule (book, "fiscalYear");

-- ======================================================
-- END OF FILE : schema-books.sql
-- ======================================================
