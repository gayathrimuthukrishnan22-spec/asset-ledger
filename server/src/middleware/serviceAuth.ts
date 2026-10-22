// ======================================================
// File Name : serviceAuth.ts
// Purpose   : API-key check for machine-to-machine callers (ERP / other
//             systems) of /api/service/*. A key is accepted from either:
//               1. a service account in the database (services/
//                  serviceAccounts.ts) — per-key allowed events, enable /
//                  disable, expiry, last-used; or
//               2. the legacy env var  SERVICE_API_KEYS=name:key,name2:key2
//                  (always allowed to post every event type).
//             On success res.locals.service = { name, allowedEvents,
//             allowedCompanies } and
//             the ledger's posted_by becomes "svc:<name>".
//             Status codes: 503 nothing configured at all (never open),
//             401 missing / invalid / disabled / expired key.
// ======================================================

import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { countAccounts, findAccountByKey, touchLastUsed } from '../services/serviceAccounts.js';

export interface ServiceIdentity {
  name: string;
  allowedEvents: string[]; // lower-case ids; empty = every event type
  allowedCompanies: string[]; // upper-case company codes; empty = every company
}

type EnvKey = { name: string; hash: Buffer };
const sha256 = (value: string): Buffer => createHash('sha256').update(value).digest();

function loadEnvKeys(): EnvKey[] {
  return (process.env.SERVICE_API_KEYS ?? '')
    .split(',')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const i = pair.indexOf(':');
      return i > 0 ? { name: pair.slice(0, i).trim(), hash: sha256(pair.slice(i + 1).trim()) } : null;
    })
    .filter((k): k is EnvKey => k !== null && k.name.length > 0);
}

export async function requireServiceKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const envKeys = loadEnvKeys();
    const configured = envKeys.length > 0 || (await countAccounts()) > 0;
    if (!configured) {
      res.status(503).json({ error: 'Service API is not configured (create a service account: npm run service-account -- create <name>)' });
      return;
    }

    const supplied = req.header('x-api-key');
    if (!supplied) {
      res.status(401).json({ error: 'Missing x-api-key header' });
      return;
    }

    // 1. legacy env keys — compare fixed-length hashes in constant time, check every key
    const suppliedHash = sha256(supplied);
    let envMatch: string | null = null;
    for (const k of envKeys) {
      if (timingSafeEqual(k.hash, suppliedHash) && envMatch === null) envMatch = k.name;
    }
    if (envMatch) {
      res.locals.service = { name: envMatch, allowedEvents: [], allowedCompanies: [] } satisfies ServiceIdentity;
      next();
      return;
    }

    // 2. database service accounts
    const account = await findAccountByKey(supplied);
    if (!account) {
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }
    if (!account.enabled || (account.expiresAt && account.expiresAt.getTime() <= Date.now())) {
      res.status(401).json({ error: 'API key is disabled or expired' });
      return;
    }

    touchLastUsed(account.id);
    res.locals.service = { name: account.name, allowedEvents: account.allowedEvents, allowedCompanies: account.allowedCompanies } satisfies ServiceIdentity;
    next();
  } catch (err) {
    console.error('Service API key check failed:', err);
    res.status(500).json({ error: 'Could not verify the API key' });
  }
}

// ======================================================
// END OF FILE : serviceAuth.ts
// ======================================================
