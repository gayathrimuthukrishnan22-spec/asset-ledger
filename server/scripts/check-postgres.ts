// ======================================================
// File Name : check-postgres.ts
// Purpose   : One command to answer "is Postgres actually holding my
//             data?" — connectivity, row counts per table, and the
//             monthly depreciation figure computed IN SQL so you can
//             compare it against what the Dashboard card shows.
//             If the two disagree, the app and the database have
//             drifted and that's the bug to chase.
// Run with  : npm run db:check
// ======================================================

import { pool, pingPostgres } from '../src/db/postgres.js';

// ======================================================
// START: Script Functions
// ======================================================

// ======================================================
// Function : rows
// Purpose  : Runs a read-only query and returns the result rows typed as T.
// ======================================================

async function rows<T>(query: string): Promise<T[]> {
  const result = await pool.query(query);
  return result.rows as T[];
}

// ======================================================
// Function : main
// Purpose  : Pings Postgres and prints the stored row counts so they can be compared with the Dashboard.
// ======================================================

async function main(): Promise<void> {
  const ok = await pingPostgres();
  console.log(`Postgres — ${ok ? 'reachable' : 'UNREACHABLE'}`);
  if (!ok) process.exit(1);

  console.log('\n--- row counts ---');
  console.table(
    await rows(`
      SELECT * FROM (
        SELECT 'assets' AS table_name, count(*) AS rows FROM assets
        UNION ALL SELECT 'asset_timeline', count(*) FROM asset_timeline
        UNION ALL SELECT 'asset_depreciation_schedule', count(*) FROM asset_depreciation_schedule
        UNION ALL SELECT 'asset_transactions', count(*) FROM asset_transactions
        UNION ALL SELECT 'users', count(*) FROM users
        UNION ALL SELECT 'roles', count(*) FROM roles
      ) t
      ORDER BY table_name
    `)
  );

  console.log('\n--- book totals (should match the Dashboard KPI cards) ---');
  console.table(
    await rows(`
      SELECT
        count(*)                          AS total_assets,
        round(sum(cost)::numeric, 2)              AS gross_cost,
        round(sum(nbv)::numeric, 2)               AS net_book_value,
        round(sum("accumDepreciation")::numeric, 2) AS accum_depreciation
      FROM assets
    `)
  );

  console.log('\n--- assets with NO depreciation schedule (should be 0) ---');
  console.table(
    await rows(`
      SELECT a."assetNumber", a.description, a.cost
      FROM assets a
      LEFT JOIN (
        SELECT DISTINCT "assetNumber" FROM asset_depreciation_schedule
      ) s ON a."assetNumber" = s."assetNumber"
      WHERE s."assetNumber" IS NULL
      LIMIT 25
    `)
  );

  console.log('\n--- depreciation by fiscal year (drives the monthly chart) ---');
  console.table(await rows(`SELECT * FROM v_monthly_depreciation`));

  console.log('\n--- last 10 posted transactions ---');
  console.table(
    await rows(`
      SELECT asset_number, event_type, result_badge_text, posted_at
      FROM asset_transactions
      ORDER BY posted_at DESC
      LIMIT 10
    `)
  );

  await pool.end();
}

main().catch((err) => {
  console.error('Check failed:', err);
  process.exit(1);
});

// ======================================================
// END: Script Functions
// ======================================================

// ======================================================
// END OF FILE : check-postgres.ts
// ======================================================
