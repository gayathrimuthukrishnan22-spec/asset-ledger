// ======================================================
// File Name : serviceAccounts.ts
// Purpose   : Service accounts for machine-to-machine callers (ERP etc.).
//             One row per calling system:
//               - the API key is shown ONCE when created; only its SHA-256
//                 hash is stored (a database leak does not leak keys)
//               - allowed_events limits which lifecycle event types the key
//                 may post (empty = all events)
//               - allowed_companies limits which companies the key may post
//                 for and read (empty = all companies)
//               - enabled / expires_at let you cut a key off instantly,
//                 no server restart needed
//               - last_used_at shows which systems are actually calling
//             Managed from the command line (scripts/service-accounts.ts),
//             NOT over HTTP — the app has no server-side login yet, so an
//             HTTP "create key" endpoint would let anyone mint keys.
//             The table is created on first use (DDL also in
//             db/service-accounts.sql for reference).
// ======================================================

import { createHash, randomBytes } from 'node:crypto';
import { pool } from '../db/postgres.js';

export const EVENT_IDS = ['addition', 'adjustment', 'transfer', 'retirement', 'reinstatement', 'reclassification'] as const;
export const EVENT_LABELS: Record<string, string> = {
  addition: 'Addition', adjustment: 'Adjustment', transfer: 'Transfer',
  retirement: 'Retirement', reinstatement: 'Reinstatement', reclassification: 'Reclassification'
};

export interface ServiceAccount {
  id: number;
  name: string;
  keyPrefix: string;
  allowedEvents: string[];     // lower-case ids; empty = every event type
  allowedCompanies: string[];  // upper-case company codes; empty = every company
  enabled: boolean;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  createdBy: string;
}

// ---------- helpers ----------

export const hashKey = (key: string): string => createHash('sha256').update(key).digest('hex');
export const generateKey = (): string => `alk_${randomBytes(32).toString('base64url')}`;

const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
export function assertValidName(name: string): void {
  if (!NAME_RE.test(name)) {
    throw new Error('Name must be 1-40 characters: lower-case letters, digits, "-" or "_" (it appears in the ledger as svc:<name>).');
  }
}

// "all" / empty -> [] (every event). Otherwise a comma list of event names.
export function parseEvents(input?: string | string[]): string[] {
  const list = (Array.isArray(input) ? input : (input ?? '').split(','))
    .map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (list.length === 0 || list.includes('all')) return [];
  const bad = list.filter((e) => !(EVENT_IDS as readonly string[]).includes(e));
  if (bad.length) throw new Error(`Unknown event type(s): ${bad.join(', ')}. Use: ${EVENT_IDS.join(', ')} or "all".`);
  return [...new Set(list)];
}

// "all" / empty -> [] (every company). Otherwise a comma list of company codes, stored upper-case
// (matching is case-insensitive, see companyAllowed).
export function parseCompanies(input?: string | string[]): string[] {
  const list = (Array.isArray(input) ? input : (input ?? '').split(','))
    .map((c) => c.trim().toUpperCase()).filter(Boolean);
  if (list.length === 0 || list.includes('ALL')) return [];
  const bad = list.filter((c) => !/^[A-Z0-9][A-Z0-9_-]{0,19}$/.test(c));
  if (bad.length) throw new Error(`Invalid company code(s): ${bad.join(', ')}. Use letters/digits (e.g. 5B,2D) or "all".`);
  return [...new Set(list)];
}

// True when `company` is permitted by an allowed list (empty list = every company).
export const companyAllowed = (allowed: string[], company: unknown): boolean =>
  allowed.length === 0 || allowed.includes(String(company ?? '').trim().toUpperCase());

// Canonical label ("Addition") for any casing, or undefined if not a known event.
export function canonicalEvent(value: unknown): string | undefined {
  return EVENT_LABELS[String(value ?? '').trim().toLowerCase()];
}

// ---------- table ----------

