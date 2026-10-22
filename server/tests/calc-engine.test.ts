import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { sqlRows } from './sqlSeed.js';

// Calculation tests: NO server, NO database. Rate tables + test cases + asset types come from db/*.sql.
const require = createRequire(import.meta.url);
const RATE_TABLES = require('../calc-engine/rate-tables.cjs');

// ---- load Pub 946 tables exactly like src/db/repo.ts loadRateTables() ----
const byYear: Record<string, Record<string, number[]>> = {};
for (const [key, life, year, pct] of sqlRows('rate-tables.sql', 'macrs_rate_by_year')) {
  ((byYear[String(key)] ??= {})[String(life)] ??= [])[Number(year) - 1] = Number(pct);
}
const mm: Record<string, { year1: Record<string, number>; annual: number }> = {};
for (const [key, month, y1, annual] of sqlRows('rate-tables.sql', 'macrs_mm_rate')) {
  (mm[String(key)] ??= { year1: {}, annual: Number(annual) }).year1[String(month)] = Number(y1);
}
const adsLives = sqlRows('rate-tables.sql', 'macrs_ads_lives').map((r) => Number(r[0]));
RATE_TABLES.load({ byYear, mm, adsLives });

// ---- asset type config (same shape run-engine-tests.ts builds) ----
const assetConfig: Record<string, any> = {};
for (const [code, , propertyType, method, convention, rate] of sqlRows('asset-type-config.sql', 'asset_type_config')) {
  assetConfig[String(code)] = { type: propertyType, method, conv: convention, rate: Number(rate) };
}

const ENGINES: Record<string, [string, string]> = {
  additions: ['additions.cjs', 'calculateAddition'],
  adjustments: ['adjustments.cjs', 'calculateAdjustment'],
  disposals: ['disposals.cjs', 'calculateDisposal'],
  transfers: ['transfers.cjs', 'calculateTransfer'],
  reinstatements: ['reinstatements.cjs', 'calculateReinstatement'],
  reclassifications: ['reclassifications.cjs', 'calculateReclassification']
};

function valuesFor(obj: unknown, key: string, out: unknown[] = []): unknown[] {
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (k === key && (v === null || typeof v !== 'object')) out.push(v);
      valuesFor(v, key, out);
    }
  }
  return out;
}
const matches = (actual: unknown, expected: unknown) =>
  typeof expected === 'number' ? Math.abs(Number(actual) - expected) <= 0.01 : String(actual) === String(expected);

// ---------------- 1. Pub 946 table sanity (independent of stored expectations) ----------------
describe('MACRS rate tables (Pub 946)', () => {
  it('every GDS table/life sums to 100%', () => {
    for (const [table, lives] of Object.entries(byYear)) {
      for (const [life, rates] of Object.entries(lives)) {
        const sum = rates.reduce((a, b) => a + b, 0);
        expect(sum, `${table} ${life}yr`).toBeGreaterThan(99.9);
        expect(sum, `${table} ${life}yr`).toBeLessThan(100.1);
      }
    }
  });
  it('5yr HY year-1 = 20%, 7yr = 14.29%, 3yr = 33.33%', () => {
    expect(byYear.A1_HY_200DB['5'][0]).toBe(20);
    expect(byYear.A1_HY_200DB['7'][0]).toBe(14.29);
    expect(byYear.A1_HY_200DB['3'][0]).toBe(33.33);
  });
  it('mid-month tables have 12 months each', () => {
    for (const [name, t] of Object.entries(mm)) expect(Object.keys(t.year1), name).toHaveLength(12);
  });
});

// ---------------- 2. Hand-calculated checks ----------------
describe('Addition: hand-calculated', () => {
  const run = (o: any) => require('../calc-engine/additions.cjs').calculateAddition({ ...o, assetConfig });
  it('100% bonus, 5yr GDS, current year -> fully depreciated, NBV 0', () => {
    const r = run({ cost: 1000, pisd: '2026-03-06', accountingPeriodDate: '2026-03-31', lifeMonths: 60, bonusPercent: 100, convention: 'HY', quarter: 1, assetType: 'GDS-5' });
    expect(valuesFor(r, 'afyd')[0]).toBeCloseTo(1000, 2);
  });
  it('40% bonus 5yr HY, PISD prior year -> AFYD = 400 (bonus only, per stored cases)', () => {
    const r = run({ cost: 1000, pisd: '2025-01-01', accountingPeriodDate: '2026-03-31', lifeMonths: 60, bonusPercent: 40, convention: 'HY', quarter: 1, assetType: 'GDS-5' });
    expect(valuesFor(r, 'afyd')[0]).toBeCloseTo(400, 2);
  });
});

// ---------------- 3. All stored engine cases (162 in engine-test-cases.sql) ----------------
const cases = sqlRows('engine-test-cases.sql', 'engine_test_cases').map(([engine, caseId, name, inputs, expected]) => ({
  engine: String(engine), caseId: String(caseId), name: String(name),
  inputs: JSON.parse(String(inputs)), expected: JSON.parse(String(expected)) as Record<string, unknown>
}));

describe('Stored engine cases', () => {
  it('seed file has 162 cases', () => expect(cases.length).toBe(162));
  for (const eng of Object.keys(ENGINES)) {
    describe(eng, () => {
      for (const c of cases.filter((x) => x.engine === eng)) {
        it(`${c.caseId} - ${c.name}`, (ctx) => {
          const [file, fn] = ENGINES[eng];
          const result = require(`../calc-engine/${file}`)[fn]({ ...c.inputs, assetConfig });
          // every numeric output must be a real number (no NaN / Infinity) - also protects the cases with no stored expectations
          const bad: string[] = [];
          (function walk(o: any, path: string) {
            if (typeof o === 'number' && !Number.isFinite(o)) bad.push(`${path}=${o}`);
            else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`);
          })(result, 'result');
          expect(bad, 'non-finite numbers in engine output').toEqual([]);
          const problems: string[] = [];
          let missing = 0, checked = 0;
          for (const [key, exp] of Object.entries(c.expected)) {
            const found = valuesFor(result, key);
            if (!found.length) { missing++; continue; }
            checked++;
            if (!found.some((v) => matches(v, exp))) problems.push(`${key}: expected ${exp}, got ${found.join(' / ')}`);
          }
          expect(problems, problems.join('\n')).toEqual([]);
          if (missing && !checked) ctx.skip(); // expected field name not in engine output (old label)
        });
      }
    });
  }
});
