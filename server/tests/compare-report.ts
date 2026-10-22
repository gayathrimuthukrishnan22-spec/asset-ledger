// Prints expected vs actual for every stored case:  npx tsx tests/compare-report.ts
import { createRequire } from 'node:module';
import { sqlRows } from './sqlSeed.js';
const require = createRequire(import.meta.url);
const RT = require('../calc-engine/rate-tables.cjs');
const byYear: any = {}, mm: any = {};
for (const [k, l, y, p] of sqlRows('rate-tables.sql', 'macrs_rate_by_year')) ((byYear[String(k)] ??= {})[String(l)] ??= [])[Number(y) - 1] = Number(p);
for (const [k, m, y1, a] of sqlRows('rate-tables.sql', 'macrs_mm_rate')) (mm[String(k)] ??= { year1: {}, annual: Number(a) }).year1[String(m)] = Number(y1);
RT.load({ byYear, mm, adsLives: sqlRows('rate-tables.sql', 'macrs_ads_lives').map((r) => Number(r[0])) });
const cfg: any = {};
for (const [c, , t, m, v, r] of sqlRows('asset-type-config.sql', 'asset_type_config')) cfg[String(c)] = { type: t, method: m, conv: v, rate: Number(r) };
const E: any = { additions: ['additions', 'calculateAddition'], adjustments: ['adjustments', 'calculateAdjustment'], disposals: ['disposals', 'calculateDisposal'], transfers: ['transfers', 'calculateTransfer'], reinstatements: ['reinstatements', 'calculateReinstatement'], reclassifications: ['reclassifications', 'calculateReclassification'] };
const vals = (o: any, k: string, out: any[] = []): any[] => { if (o && typeof o === 'object') for (const [kk, v] of Object.entries(o)) { if (kk === k && (v === null || typeof v !== 'object')) out.push(v); vals(v, k, out); } return out; };
let ok = 0, bad = 0, none = 0, absent = 0;
for (const [engine, id, , inputs, exp] of sqlRows('engine-test-cases.sql', 'engine_test_cases')) {
  const r = require(`../calc-engine/${E[String(engine)][0]}.cjs`)[E[String(engine)][1]]({ ...JSON.parse(String(inputs)), assetConfig: cfg });
  const e = JSON.parse(String(exp)); const keys = Object.keys(e);
  if (!keys.length) { none++; console.log(`-  ${engine}/${id}  (no expected values stored)`); continue; }
  for (const k of keys) { const a = vals(r, k); const pass = a.some((v) => (typeof e[k] === 'number' ? Math.abs(Number(v) - e[k]) <= 0.01 : String(v) === String(e[k])));
    if (pass) ok++; else if (!a.length) absent++; else bad++; console.log(`${pass ? 'OK ' : a.length ? 'XX ' : '?? '} ${engine}/${id}  ${k}: expected ${e[k]} | actual ${a.length ? a.join(' / ') : '(field not in output)'}`); }
}
console.log(`\nfield checks: match ${ok}, WRONG value ${bad}; field name missing in engine output ${absent}; cases with no expected values: ${none}`);
