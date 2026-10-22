// ======================================================
// File Name : serviceIdempotency.ts
// Purpose   : Retry-safe posting for the Service API. A caller (ERP etc.)
//             may attach an `externalRef` (its own document / line id) to
//             each event. The first time a ref is seen the event is posted
//             and the outcome is remembered; sending the SAME ref again
//             (a network retry, a re-sent batch) does NOT post a second
//             ledger row - the stored outcome is returned instead, marked
//             duplicate: true.
//             Scope is per service account: erp's "INV-1" and billing's
//             "INV-1" are different refs.
//             Flow per ref:  claim (state 'pending')  ->  post  ->
//               complete (state 'posted', outcome stored)   or
//               release  (row removed when posting FAILED, so the caller
//               can fix the data and retry with the same ref).
//             A 'pending' claim older than STALE_MINUTES (server crashed
//             mid-post) can be taken over by the next retry.
//             The table is created on first use (DDL also in
//             db/service-accounts.sql for reference).
// ======================================================

import { pool } from '../db/postgres.js';

const STALE_MINUTES = 5;
export const MAX_REF_LENGTH = 200;

export interface StoredOutcome {
  assetNumber: string;
  eventType: string;
  status: 'posted';
}

export type ClaimResult =
  | { claimed: true }
  | { claimed: false; state: 'pending' | 'posted'; assetNumber: string; eventType: string; outcome: StoredOutcome | null };

// ---------- table ----------

let ready: Promise<unknown> | null = null;
function ensureTable() {
  ready ??= pool.query(
    `CREATE TABLE IF NOT EXISTS service_requests (
       service_name TEXT        NOT NULL,
       external_ref TEXT        NOT NULL,
       event_type   TEXT        NOT NULL,
       asset_number TEXT        NOT NULL,
       state        TEXT        NOT NULL DEFAULT 'pending',
       outcome_json TEXT,
       created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
       completed_at TIMESTAMPTZ,
       PRIMARY KEY (service_name, external_ref)
     )`
  ).catch((err) => { ready = null; throw err; });
  return ready;
}

// ---------- helpers ----------

// Trimmed ref, or null when none was sent. Throws on a bad value so the caller can fail that row.
export function cleanRef(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' && typeof value !== 'number') throw new Error('externalRef must be a string.');
  const ref = String(value).trim();
  if (!ref) return null;
  if (ref.length > MAX_REF_LENGTH) throw new Error(`externalRef is too long (max ${MAX_REF_LENGTH} characters).`);
  return ref;
}

function parseOutcome(text: string | null): StoredOutcome | null {
  if (!text) return null;
  try { return JSON.parse(text) as StoredOutcome; } catch { return null; }
}

// ---------- claim / complete / release ----------

export async function claimRef(service: string, ref: string, eventType: string, assetNumber: string): Promise<ClaimResult> {
  await ensureTable();

  const inserted = await pool.query(
    `INSERT INTO service_requests (service_name, external_ref, event_type, asset_number)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (service_name, external_ref) DO NOTHING
     RETURNING 1`,
    [service, ref, eventType, assetNumber]
  );
  if (inserted.rowCount) return { claimed: true };

  // Already known: a stale 'pending' claim (crashed mid-post) is taken over...
  const takeover = await pool.query(
    `UPDATE service_requests
        SET created_at = now(), event_type = $3, asset_number = $4
      WHERE service_name = $1 AND external_ref = $2 AND state = 'pending'
        AND created_at < now() - ($5 || ' minutes')::interval
      RETURNING 1`,
    [service, ref, eventType, assetNumber, String(STALE_MINUTES)]
  );
  if (takeover.rowCount) return { claimed: true };

  // ...otherwise report what is stored.
  const existing = await pool.query(
    `SELECT state, event_type, asset_number, outcome_json
       FROM service_requests WHERE service_name = $1 AND external_ref = $2`,
    [service, ref]
  );
  const row = existing.rows[0];
  if (!row) return claimRef(service, ref, eventType, assetNumber); // released between our two statements - try again
  return {
    claimed: false,
    state: row.state === 'posted' ? 'posted' : 'pending',
    assetNumber: row.asset_number,
    eventType: row.event_type,
    outcome: parseOutcome(row.outcome_json)
  };
}

export async function completeRef(service: string, ref: string, outcome: StoredOutcome): Promise<void> {
  await ensureTable();
  await pool.query(
    `UPDATE service_requests SET state = 'posted', outcome_json = $3, completed_at = now()
      WHERE service_name = $1 AND external_ref = $2`,
    [service, ref, JSON.stringify(outcome)]
  );
}

// Posting failed - forget the claim so the same ref can be retried after the data is fixed.
export async function releaseRef(service: string, ref: string): Promise<void> {
  await ensureTable();
  await pool.query(
    `DELETE FROM service_requests WHERE service_name = $1 AND external_ref = $2 AND state = 'pending'`,
    [service, ref]
  );
}

// ---------- lookup (GET /lifecycle/events/by-ref/:ref) ----------

export async function findRef(service: string, ref: string) {
  await ensureTable();
  const res = await pool.query(
    `SELECT state, event_type, asset_number, outcome_json, created_at, completed_at
       FROM service_requests WHERE service_name = $1 AND external_ref = $2`,
    [service, ref]
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    externalRef: ref,
    state: row.state as 'pending' | 'posted',
    eventType: row.event_type as string,
    assetNumber: row.asset_number as string,
    receivedAt: new Date(row.created_at).toISOString(),
    postedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null
  };
}

// ======================================================
// END OF FILE : serviceIdempotency.ts
// ======================================================
