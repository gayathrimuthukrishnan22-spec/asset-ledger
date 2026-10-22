// ======================================================
// File Name : importLog.ts
// Purpose   : Remembers which external records (e.g. SAP documents) were
//             already imported, so fetching again never posts them twice.
//             Table is created on first use — no manual SQL step needed
//             (same DDL is in db/integration-imports.sql for reference).
// ======================================================

import { pool } from '../../db/postgres.js';

let ready: Promise<unknown> | null = null;
function ensureTable() {
  ready ??= pool.query(
    `CREATE TABLE IF NOT EXISTS integration_imports (
       source        TEXT        NOT NULL,
       external_ref  TEXT        NOT NULL,
       asset_number  TEXT        NOT NULL,
       imported_by   TEXT        NOT NULL,
       imported_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
       PRIMARY KEY (source, external_ref)
     )`
  ).catch((err) => { ready = null; throw err; });
  return ready;
}

export async function findImported(source: string, refs: string[]): Promise<Set<string>> {
  if (refs.length === 0) return new Set();
  await ensureTable();
  const res = await pool.query(
    `SELECT external_ref FROM integration_imports WHERE source = $1 AND external_ref = ANY($2::text[])`,
    [source, refs]
  );
  return new Set(res.rows.map((r) => String(r.external_ref)));
}

export async function recordImported(
  source: string,
  entries: Array<{ ref: string; assetNumber: string }>,
  importedBy: string
): Promise<void> {
  if (entries.length === 0) return;
  await ensureTable();
  for (const e of entries) {
    await pool.query(
      `INSERT INTO integration_imports (source, external_ref, asset_number, imported_by)
       VALUES ($1, $2, $3, $4) ON CONFLICT (source, external_ref) DO NOTHING`,
      [source, e.ref, e.assetNumber, importedBy]
    );
  }
}

// ======================================================
// END OF FILE : importLog.ts
// ======================================================
