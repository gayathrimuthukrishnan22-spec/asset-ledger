// ======================================================
// File Name : run-engine-tests.ts
// Purpose   : Runs every calc-engine test case stored in Postgres
//             (table engine_test_cases) against its engine and prints
//             pass / fail / skipped. Asset-type config is read from the
//             asset_type_config table too — nothing is hard-coded.
//             "Skipped" = the case expects an output field name the engine
//             result does not contain (older label, e.g. netBookValue).
// Run with  : npm run test:engine            (all engines)
//             npm run test:engine -- additions
// ======================================================

import { createRequire } from 'node:module';
import { pool } from '../src/db/postgres.js';
import { loadAssetTypeConfig, loadEngineTestCases } from '../src/db/repo.js';
import { initRateTables } from '../src/services/rateTables.js';

const require = createRequire(import.meta.url);

// engine name -> [file, exported function]
const ENGINES: Record<string, [string, string]> = {
  additions: ['additions.cjs', 'calculateAddition'],
  adjustments: ['adjustments.cjs', 'calculateAdjustment'],
  disposals: ['disposals.cjs', 'calculateDisposal'],
  transfers: ['transfers.cjs', 'calculateTransfer'],
  reinstatements: ['reinstatements.cjs', 'calculateReinstatement'],
  reclassifications: ['reclassifications.cjs', 'calculateReclassification']
};

// Every value stored under `key` anywhere in the engine result.
function valuesFor(obj: unknown, key: string, out: unknown[] = []): unknown[] {
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (k === key && (v === null || typeof v !== 'object')) out.push(v);
      valuesFor(v, key, out);
    }
  }
  return out;
}

function matches(actual: unknown, expected: unknown): boolean {
  if (typeof expected === 'number') return Math.abs(Number(actual) - expected) <= 0.01;
  return String(actual) === String(expected);
}

async function main(): Promise<void> {
  const only = process.argv[2];
  await initRateTables();
  const types = await loadAssetTypeConfig();
  const assetConfig: Record<string, { type: string; method: string; conv: string; rate: number }> = {};
  for (const t of types) assetConfig[t.code] = { type: t.propertyType, method: t.method, conv: t.convention, rate: t.rate };

  const cases = await loadEngineTestCases(only);
  if (!cases.length) { console.log('[test] no test cases found — run db/engine-test-cases.sql first'); await pool.end(); return; }

  let pass = 0, fail = 0, skipped = 0, errors = 0;
  for (const c of cases) {
    const def = ENGINES[c.engine];
    if (!def) { console.log(`  ? ${c.engine}/${c.caseId}: unknown engine`); errors++; continue; }
    const fn = require(`../calc-engine/${def[0]}`)[def[1]];
    let result: unknown;
    try { result = fn({ ...c.inputs, assetConfig }); }
    catch (err) { console.log(`  ERROR ${c.engine}/${c.caseId}: ${err instanceof Error ? err.message : err}`); errors++; continue; }

    const problems: string[] = [];
    let missing = 0;
    for (const [key, expected] of Object.entries(c.expectedOutputs)) {
      const found = valuesFor(result, key);
      if (!found.length) { missing++; continue; }
      if (!found.some((v) => matches(v, expected))) problems.push(`${key}: expected ${expected}, got ${found.join(' / ')}`);
    }
    if (problems.length) { fail++; console.log(`  FAIL  ${c.engine}/${c.caseId} — ${c.name}\n        ${problems.join('\n        ')}`); }
    else if (missing) { skipped++; }
    else pass++;
  }
  console.log(`\n[test] ${cases.length} cases — pass ${pass}, fail ${fail}, skipped ${skipped}, errors ${errors}`);
  await pool.end();
  if (fail || errors) process.exit(1);
}

main().catch((err) => { console.error('[test] failed:', err instanceof Error ? err.message : err); process.exit(1); });