let ready: Promise<unknown> | null = null;
function ensureTable() {
  ready ??= pool.query(
    `CREATE TABLE IF NOT EXISTS service_accounts (
       id             SERIAL      PRIMARY KEY,
       name           TEXT        NOT NULL UNIQUE,
       key_hash       TEXT        NOT NULL UNIQUE,
       key_prefix     TEXT        NOT NULL,
       allowed_events TEXT[]      NOT NULL DEFAULT '{}',
       enabled        BOOLEAN     NOT NULL DEFAULT true,
       expires_at     TIMESTAMPTZ,
       last_used_at   TIMESTAMPTZ,
       created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
       created_by     TEXT        NOT NULL DEFAULT 'cli'
     )`
  ).then(() => pool.query(
    // added later — older databases get the column here (empty = every company)
    `ALTER TABLE service_accounts ADD COLUMN IF NOT EXISTS allowed_companies TEXT[] NOT NULL DEFAULT '{}'`
  )).catch((err) => { ready = null; throw err; });
  return ready;
}

function toAccount(r: any): ServiceAccount {
  return {
    id: r.id, name: r.name, keyPrefix: r.key_prefix, allowedEvents: r.allowed_events ?? [],
    allowedCompanies: r.allowed_companies ?? [],
    enabled: r.enabled, expiresAt: r.expires_at ? new Date(r.expires_at) : null,
    lastUsedAt: r.last_used_at ? new Date(r.last_used_at) : null,
    createdAt: new Date(r.created_at), createdBy: r.created_by
  };
}

// ---------- queries used by the auth middleware ----------

export async function countAccounts(): Promise<number> {
  await ensureTable();
  const res = await pool.query('SELECT count(*)::int AS n FROM service_accounts');
  return Number(res.rows[0]?.n ?? 0);
}

export async function findAccountByKey(key: string): Promise<ServiceAccount | null> {
  await ensureTable();
  const res = await pool.query('SELECT * FROM service_accounts WHERE key_hash = $1', [hashKey(key)]);
  return res.rows[0] ? toAccount(res.rows[0]) : null;
}

// Best effort and throttled to once a minute so busy callers don't write on every request.
export function touchLastUsed(id: number): void {
  pool.query(
    `UPDATE service_accounts SET last_used_at = now()
      WHERE id = $1 AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute')`,
    [id]
  ).catch((err) => console.error('service account last_used update failed:', err));
}

// ---------- management (used by the CLI) ----------

export async function listAccounts(): Promise<ServiceAccount[]> {
  await ensureTable();
  const res = await pool.query('SELECT * FROM service_accounts ORDER BY name');
  return res.rows.map(toAccount);
}

export async function createAccount(opts: { name: string; events?: string[]; companies?: string[]; expiresAt?: Date | null; createdBy?: string }): Promise<{ account: ServiceAccount; key: string }> {
  assertValidName(opts.name);
  await ensureTable();
  const key = generateKey();
  try {
    const res = await pool.query(
      `INSERT INTO service_accounts (name, key_hash, key_prefix, allowed_events, allowed_companies, expires_at, created_by)
       VALUES ($1, $2, $3, $4::text[], $5::text[], $6, $7) RETURNING *`,
      [opts.name, hashKey(key), key.slice(0, 8), opts.events ?? [], opts.companies ?? [], opts.expiresAt ?? null, opts.createdBy ?? 'cli']
    );
    return { account: toAccount(res.rows[0]), key };
  } catch (err: any) {
    if (err?.code === '23505') throw new Error(`A service account named "${opts.name}" already exists.`);
    throw err;
  }
}

async function updateByName(name: string, set: string, params: unknown[]): Promise<ServiceAccount> {
  await ensureTable();
  const res = await pool.query(`UPDATE service_accounts SET ${set} WHERE name = $1 RETURNING *`, [name, ...params]);
  if (!res.rows[0]) throw new Error(`No service account named "${name}".`);
  return toAccount(res.rows[0]);
}

export const setEnabled = (name: string, enabled: boolean) => updateByName(name, 'enabled = $2', [enabled]);
export const setEvents = (name: string, events: string[]) => updateByName(name, 'allowed_events = $2::text[]', [events]);
export const setCompanies = (name: string, companies: string[]) => updateByName(name, 'allowed_companies = $2::text[]', [companies]);
export const setExpiry = (name: string, expiresAt: Date | null) => updateByName(name, 'expires_at = $2', [expiresAt]);

// New key; the old one stops working immediately.
export async function rotateKey(name: string): Promise<{ account: ServiceAccount; key: string }> {
  const key = generateKey();
  const account = await updateByName(name, 'key_hash = $2, key_prefix = $3, last_used_at = NULL', [hashKey(key), key.slice(0, 8)]);
  return { account, key };
}

// ======================================================
// END OF FILE : serviceAccounts.ts
// ======================================================
