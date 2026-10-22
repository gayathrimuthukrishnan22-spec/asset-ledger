// ======================================================
// File Name : schedule-builder.ts
// Purpose   : Two things the Dashboard/Forecasting views were missing:
//
//             1. toISODate() — ONE date normalizer. The store currently
//                holds placedInService in at least three shapes
//                ('2026-03-19', '03/06/2026', 'MAR 19, 2026'). Every
//                "is this asset in service yet?" test in the app was a
//                raw string compare, so non-ISO dates silently gave the
//                wrong answer and .slice(5,7) read garbage as a month.
//
//             2. buildSchedule() — generates a real year-by-year
//                depreciation schedule for an asset that doesn't have
//                one. Before this, 15 of 16 assets had NO schedule, so
//                the Dashboard fell back to cost x annualRate / 12 —
//                the same number every single month, which is why the
//                Monthly Depreciation Expense chart was flat/zero.
//
//             Uses the existing IRS Pub-946 tables from
//             calc-engine/rate-tables.cjs, so generated schedules match
//             what the Lifecycle calculators produce.
// ======================================================

import { defaultRecoveryYears } from './recoveryDefaults.js';
import { createRequire } from 'node:module';
import type { Asset, DepreciationScheduleRow } from '../types.js';

// ======================================================
// START: Service Functions
// ======================================================

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const RATE_TABLES = require('../../calc-engine/rate-tables.cjs');

// ======================================================
// Function : toISODate
// Purpose  : Normalizes any date string the store might hold into
//            'YYYY-MM-DD'. Returns null when there's nothing usable,
//            so callers can decide what "unknown date" should mean
//            instead of silently comparing a bad string.
// Input    : raw (unknown)
// Output   : 'YYYY-MM-DD' | null
// ======================================================

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
};

export function toISODate(raw: unknown): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // Already ISO: 2026-03-19 (or a full ISO timestamp)
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // US slash/dash form: 03/06/2026, 3-6-2026
  const slash = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slash) {
    const mm = slash[1].padStart(2, '0');
    const dd = slash[2].padStart(2, '0');
    return `${slash[3]}-${mm}-${dd}`;
  }

  // Timeline display form: 'MAR 19, 2026' / 'Mar 19 2026'
  const named = s.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (named) {
    const mm = MONTHS[named[1].toLowerCase()];
    if (mm) return `${named[3]}-${mm}-${named[2].padStart(2, '0')}`;
  }

  // Last resort — let Date try, but only accept a sane result.
  const d = new Date(s);
  if (!Number.isNaN(d.getTime()) && d.getFullYear() > 1900 && d.getFullYear() < 2200) {
    return d.toISOString().slice(0, 10);
  }
  return null;
}

// ======================================================
// END: toISODate
// ======================================================

// ======================================================
// Function : inServiceDate
// Purpose  : The date an asset actually started depreciating. Prefers
//            the tax fact pattern's placedInService; if that's missing
//            (12 of the 16 seeded assets), falls back to the first year
//            on its stored schedule, then to its disposal year, then to
//            the start of the current fiscal year — because an asset
//            carrying cost and accumulated depreciation IS on the books
//            and must not be excluded from the expense chart just
//            because nobody filled in a date.
// ======================================================

export function inServiceDate(asset: Asset, schedule?: DepreciationScheduleRow[]): string {
  const fromTfp = toISODate(asset.taxFactPattern?.placedInService);
  if (fromTfp) return fromTfp;

  const firstYear = schedule?.[0]?.year?.match(/(\d{4})/)?.[1];
  if (firstYear) return `${firstYear}-01-01`;

  const disposal = toISODate(asset.disposal?.disposalDate);
  if (disposal) return `${disposal.slice(0, 4)}-01-01`;

  return `${new Date().getFullYear()}-01-01`;
}

// ======================================================
// END: inServiceDate
// ======================================================

// ======================================================
// Function : recoveryYears
// Purpose  : Digs a recovery period out of whatever the asset has —
//            the tax fact pattern's recoveryPeriod string ('5-Year',
//            '39'), the method name, or a sane default per asset class.
//            Never returns 0, so we can't divide by zero downstream.
// ======================================================

export function recoveryYears(asset: Asset): number {
  const raw = asset.taxFactPattern?.recoveryPeriod ?? '';
  const n = Number(String(raw).match(/(\d+(?:\.\d+)?)/)?.[1]);
  if (Number.isFinite(n) && n > 0) return n;

  if (/39/.test(asset.method)) return 39;
  if (/27\.5/.test(asset.method)) return 27.5;
  return defaultRecoveryYears(asset.assetClass);
}

// ======================================================
// END: recoveryYears
// ======================================================

// ======================================================
// Function : rateForYear
// Purpose  : Asks the existing calc-engine (calc-engine/rate-tables.cjs
//            lookupRate) for this asset's Pub-946 percentage in a given
//            depreciation year, using its own method/life/convention.
//            Returns null when the engine has no table for that combo,
//            so buildSchedule falls back to a straight-line curve rather
//            than inventing a rate.
// ======================================================

