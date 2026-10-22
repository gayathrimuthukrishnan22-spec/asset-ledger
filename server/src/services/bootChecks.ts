// ======================================================
// File Name : bootChecks.ts
// Purpose   : Values live ONLY in the database. This refuses to start the
//             server when a required config table is empty, and says which
//             SQL file to run, instead of silently showing blank pages.
// ======================================================

import { pool } from '../db/postgres.js';

// table -> SQL file (under server/db) that fills it. Keys only; the rows are in the DB.
const REQUIRED: Record<string, string> = {
  users: 'seed-admin.sql',
  roles: 'seed-admin.sql',
  asset_classes: 'seed-asset-classes.sql',
  companies: 'config-tables.sql',
  pub946_tables: 'config-tables.sql'
};

export async function assertSeedData(): Promise<void> {
  const missing: string[] = [];
  for (const [table, file] of Object.entries(REQUIRED)) {
    const { rows } = await pool.query(`SELECT count(*)::int AS c FROM ${table}`);
    if (!rows[0].c) missing.push(`${table} is empty - run db/${file}`);
  }
  if (missing.length) throw new Error(missing.join('; '));
}

// ======================================================
// END OF FILE : bootChecks.ts
// ======================================================
