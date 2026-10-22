-- Reference only: the server creates this table automatically on first use.
-- Manage accounts with:  npm run service-account -- <create|list|disable|enable|rotate|set-events|set-companies|set-expiry>
CREATE TABLE IF NOT EXISTS service_accounts (
  id             SERIAL      PRIMARY KEY,
  name           TEXT        NOT NULL UNIQUE,         -- appears in the ledger as svc:<name>
  key_hash       TEXT        NOT NULL UNIQUE,         -- SHA-256 of the API key (the key itself is never stored)
  key_prefix     TEXT        NOT NULL,                -- first 8 chars, to recognise a key in `list`
  allowed_events TEXT[]      NOT NULL DEFAULT '{}',   -- empty = every lifecycle event type
  allowed_companies TEXT[]   NOT NULL DEFAULT '{}',   -- empty = every company (limits posting AND reading)
  enabled        BOOLEAN     NOT NULL DEFAULT true,
  expires_at     TIMESTAMPTZ,
  last_used_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     TEXT        NOT NULL DEFAULT 'cli'
);

-- Retry-safe posting: one row per (service account, externalRef) the caller sent.
-- 'pending' while the event is being posted, 'posted' once it is in the ledger.
-- Created automatically on first use (services/serviceIdempotency.ts).
CREATE TABLE IF NOT EXISTS service_requests (
  service_name TEXT        NOT NULL,
  external_ref TEXT        NOT NULL,
  event_type   TEXT        NOT NULL,
  asset_number TEXT        NOT NULL,
  state        TEXT        NOT NULL DEFAULT 'pending',
  outcome_json TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (service_name, external_ref)
);
