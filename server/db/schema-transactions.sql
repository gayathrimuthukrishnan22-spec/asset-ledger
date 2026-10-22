-- ======================================================
-- File Name : schema-transactions.sql
-- Purpose   : Append-only ledger for the Lifecycle page's
--             6 event cards (Addition/Adjustment/Transfer/
--             Retirement/Reinstatement/Reclassification).
--             We never UPDATE a row here — every "Confirm &
--             Post" click inserts a new immutable row.
-- Run with  : psql "$DATABASE_URL" -f schema-transactions.sql
--             (requires pgcrypto — created by schema.sql)
-- ======================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS asset_transactions
(
    transaction_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_number            TEXT NOT NULL,
    event_type               TEXT NOT NULL,   -- Addition | Adjustment | Transfer | Retirement | Reinstatement | Reclassification
    fields_json                TEXT NOT NULL,   -- the exact form fields the user submitted (raw JSON)
    result_badge_text           TEXT NOT NULL,   -- e.g. "Posted"
    result_badge_tone             TEXT NOT NULL,   -- green | blue | amber | red
    result_rows_json                TEXT NOT NULL,   -- preview.rows, JSON — what the right-side table shows
    result_formula_note               TEXT NOT NULL DEFAULT '',
    result_sections_json                TEXT NOT NULL DEFAULT '[]',   -- preview.sections, JSON (full calc breakdown)
    posted_at                             TIMESTAMPTZ NOT NULL DEFAULT now(),
    posted_by                               TEXT NOT NULL DEFAULT 'system'
);
CREATE INDEX IF NOT EXISTS idx_asset_transactions_asset_posted ON asset_transactions (asset_number, posted_at);

-- ======================================================
-- END OF FILE : schema-transactions.sql
-- ======================================================