// ======================================================
// Function : engineMethod
// Purpose  : Maps an asset method to the method name the calc-engine understands.
// ======================================================

function engineMethod(asset: Asset): string {
  const m = `${asset.taxFactPattern?.method ?? asset.method ?? ''}`.toLowerCase();
  if (m.includes('150')) return 'MACRS 150DB';
  if (m.includes('ads')) return 'MACRS ADS';
  if (m.includes('straight') || m.startsWith('sl')) return 'MACRS Straight-Line';
  return 'MACRS';
}

// ======================================================
// Function : engineConvention
// Purpose  : Maps an asset convention to the convention code the calc-engine understands.
// ======================================================

function engineConvention(asset: Asset): string {
  const c = `${asset.taxFactPattern?.convention ?? asset.method ?? ''}`.toLowerCase();
  if (c.includes('mid-month') || c.includes('mid month') || c.includes('mm')) return 'Mid-Month';
  if (c.includes('quarter') || c.includes('mq')) return 'MQ';
  return 'HY';
}

// ======================================================
// Function : rateForYear
// Purpose  : Looks up the depreciation rate % for a year from the rate tables; null when the lookup fails or gives no rate.
// ======================================================

function rateForYear(asset: Asset, life: number, year: number, monthPIS: number): number | null {
  try {
    const rate = RATE_TABLES.lookupRate({
      method: engineMethod(asset),
      lifeYears: Math.round(life),
      convention: engineConvention(asset),
      year,
      quarter: Math.min(4, Math.max(1, Math.ceil(monthPIS / 3))),
      monthPIS
    });
    return typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : null;
  } catch {
    return null;
  }
}

// ======================================================
// END: rateForYear
// ======================================================

// ======================================================
// Function : buildSchedule
// Purpose  : Produces the year-by-year rows the Dashboard chart and the
//            Forecasting roll-forward read. Starts from the asset's
//            CURRENT book position (cost less accumulated depreciation),
//            not from a clean slate, so a part-depreciated asset picks
//            up where it actually is. MACRS percentages when the asset
//            has a table-driven fact pattern; straight-line over the
//            remaining life otherwise. Never emits negative
//            depreciation and never drives closing NBV below zero.
// Input    : asset
// Output   : DepreciationScheduleRow[]
// ======================================================

export function buildSchedule(asset: Asset): DepreciationScheduleRow[] {
  const cost = Number(asset.cost) || 0;
  if (cost <= 0) return [];

  const life = recoveryYears(asset);
  const pis = inServiceDate(asset);
  const startYear = Number(pis.slice(0, 4));
  const monthPIS = Number(pis.slice(5, 7)) || 1;

  const rows: DepreciationScheduleRow[] = [];
  let accum = 0;
  let openingNbv = cost;

  // One extra year: both MACRS half-year/mid-month and the straight-line
  // fallback spill a partial final year past the nominal recovery period.
  const totalYears = Math.ceil(life) + 1;

  for (let i = 0; i < totalYears; i++) {
    if (openingNbv <= 0.005) break;

    // Pub-946 table rate when the engine has one for this asset's
    // method/life/convention; otherwise straight-line with a half year
    // at each end, matching the convention the rest of the app assumes.
    const slRate = i === 0 || i === Math.ceil(life) ? (100 / life) / 2 : 100 / life;
    const ratePct = rateForYear(asset, life, i + 1, monthPIS) ?? slRate;

    let depreciation = round2((cost * ratePct) / 100);
    if (accum + depreciation > cost) depreciation = round2(cost - accum);
    if (depreciation < 0) depreciation = 0;

    accum = round2(accum + depreciation);
    const closingNbv = round2(cost - accum);

    rows.push({
      year: `${startYear + i} (Yr ${i + 1})`,
      openingNbv: round2(openingNbv),
      rate: round2(ratePct),
      depreciation,
      accumDepreciation: accum,
      closingNbv
    });

    openingNbv = closingNbv;
  }

  return rows;
}

// ======================================================
// END: buildSchedule
// ======================================================

// ======================================================
// Function : ensureSchedules
// Purpose  : Backfills a generated schedule for every asset that has
//            none. Called once at boot and again after any mutation
//            that creates an asset, so no asset can ever sit invisible
//            to the Dashboard chart the way 15 of 16 did before.
//            Returns the asset numbers it filled in, for the boot log.
// ======================================================

export function ensureSchedules(
  assetList: Asset[],
  schedules: Record<string, DepreciationScheduleRow[]>
): string[] {
  const filled: string[] = [];
  for (const asset of assetList) {
    const existing = schedules[asset.assetNumber];
    if (existing && existing.length > 0) continue;
    const built = buildSchedule(asset);
    if (built.length > 0) {
      schedules[asset.assetNumber] = built;
      filled.push(asset.assetNumber);
    }
  }
  return filled;
}

// ======================================================
// END: ensureSchedules
// ======================================================

// ======================================================
// Function : round2
// Purpose  : Rounds a number to 2 decimal places.
// ======================================================

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ======================================================
// END: Service Functions
// ======================================================

// ======================================================
// END OF FILE : schedule-builder.ts
// ======================================================
