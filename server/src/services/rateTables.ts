// ======================================================
// File Name : rateTables.ts
// Purpose   : Loads the IRS Pub 946 MACRS percentage tables from Postgres into
//             the calc-engine's shared RATE_TABLES module. Nothing is hard-coded:
//             if the tables are empty the server refuses to start (instead of
//             silently depreciating with the wrong rates).
//             Call initRateTables() once at boot, BEFORE anything that builds
//             depreciation schedules (initStore, migrate script, test runner).
// ======================================================

import { createRequire } from 'node:module';
import { loadRateTables } from '../db/repo.js';

const require = createRequire(import.meta.url);

export async function initRateTables(): Promise<number> {
  const data = await loadRateTables();
  const tableCount = Object.keys(data.byYear).length + Object.keys(data.mm).length;
  if (!tableCount) {
    throw new Error('MACRS rate tables are empty in Postgres - run db/rate-tables.sql in the Neon SQL editor first');
  }
  const RATE_TABLES = require('../../calc-engine/rate-tables.cjs');
  RATE_TABLES.load(data);
  return tableCount;
}
