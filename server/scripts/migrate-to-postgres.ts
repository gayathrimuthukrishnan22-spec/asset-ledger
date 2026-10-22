// ======================================================
// File Name : migrate-to-postgres.ts
// Purpose   : One-shot move of everything currently in
//             server/data-store.json into Postgres (Neon), so Postgres
//             becomes the source of truth and the JSON file can be
//             archived.
//
//             Safe to re-run: assets are upserted by assetNumber, and
//             the timeline/schedule rows are deleted per asset before
//             re-insert, so a second run converges to the same state
//             rather than duplicating rows.
//
// Run with  : npx tsx scripts/migrate-to-postgres.ts
//             (from inside server/, with .env loaded — or
//              node --env-file=.env ... if you prefer)
// ======================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, pingPostgres } from '../src/db/postgres.js';
import { flush } from '../src/db/repo.js';
import { ensureSchedules } from '../src/services/schedule-builder.js';
import { initRateTables } from '../src/services/rateTables.js';
import { initRecoveryDefaults } from '../src/services/recoveryDefaults.js';
import type { Asset, DepreciationScheduleRow, TimelineEntry } from '../src/types.js';

// ======================================================
// START: Script Functions
// ======================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Optional arg: JSON file to load (default data-store.json). Sample data: db/seed-assets.json (npm run db:seed:assets).
const STORE_PATH = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..', 'data-store.json');

type StoreShape = {
  assets: Asset[];
  timelines: Record<string, TimelineEntry[]>;
  depreciationSchedules: Record<string, DepreciationScheduleRow[]>;
};

// ======================================================
// Function : main
// Purpose  : One-time migration: loads the data-store snapshot into Postgres after checking the connection.
// ======================================================

async function main(): Promise<void> {
  if (!(await pingPostgres())) {
    console.error('Cannot reach Postgres. Check DATABASE_URL in server/.env.');
    console.error('Apply the schema first: npm run db:schema:apply');
    process.exit(1);
  }
  await initRateTables();
  await initRecoveryDefaults();

  if (!fs.existsSync(STORE_PATH)) {
    console.error(`No data-store.json at ${STORE_PATH} — nothing to migrate.`);
    process.exit(1);
  }

  const store = JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8')) as Partial<StoreShape>;
  const snapshot: StoreShape = {
    assets: store.assets ?? [],
    timelines: store.timelines ?? {},
    depreciationSchedules: store.depreciationSchedules ?? {}
  };

  console.log(`Read ${snapshot.assets.length} assets from data-store.json`);

  const built = ensureSchedules(snapshot.assets, snapshot.depreciationSchedules);
  if (built.length > 0) {
    console.log(`Generated depreciation schedules for ${built.length} assets that had none:`);
    console.log(`  ${built.join(', ')}`);
  }

  await flush(snapshot);

  const result = await pool.query(`
    SELECT 'assets' AS t, count(*) AS c FROM assets
    UNION ALL SELECT 'asset_timeline', count(*) FROM asset_timeline
    UNION ALL SELECT 'asset_depreciation_schedule', count(*) FROM asset_depreciation_schedule
    UNION ALL SELECT 'asset_transactions', count(*) FROM asset_transactions
  `);
  console.table(result.rows);

  // Only the default data-store.json is archived; an explicit file arg (e.g. db/seed-assets.json) is left in place.
  if (!process.argv[2]) {
    // Move the JSON out of the way so nothing can accidentally read it back as a source of truth.
    const archived = `${STORE_PATH}.migrated-${new Date().toISOString().slice(0, 10)}`;
    fs.renameSync(STORE_PATH, archived);
    console.log(`\nArchived ${path.basename(STORE_PATH)} -> ${path.basename(archived)}`);
  }
  console.log('Postgres is now the source of truth.');

  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

// ======================================================
// END: Script Functions
// ======================================================

// ======================================================
// END OF FILE : migrate-to-postgres.ts
// ======================================================
