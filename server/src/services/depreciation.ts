// ======================================================
// File Name : depreciation.ts
// Purpose   : Handles business logic for depreciation
// ======================================================

import { codeForLabel, getEngineAssetConfig, methodForAssetCode } from './assetTypeConfig.js';
import { bonusPctForDate, customBonusPct } from './bonusRates.js';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type {
  LifecycleEventType,
  LifecyclePreviewInput,
  LifecyclePreviewResult,
  LifecyclePreviewResultRow,
  LifecyclePreviewSection,
  ScenarioInput
} from '../types.js';

/**
 * This service used to re-derive each card's math by hand (straight-line
 * approximation only — see git history). It now calls the SAME calculation
 * engines as the standalone reference calculators in Htmls/js/*.js
 * (additions, adjustments, disposals, transfers, reinstatements,
 * reclassifications + the shared RATE_TABLES MACRS/Pub-946 lookup) — those
 * files are copied verbatim into ../../calc-engine/*.cjs (only a `require`
 * for RATE_TABLES and a trailing `module.exports` were added; no formula
 * was touched) and required here. This guarantees the app and the
 * standalone HTML calculators always produce identical numbers, because
 * they're literally running the same code.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ENGINE_DIR = join(__dirname, '..', '..', 'calc-engine');

const additionsEngine = require(join(ENGINE_DIR, 'additions.cjs'));
const adjustmentsEngine = require(join(ENGINE_DIR, 'adjustments.cjs'));
const disposalsEngine = require(join(ENGINE_DIR, 'disposals.cjs'));
const transfersEngine = require(join(ENGINE_DIR, 'transfers.cjs'));
const reinstatementsEngine = require(join(ENGINE_DIR, 'reinstatements.cjs'));
const reclassificationsEngine = require(join(ENGINE_DIR, 'reclassifications.cjs'));


// ======================================================
// START: Service Functions
// ======================================================

// ── Shared helpers ──────────────────────────────────────────────────────
// ======================================================
// Function : round2
// Purpose  : Rounds a number to 2 decimal places (with EPSILON so 1.005 rounds up).
// ======================================================

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ======================================================
// END: round2
// ======================================================

// ======================================================
// Function : num
// Purpose  : Reads a form field as a number; strips commas from strings and falls back to the default.
// ======================================================

function num(fields: Record<string, unknown>, key: string, fallback = 0): number {
  const v = fields[key];
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') return Number(v.replace(/,/g, ''));
  return fallback;
}

// ======================================================
// END: num
// ======================================================

// ======================================================
// Function : str
// Purpose  : Reads a form field as a non-empty string, otherwise the fallback.
// ======================================================

function str(fields: Record<string, unknown>, key: string, fallback = ''): string {
  const v = fields[key];
  return typeof v === 'string' && v ? v : fallback;
}

// ======================================================
// END: str
// ======================================================

// ======================================================
// Function : bool
// Purpose  : Reads a form field as a boolean (true or "true").
// ======================================================

function bool(fields: Record<string, unknown>, key: string): boolean {
  return fields[key] === true || fields[key] === 'true';
}

// ======================================================
// END: bool
// ======================================================

// ======================================================
// Function : money
// Purpose  : Formats a number as a signed US dollar string with 2 decimals.
// ======================================================

function money(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ======================================================
// END: money
// ======================================================

/** 'Q2 (Apr–Jun)' / 'Q2' / 2 -> 2 */
// ======================================================
// Function : parseQuarter
// Purpose  : Extracts the quarter number (1-4) from a value like "Q1 (Jan-Mar)"; defaults to 1.
// ======================================================

function parseQuarter(raw: unknown): number {
  const m = String(raw ?? '').match(/(\d)/);
  return m ? Number(m[1]) : 1;
}

// ======================================================
// END: parseQuarter
// ======================================================

/** Normalizes the many convention labels the client's <select> options use
 *  ('HY (Half-Year)', 'MQ (Mid-Quarter)', 'MM (Mid-Month)', 'Mid-Month', ...)
 *  down to the short codes the calc-engine files themselves branch on.
 *  `style: 'short'` is needed for disposals.cjs, which uses 'MM' rather
 *  than 'Mid-Month' for the mid-month convention. */
// ======================================================
// Function : normConvention
// Purpose  : Normalises a convention label to HY / MQ / Mid-Month (long or short style).
// ======================================================

function normConvention(raw: string, style: 'long' | 'short' = 'long'): string {
  const c = (raw || '').trim();
  if (c.startsWith('HY') || c.startsWith('Half')) return 'HY';
  if (c.startsWith('MQ') || c.startsWith('Mid-Quarter')) return 'MQ';
  if (c.includes('Mid-Month')) return style === 'short' ? 'MM' : 'Mid-Month';
  if (c.startsWith('Full-Month') || c === 'FM') return 'Full-Month';
  return c || 'HY';
}

// ======================================================
// END: normConvention
// ======================================================

/** Asset-type label -> code and code -> method now come from the asset_type_config
 *  table (Postgres) via services/assetTypeConfig.ts — nothing is hard-coded here. */

// ======================================================
// Function : assetCode
// Purpose  : Converts an asset type label from the form into its asset class code.
// ======================================================

function assetCode(f: Record<string, unknown>, key = 'assetType'): string {
  const label = str(f, key);
  return codeForLabel(label);
}

// ======================================================
// END: assetCode
// ======================================================

// ======================================================
// Function : methodForCode
// Purpose  : Returns the depreciation method for an asset class code (defaults to MACRS).
// ======================================================

function methodForCode(code: string): string {
  return methodForAssetCode(code);
}

// ======================================================
// END: methodForCode
// ======================================================

/** Builds one `sections` entry, dropping it entirely when `rows` ends up
 *  empty (mirrors the reference calculators skipping empty step cards). */
// ======================================================
// Function : section
// Purpose  : Builds one preview section (title + label/value rows), dropping empty rows.
// ======================================================

function section(title: string, rows: Array<[string, string] | null | false>): LifecyclePreviewSection {
  return { title, rows: rows.filter(Boolean).map((r) => ({ label: (r as [string, string])[0], value: (r as [string, string])[1] })) };
}

// ======================================================
// END: section
// ======================================================

// ======================================================
// Function : pct
// Purpose  : Formats a number as a percentage string.
// ======================================================

function pct(n: number): string {
  return `${n}%`;
}

// ======================================================
// END: pct
// ======================================================

/** Validation failures from any engine (result.error set, pipeline halted
 *  at step1) are surfaced as a red "Needs Attention" card listing every
 *  field-level message instead of a partial/garbage calculation. */
// ======================================================
// Function : errorResult
// Purpose  : Converts an engine validation failure into a "Needs Attention" preview result.
// ======================================================

function errorResult(engineResult: any): LifecyclePreviewResult {
  const step1 = engineResult && engineResult.steps && engineResult.steps.step1;
  const errors: Array<{ field?: string; message?: string }> = (step1 && step1.errors) || [];
  const rows: LifecyclePreviewResultRow[] = errors.length
    ? errors.map((e) => ({ label: e.field || 'Field', value: e.message || 'Invalid value' }))
    : [{ label: 'Error', value: (engineResult && engineResult.error && engineResult.error.error) || 'Calculation failed' }];
  return {
    badgeText: 'Needs Attention',
    badgeTone: 'red',
    rows,
    formulaNote: 'Fix the highlighted fields and recalculate.'
  };
}

// ======================================================
// END: errorResult
// ======================================================

// ======================================================
// Function : bonusPctOrLookup
// Purpose  : Bonus % as posted; when the field is blank, falls back to the
//            bonus_depreciation_rules row for the placed-in-service date
//            (so a client that sends no Bonus % still gets the right rate).
// ======================================================

function bonusPctOrLookup(f: Record<string, unknown>, pisd: string): number {
  const raw = f['bonusPct'];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    // Customize Table (Book / Company / Asset Type / Year) first, then the Default Table date rule.
    const custom = customBonusPct({ book: str(f, 'book'), company: str(f, 'company'), assetType: str(f, 'assetClass'), date: pisd });
    return custom ?? bonusPctForDate(pisd) ?? 0;
  }
  return num(f, 'bonusPct');
}

// ── Addition ─────────────────────────────────────────────────────────────
// ======================================================
// Function : calcAddition
// Purpose  : Performs a calculation for 'calcAddition'
// ======================================================

function calcAddition(f: Record<string, unknown>): LifecyclePreviewResult {
  const pisd = str(f, 'placedInService');
  const accountingPeriodDate = str(f, 'accountingPeriodDate') || pisd;
  const electOut = bool(f, 'electOutBonus');

  const result = additionsEngine.calculateAddition({
    cost: num(f, 'cost'),
    pisd,
    accountingPeriodDate,
    lifeMonths: num(f, 'lifeMonths', 60) || 60,
    bonusPercent: electOut ? 0 : bonusPctOrLookup(f, pisd),
    convention: normConvention(str(f, 'convention', 'HY (Half-Year)')),
    quarter: parseQuarter(f['quarter']),
    assetType: assetCode(f),
    assetConfig: getEngineAssetConfig()
  });
  if (result.error) return errorResult(result);

  const ddv = result.steps.step7;
  const currentYearRate = result.steps.step5 && result.steps.step5.currentYearRate;
  const rows: LifecyclePreviewResultRow[] = [
    { label: 'Property Type', value: ddv.propertyType },
    { label: 'Method / Convention', value: `${ddv.factPatternMethod} / ${ddv.factPatternConvention}` },
    { label: 'Recovery Life', value: ddv.factPatternLife },
    // Feeds Asset.taxFactPattern.annualRate (see buildTaxFactPattern in
    // data/assets.ts) — without this row, every asset capitalized through
    // Lifecycle → Addition would carry annualRate 0 and be silently
    // excluded from the Dashboard's Monthly Depreciation Expense chart
    // and the Forecasting page, even though it has a real tax fact pattern.
    { label: 'Current-Year Rate', value: `${Number((currentYearRate ?? 0).toFixed(4))}%` },
    { label: 'Bonus (AFYD)', value: money(ddv.factPatternAFYD) },
    { label: 'Current-Period Regular Depreciation (YTD)', value: money(ddv.ytdDeprExpense) },
    { label: 'Revision Absorbed (Backdated)', value: money(ddv.revisionAbsorbed + ddv.bonusRevisionAbsorbed) },
    { label: 'Ending Accum. Depreciation', value: money(ddv.deprEndingAccum), emphasize: true },
    { label: 'Ending Net Book Value', value: money(ddv.deprNetBookValue), emphasize: true }
  ];

  const regularFormula = result.steps.step5 && result.steps.step5.formula;
  return {
    badgeText: 'Balanced',
    badgeTone: 'green',
    rows,
    formulaNote: `${regularFormula || 'MACRS engine (IRS Pub 946 rate tables)'}, plus ${money(ddv.factPatternAFYD)} bonus (AFYD)`,
    sections: additionSections(result.steps)
  };
}

// ======================================================
// END: calcAddition
// ======================================================

// Ported from Htmls/pages/additions.html displayStepResults() — same step
// objects, same formulas, same row order as the reference calculator.
// ======================================================
// Function : additionSections
// Purpose  : Creates a new entry via 'additionSections'
// ======================================================

function additionSections(s: any): LifecyclePreviewSection[] {
  const sections: LifecyclePreviewSection[] = [
    section('Step 2: Addition Timing', s.step2 ? [['Timing', s.step2.timing], ['Backdated Months', String(s.step2.backdatedMonths)]] : []),
    section('Step 3: Property Type', s.step3 ? [
      ['Property Type', s.step3.propertyType],
      ['Method', s.step3.method],
      ['Convention', s.step3.convention],
      ['Life', `${s.step3.lifeYears} years`],
      ['Rate', String(s.step3.rate)]
    ] : []),
    section('Step 4: Bonus Depreciation', s.step4 ? [
      ['AFYD formula', 'AFYD = Cost × Bonus%'],
      ['AFYD calc', `${money(s.step4.afyd)} = ${money(s.step4.afyd + s.step4.depreciableBasis)} × ${s.step4.bonusPercent}%`],
      ['AFYD', money(s.step4.afyd)],
      ['Basis formula', 'Depreciable Basis = Cost − AFYD'],
      ['Basis calc', `${money(s.step4.depreciableBasis)} = ${money(s.step4.afyd + s.step4.depreciableBasis)} − ${money(s.step4.afyd)}`],
      ['Depreciable Basis', money(s.step4.depreciableBasis)],
      ['Full Bonus?', s.step4.isFullBonus ? 'Yes' : 'No']
    ] : []),
    section('Step 5: Regular Depreciation', s.step5
      ? (s.step4 && s.step4.isFullBonus
          ? [['Note', 'No regular depr needed (100% bonus takes full cost)']]
          : [
              ['Current Year Annual Depr formula', `AnnualDepr = DepreciableBasis × Year ${s.step5.deprYearNum} Rate%`],
              ['Current Year Annual Depr calc', `${money(s.step5.fullYearDepr)} = ${money(s.step4.depreciableBasis)} × ${Number(s.step5.currentYearRate).toFixed(4)}%`],
              ['Current Year Annual Depr', money(s.step5.fullYearDepr)],
              ['Current Period Monthly Depr formula', 'MonthlyDepr = AnnualDepr / 12'],
              ['Current Period Monthly Depr calc', `${money(s.step5.currentPeriodDepr)} = ${money(s.step5.fullYearDepr)} / 12`],
              ['Current Period Monthly Depr', money(s.step5.currentPeriodDepr)]
            ])
      : []),
    section('Step 6: Revision Absorbed (Catch-Up)', s.step6
      ? (s.step6.totalRevisionAbsorbed > 0
          ? [
              ['Backdated Months', `${s.step6.backdatedMonths} months (PISD to current period)`],
              ...(s.step6.missedRegularDepr > 0
                ? [
                    ['Missed Regular Depr formula', s.step6.missedRegularFormula],
                    ...((s.step6.yearBreakdown || []).map((yb: any): [string, string] => [`  Year ${yb.deprYearNum} (${yb.year})`, `${yb.label} = ${money(yb.amount)}`])),
                    ['Missed Regular Depr calc', s.step6.missedRegularCalc],
                    ['Missed Regular Depr', money(s.step6.missedRegularDepr)]
                  ] as [string, string][]
                : []),
              ...(s.step6.missedBonusDepr > 0
                ? [
                    ['Missed Bonus (AFYD) formula', s.step6.missedBonusFormula],
                    ['Missed Bonus (AFYD) calc', s.step6.missedBonusCalc],
                    ['Missed Bonus (AFYD)', money(s.step6.missedBonusDepr)]
                  ] as [string, string][]
                : []),
              ['---', '---'],
              ['Total Revision formula', s.step6.totalFormula],
              ['Total Revision calc', s.step6.totalCalc],
              ['Total Revision Absorbed', money(s.step6.totalRevisionAbsorbed)]
            ]
          : [['Note', 'No revision needed (current period addition)']])
      : []),
    section('Step 6B: YTD Total Depreciation', s.step6b ? [
      ['Depr_EndingAccum formula', 'EndingAccum = AFYD + Cumulative Regular Depr (PISD to now)'],
      ['Depr_EndingAccum calc', `${money(s.step6b.deprEndingAccum)} = ${money(s.step4.afyd)} + ${money(s.step5.ytdRegularDepr)}`],
      ['Depr_EndingAccum', money(s.step6b.deprEndingAccum)],
      ['fed_reg_depr_exp formula', 'fed_reg_depr_exp = Current Period Depr + fed_revision'],
      ['fed_reg_depr_exp calc', `${money(s.step6b.fedRegDeprExp)} = ${money(s.step6b.currentPeriodRegDepr)} + ${money(s.step6 ? s.step6.fedRevisionAbsorbed : 0)}`],
      ['fed_reg_depr_exp', money(s.step6b.fedRegDeprExp)],
      ['ytd_bonus formula', 'ytd_bonus = AFYD'],
      ['ytd_bonus calc', `${money(s.step6b.ytdBonus)} = ${money(s.step4.afyd)}`],
      ['ytd_bonus', money(s.step6b.ytdBonus)],
      ['Total Depr Impact formula', 'Total = fed_reg_depr_exp + bonus_revision'],
      ['Total Depr Impact calc', `${money(s.step6b.totalDeprImpact)} = ${money(s.step6b.fedRegDeprExp)} + ${money(s.step6b.bonusRevision)}`],
      ['Total Depr Impact', money(s.step6b.totalDeprImpact)]
    ] : []),
    section('Step 8: Post-Processing', s.step8 ? s.step8.map((c: any): [string, string] => [c.checkName, c.passed ? '✓ Passed' : `✗ Failed (off by ${money(c.discrepancy)})`]) : [])
  ];
  return sections.filter((sec) => sec.rows.length > 0);
}

// ======================================================
// END: additionSections
// ======================================================

// ── Adjustment ───────────────────────────────────────────────────────────
// ======================================================
// Function : calcAdjustment
// Purpose  : Performs a calculation for 'calcAdjustment'
// ======================================================

function calcAdjustment(f: Record<string, unknown>): LifecyclePreviewResult {
  const code = assetCode(f);
  const electOut = bool(f, 'electOutBonus');

  const result = adjustmentsEngine.calculateAdjustment({
    adjustmentAmount: num(f, 'adjustmentAmount'),
    originalCost: num(f, 'originalCost'),
    pisd: str(f, 'placedInService'),
    effectiveDate: str(f, 'effectiveDate'),
    accountingPeriodDate: str(f, 'accountingPeriodDate'),
    lifeMonths: num(f, 'lifeMonths', 60) || 60,
    bonusPercent: electOut ? 0 : num(f, 'bonusPct'),
    convention: normConvention(str(f, 'convention', 'HY (Half-Year)')),
    method: methodForCode(code),
    assetType: code,
    quarter: parseQuarter(f['quarter']),
    priorAdjustmentBalance: num(f, 'priorAdjBalance'),
    existingAccumDepr: num(f, 'existingAccumDepr')
  });
  if (result.error) return errorResult(result);

  const ddv = result.steps.step7;
  const rows: LifecyclePreviewResultRow[] = [
    { label: 'New Cost Basis', value: money(ddv.costEndingBalance) },
    { label: 'Ending Adjustment Balance', value: money(ddv.factPatternEndingAdjBalance) },
    { label: 'Bonus on Adjustment', value: money(ddv.factPatternAFYD) },
    { label: 'Depreciation This Period', value: money(ddv.deprInPeriod) },
    { label: 'Revision Absorbed (Fed + Bonus)', value: money(ddv.fedRevisionAbsorbed + ddv.bonusRevisionAbsorbed) },
    { label: 'Ending Accum. Depreciation', value: money(ddv.deprEndingAccum), emphasize: true },
    { label: 'Ending Net Book Value', value: money(ddv.deprNetBookValue), emphasize: true }
  ];

  return {
    badgeText: 'Balanced',
    badgeTone: 'blue',
    rows,
    formulaNote: `New basis ${money(ddv.costEndingBalance)}; revision absorbed = ${money(
      ddv.fedRevisionAbsorbed
    )} regular + ${money(ddv.bonusRevisionAbsorbed)} bonus`,
    sections: adjustmentSections(result.steps)
  };
}

// ======================================================
// END: calcAdjustment
// ======================================================

// Ported from Htmls/pages/adjustments.html displayStepResults().
// ======================================================
// Function : adjustmentSections
// Purpose  : Builds the preview sections for an Adjustment from the engine steps.
// ======================================================

function adjustmentSections(s: any): LifecyclePreviewSection[] {
  const sections: LifecyclePreviewSection[] = [
    section('Step 2: Adjustment Type', s.step2 ? [
      ['Adjusted Cost formula', s.step2.formula],
      ['Adjusted Cost calc', s.step2.formulaValues],
      ['Type', s.step2.type],
      ['Original Cost', money(s.step2.originalCost)],
      ['Adjustment', money(s.step2.adjustmentAmount)],
      ['Adjusted Cost', money(s.step2.adjustedCost)]
    ] : []),
    section('Step 3: Timing', s.step3 ? [
      ['Classification formula', 'Compare effectiveDate vs accountingPeriodDate'],
      ['Timing', s.step3.timing],
      ['Backdated Months', String(s.step3.backdatedMonths)]
    ] : []),
    section('Step 4: Bonus on Adjustment', s.step4 ? [
      ['Bonus formula', s.step4.formula],
      ['Bonus calc', s.step4.formulaValues],
      ['Bonus on Adj', money(s.step4.bonusOnAdjustment)],
      ['Remaining Basis formula', 'remainingBasis = adjustmentAmount - bonusOnAdj'],
      ['Remaining Basis calc', `${money(s.step4.bonusOnAdjustment + s.step4.remainingAdjBasis)} - ${money(s.step4.bonusOnAdjustment)} = ${money(s.step4.remainingAdjBasis)}`],
      ['Remaining Basis', money(s.step4.remainingAdjBasis)],
      ['Full Bonus?', s.step4.isFullBonus ? 'Yes' : 'No']
    ] : []),
    section('Step 5: Regular Depr Impact', s.step5 ? [
      ['Rate formula', s.step5.formula],
      ['Monthly Impact calc', s.step5.formulaValues],
      ['Monthly Impact', money(s.step5.monthlyImpact)],
      ['Annual Impact', money(s.step5.annualImpact)],
      ['Current Period', money(s.step5.currentPeriodImpact)]
    ] : []),
    section('Step 6: Revision Absorbed', s.step6 ? [
      ['CY fed_revision formula', s.step6.fedFormula],
      ['CY fed_revision calc', s.step6.fedCalc],
      ['CY fed_revision_absorbed', money(s.step6.fedRevisionAbsorbed)],
      ['PY regular_revision formula', s.step6.pyFormula],
      ['PY regular_revision calc', s.step6.pyCalc],
      ['PY regular_revision_absorbed', money(s.step6.pyRevisionAbsorbed)],
      ['PY bonus_revision_absorbed', money(s.step6.pyBonusRevisionAbsorbed)],
      ['CY bonus_revision_absorbed', money(s.step6.bonusRevisionAbsorbed)],
      ['Total formula', s.step6.totalFormula],
      ['Total calc', s.step6.totalCalc],
      ['Total Revision', money(s.step6.totalRevisionAbsorbed)]
    ] : []),
    section('Step 6B: YTD Total', s.step7 ? [
      ['fed_reg_depr_exp formula', 'fed_reg_depr_exp = currentPeriodDepr + fed_revision'],
      ['fed_reg_depr_exp calc', `${money(s.step5 ? s.step5.currentPeriodImpact : 0)} + ${money(s.step6 ? s.step6.fedRevisionAbsorbed : 0)} = ${money((s.step5 ? s.step5.currentPeriodImpact : 0) + (s.step6 ? s.step6.fedRevisionAbsorbed : 0))}`],
      ['fed_reg_depr_exp', money((s.step5 ? s.step5.currentPeriodImpact : 0) + (s.step6 ? s.step6.fedRevisionAbsorbed : 0))],
      ['ytd_bonus formula', 'ytd_bonus = bonusOnAdj + bonus_revision'],
      ['ytd_bonus', money((s.step4 ? s.step4.bonusOnAdjustment : 0) + (s.step6 ? s.step6.bonusRevisionAbsorbed : 0))],
      ['YTD_DeprExpense', money(s.step7.ytdDeprExpense)],
      ['Total_DeprExpense', money(s.step7.totalDeprExpense)]
    ] : []),
    section('Step 8: Post-Processing', s.step8 ? s.step8.map((c: any): [string, string] => [c.checkName, c.passed ? '✓ Passed' : `✗ off by ${money(c.discrepancy)}`]) : [])
  ];
  return sections.filter((sec) => sec.rows.length > 0);
}

// ======================================================
// END: adjustmentSections
// ======================================================

// ── Retirement / Disposal ───────────────────────────────────────────────
// ======================================================
// Function : calcRetirement
// Purpose  : Performs a calculation for 'calcRetirement'
// ======================================================

function calcRetirement(f: Record<string, unknown>): LifecyclePreviewResult {
  const code = assetCode(f);

  const result = disposalsEngine.calculateDisposal({
    assetCost: num(f, 'cost'),
    pisd: str(f, 'placedInService'),
    disposalDate: str(f, 'disposalDate'),
    accountingPeriodDate: str(f, 'accountingPeriodDate'),
    convention: normConvention(str(f, 'convention', 'HY (Half-Year)'), 'short'),
    depreciationMethod: methodForCode(code),
    recoveryPeriod: num(f, 'recoveryPeriodYears', 5) || 5,
    assetType: code,
    bonusPercentage: num(f, 'bonusPct'),
    boyAccumulatedDepr: num(f, 'boyAccumDepr'),
    monthlyDeprRate: num(f, 'monthlyDeprRate'),
    costDisposed: num(f, 'costDisposed'),
    proceeds: num(f, 'proceeds'),
    basisOverrides: []
  });
  if (result.error) return errorResult(result);

  const ddv = result.steps.step10;
  const nbvDisposed = ddv.proceeds - ddv.gainLoss;
  const label = ddv.gainLoss > 0 ? 'Gain' : ddv.gainLoss < 0 ? 'Loss' : 'No Gain/Loss';

  const rows: LifecyclePreviewResultRow[] = [
    { label: 'Cost Disposed', value: money(ddv.costDisposed) },
    { label: 'A/D Disposed (BOY)', value: money(ddv.adDisposed) },
    { label: 'Current-Year Depreciation to Disposal', value: money(ddv.currentYearDepreciation) },
    { label: 'Revision Absorbed (Backdated)', value: money(ddv.revisionAbsorbed) },
    { label: 'Net Book Value Disposed', value: money(nbvDisposed) },
    { label: 'Proceeds', value: money(ddv.proceeds) },
    { label, value: money(ddv.gainLoss), emphasize: true }
  ];

  return {
    badgeText: label,
    badgeTone: ddv.gainLoss > 0 ? 'green' : ddv.gainLoss < 0 ? 'red' : 'amber',
    rows,
    formulaNote: `${money(ddv.proceeds)} proceeds − ${money(nbvDisposed)} NBV disposed = ${money(ddv.gainLoss)} (${label})`,
    sections: retirementSections(result.steps)
  };
}

// ======================================================
// END: calcRetirement
// ======================================================

// Ported from Htmls/pages/disposals.html displayStepResults().
// ======================================================
// Function : retirementSections
// Purpose  : Builds the preview sections for a Retirement (disposal) from the engine steps.
// ======================================================

function retirementSections(s: any): LifecyclePreviewSection[] {
  const timingLabels: Record<string, string> = {
    current: 'Current Period',
    'backdated-same-year': 'Backdated Same-Year',
    'backdated-prior-year': 'Backdated Prior-Year'
  };
  const isFull = s.step2 && s.step2.disposalType === 'full';
  const sections: LifecyclePreviewSection[] = [
    section('Step 2: Disposal Type', s.step2 ? [
      ['Disposal Type formula', `costDisposed ${isFull ? '==' : '<'} assetCost → ${isFull ? 'Full Disposal' : 'Partial Disposal'}`],
      ['Disposal Type', isFull ? 'Full Disposal' : 'Partial Disposal']
    ] : []),
    section(isFull ? 'Step 3A: Full Disposal' : 'Step 3B: Partial Disposal', s.step3 ? [
      isFull ? ['Disposal Ratio formula', 'Full disposal → ratio = 1.0'] : ['Disposal Ratio formula', 'ratio = costDisposed / assetCost'],
      isFull ? ['Disposal Ratio', '1.0000'] : ['Disposal Ratio', Number(s.step3.disposalRatio).toFixed(4)],
      isFull ? ['A/D Disposed formula', 'A/D_disposed = BOY_A/D (full)'] : ['A/D Disposed formula', 'A/D_disposed = BOY_A/D × ratio'],
      ['Cost Disposed', money(s.step3.costDisposed)],
      ['A/D Disposed', money(s.step3.adDisposed)]
    ] : []),
    section('Step 4: Timing', s.step4 ? [
      ['Classification formula', 'Compare disposalDate vs accountingPeriodDate'],
      ['Classification', timingLabels[s.step4.timing] || s.step4.timing]
    ] : []),
    section('Step 5: Current Period Depr', s.step5 ? [
      s.step5.isSameYearAddRetire
        ? ['CY Depr formula', s.step5.sameYearRule || 'Same-year add-and-retire rule']
        : ['CY Depr formula', 'CY_Depr = fullYearDepr × conventionMultiplier'],
      ...(s.step5.isSameYearAddRetire ? [] : [['CY Depr calc', `${money(s.step5.fullYearDepr)} × ${Number(s.step5.conventionMultiplier).toFixed(4)} = ${money(s.step5.currentYearDepr)}`] as [string, string]]),
      ['Current Year Depr', money(s.step5.currentYearDepr)],
      ['Convention', `${s.step5.convention} (${Number(s.step5.conventionMultiplier).toFixed(4)})`]
    ] : []),
    section('Step 6: Backdated Same-Year', s.step6 ? [
      ['Over-Recognized formula', 'overRecog = monthlyDepr × backdatedMonths'],
      ['Over-Recognized Depr', money(s.step6.overRecognizedDepr)],
      ...(s.step6.overRecognizedConvention != null ? [
        ['Convention Adj formula', 'HY conv adj = fullYearDepr × 0.5'] as [string, string],
        ['Convention Adj', money(s.step6.overRecognizedConvention)] as [string, string]
      ] : []),
      ['Revision formula', 'revision = -(overRecog + convAdj)'],
      ['Revision Absorbed', money(s.step6.revisionAbsorbed)]
    ] : []),
    section('Step 7: Backdated Prior-Year', s.step7 ? [
      ['PY Component formula', 'PY = -(monthsAfterDisposal × monthlyDepr + convAdj)'],
      ['PY Component calc', s.step7.pyCalc || ''],
      ['PY Component', money(s.step7.pyComponent)],
      ['CY Component formula', 'CY = -(monthsInCY_through_M-1 × monthlyDepr)'],
      ['CY Component calc', s.step7.cyCalc || ''],
      ['CY Component', money(s.step7.cyComponent)],
      ['Total Revision formula', 'revision = PY + CY'],
      ['Total Revision calc', s.step7.totalCalc || `${money(s.step7.pyComponent)} + ${money(s.step7.cyComponent)} = ${money(s.step7.revisionAbsorbed)}`],
      ['Revision Absorbed', money(s.step7.revisionAbsorbed)]
    ] : []),
    section('Step 8: Gain/Loss', s.step8 ? [
      ['Gain/Loss formula', 'G/L = proceeds - (costDisposed - A/D_disposed)'],
      ['Gain/Loss calc', `${money(s.step8.proceeds)} - (${money(s.step8.costDisposed)} - ${money(s.step8.adDisposed)}) = ${money(s.step8.gainLoss)}`],
      ['Gain/Loss', `${money(s.step8.gainLoss)} (${s.step8.label})`],
      ['Net Book Value formula', 'NBV = costDisposed - A/D_disposed'],
      ['Net Book Value calc', `${money(s.step8.costDisposed)} - ${money(s.step8.adDisposed)} = ${money(s.step8.netBookValue)}`],
      ['Net Book Value', money(s.step8.netBookValue)]
    ] : []),
    section('Step 11: Post-Processing Validation', s.step11 ? (() => {
      const checks = s.step11 as any[];
      const allPassed = checks.every((c) => c.passed);
      const out: [string, string][] = [['Overall', allPassed ? '✓ All checks passed' : '⚠ Some checks failed']];
      checks.forEach((c) => {
        out.push([c.checkName, c.passed ? '✓ Passed' : '✗ Failed']);
        out.push(['  Expected', money(c.expected)]);
        out.push(['  Actual', money(c.actual)]);
        if (!c.passed && c.discrepancy !== null) out.push(['  Discrepancy', money(c.discrepancy)]);
      });
      return out;
    })() : [])
  ];
  return sections.filter((sec) => sec.rows.length > 0);
}

// ======================================================
// END: retirementSections
// ======================================================

// ── Transfer ─────────────────────────────────────────────────────────────
// ======================================================
// Function : calcTransfer
// Purpose  : Performs a calculation for 'calcTransfer'
// ======================================================

function calcTransfer(f: Record<string, unknown>): LifecyclePreviewResult {
  const totalCost = num(f, 'totalCost');
  const costTransferred = num(f, 'costTransferred');
  const ratio = totalCost > 0 ? costTransferred / totalCost : 0;

  const result = transfersEngine.calculateTransfer({
    totalCost,
    costTransferred,
    totalAD: num(f, 'totalAD'),
    bonusAD: num(f, 'bonusAD'),
    pisd: str(f, 'placedInService'),
    transferDate: str(f, 'transferDate'),
    accountingPeriodDate: str(f, 'accountingPeriodDate'),
    sourceCompany: str(f, 'sourceCompany'),
    destCompany: str(f, 'destCompany'),
    sourceLocation: str(f, 'sourceLocation'),
    destLocation: str(f, 'destLocation'),
    lifeMonths: num(f, 'lifeMonths', 60) || 60,
    convention: normConvention(str(f, 'convention', 'HY')),
    method: 'MACRS',
    monthlyDeprRate: num(f, 'monthlyDeprRate'),
    bonusPercent: num(f, 'bonusPct')
  });
  if (result.error) return errorResult(result);

  const ddv = result.steps.step9;
  const rows: LifecyclePreviewResultRow[] = [
    { label: 'Transfer Ratio', value: `${round2(ratio * 100)}%` },
    { label: 'A/D Transferred (Total)', value: money(ddv.destination.adTransferIn) },
    { label: 'NBV Received at Destination', value: money(ddv.destination.netBookValue), emphasize: true },
    { label: 'Remaining Cost at Source', value: money(ddv.source.costEndingBalance) },
    { label: 'Remaining A/D at Source', value: money(ddv.source.deprEndingAccum) },
    { label: 'Remaining NBV at Source', value: money(ddv.source.netBookValue), emphasize: true },
    {
      label: 'Revision Absorbed (Source / Dest)',
      value: `${money(ddv.source.fedRevisionAbsorbed + ddv.source.bonusRevisionAbsorbed)} / ${money(
        ddv.destination.fedRevisionAbsorbed + ddv.destination.bonusRevisionAbsorbed
      )}`
    }
  ];

  return {
    badgeText: 'Balanced',
    badgeTone: 'blue',
    rows,
    formulaNote: `Transferred ${money(costTransferred)} of ${money(totalCost)} total (${round2(
      ratio * 100
    )}%); A/D allocated pro-rata by bonus/regular split`,
    sections: transferSections(result.steps)
  };
}

// ======================================================
// END: calcTransfer
// ======================================================

// Ported from Htmls/pages/transfers.html displayResults().
// ======================================================
// Function : transferSections
// Purpose  : Builds the preview sections for a Transfer from the engine steps.
// ======================================================

function transferSections(s: any): LifecyclePreviewSection[] {
  const sections: LifecyclePreviewSection[] = [
    section('Step 2: Transfer Type', s.step2 ? [
      ['Transfer Ratio formula', 'ratio = costTransferred / totalCost'],
      ['Transfer Ratio calc', `${money(s.step2.costTransferred)} / ${money(s.step2.costTransferred + s.step2.remainingCost)} = ${(s.step2.transferRatio * 100).toFixed(2)}%`],
      ['Type', s.step2.type],
      ['Transfer Ratio', `${(s.step2.transferRatio * 100).toFixed(2)}%`],
      ['Cost Transferred', money(s.step2.costTransferred)],
      ['Remaining Cost', money(s.step2.remainingCost)]
    ] : []),
    section('Step 3: Scope', s.step3 ? [
      ['Scope', s.step3.scope],
      ['Source', `${s.step3.sourceCompany} / ${s.step3.sourceLocation}`],
      ['Destination', `${s.step3.destCompany} / ${s.step3.destLocation}`]
    ] : []),
    section('Step 4: Timing', s.step4 ? [
      ['Classification formula', 'Compare transferDate vs accountingPeriodDate'],
      ['Timing', s.step4.timing],
      ['Backdated Months', String(s.step4.backdatedMonths)]
    ] : []),
    section('Step 5: A/D Allocation', s.step5 ? [
      ['A/D Transferred formula', 'A/D_transferred = totalA/D × transferRatio'],
      ['A/D Transferred calc', `totalA/D ${money(s.step5.regularAD + s.step5.bonusAD)} × ${(s.step2.transferRatio * 100).toFixed(2)}% = ${money(s.step5.totalADTransferred)}`],
      ['Bonus A/D Transferred', money(s.step5.bonusADTransferred)],
      ['Regular A/D Transferred', money(s.step5.regularADTransferred)],
      ['Total A/D Transferred', money(s.step5.totalADTransferred)],
      ['Remaining A/D', money(s.step5.remainingTotalAD)]
    ] : []),
    section('Step 6: Source Impact', s.step6 ? [
      ['Cost Out formula', 'costOut = costTransferred'],
      ['Cost Transferred Out', money(s.step6.costTransferredOut)],
      ['A/D Transferred Out', money(s.step6.adTransferredOut)],
      ['Remaining Cost', money(s.step6.remainingCost)],
      ['Remaining A/D', money(s.step6.remainingAD)],
      ['Source Depr formula', 'sourceDepr = monthlyRate × monthsThruTransfer'],
      ['Source Depr calc', `${money(s.step6.sourceDeprExpense / (s.step6.sourceDeprMonths || 1))}/mo × ${s.step6.sourceDeprMonths} mo = ${money(s.step6.sourceDeprExpense)}`],
      ['Source Depr Expense', money(s.step6.sourceDeprExpense)]
    ] : []),
    section('Step 7: Destination Impact', s.step7 ? [
      ['Cost Received', money(s.step7.costReceived)],
      ['A/D Received', money(s.step7.adReceived)],
      ['Dest Depr Expense formula', 'destDepr = monthlyRate × remainingMonths'],
      ['Dest Depr Expense', money(s.step7.destDeprExpense)],
      ['Preserved PISD', s.step7.preservedPISD],
      ['Preserved M/L/C', `${s.step7.preservedMethod} / ${s.step7.preservedLife}mo / ${s.step7.preservedConvention}`],
      ['Bonus Note', s.step7.bonusNote]
    ] : []),
    section('Step 8: Revision Absorbed', s.step8 ? [
      ['Source Revision formula', s.step8.sourceFormula],
      ['Source fed_revision', money(s.step8.sourceRevision.fedRevisionAbsorbed)],
      ['Source py_revision', money(s.step8.sourceRevision.pyFedRevision)],
      ['Total Source', money(s.step8.totalSourceRevision)],
      ['Dest Revision formula', s.step8.destFormula],
      ['Dest fed_revision', money(s.step8.destRevision.fedRevisionAbsorbed)],
      ['Dest py_revision', money(s.step8.destRevision.pyFedRevision)],
      ['Total Dest', money(s.step8.totalDestRevision)]
    ] : []),
    section('Step 10: Validation', s.step10 ? s.step10.map((c: any): [string, string] => [c.checkName, c.passed ? '✓ Passed' : `✗ off by ${money(c.discrepancy)}`]) : [])
  ];
  return sections.filter((sec) => sec.rows.length > 0);
}

// ======================================================
// END: transferSections
// ======================================================

// ── Reinstatement ────────────────────────────────────────────────────────
// ======================================================
// Function : calcReinstatement
// Purpose  : Performs a calculation for 'calcReinstatement'
// ======================================================

function calcReinstatement(f: Record<string, unknown>): LifecyclePreviewResult {
  const code = assetCode(f);

  const result = reinstatementsEngine.calculateReinstatement({
    assetType: code,
    originalDisposalDate: str(f, 'originalDisposalDate'),
    reinstatementDate: str(f, 'reinstatementDate'),
    accountingPeriodDate: str(f, 'accountingPeriodDate'),
    originalCost: num(f, 'originalCost'),
    originalADAtDisposal: num(f, 'originalADAtDisposal'),
    originalGainLoss: num(f, 'originalGainLoss'),
    pisd: str(f, 'placedInService'),
    method: methodForCode(code),
    lifeMonths: num(f, 'lifeMonths', 60) || 60,
    convention: normConvention(str(f, 'convention', 'HY (Half-Year)')),
    bonusPercent: num(f, 'bonusPct')
  });
  if (result.error) return errorResult(result);

  const ddv = result.steps.step7;
  const rows: LifecyclePreviewResultRow[] = [
    { label: 'Restored Cost', value: money(ddv.costReinstated) },
    { label: 'Restored A/D (at disposal)', value: money(ddv.adReinstated) },
    { label: 'Gain/Loss Reversal', value: money(ddv.gainLossReversal) },
    { label: 'Resumed Depreciation (this period)', value: money(ddv.deprInPeriod) },
    { label: 'Revision Absorbed', value: money(ddv.fedRevisionAbsorbed) },
    { label: 'Ending Accum. Depreciation', value: money(ddv.deprEndingAccum), emphasize: true },
    { label: 'Ending Net Book Value', value: money(ddv.netBookValue), emphasize: true }
  ];

  const resumedFormula = result.steps.step5 && result.steps.step5.formula;
  return {
    badgeText: 'Balanced',
    badgeTone: 'blue',
    rows,
    formulaNote: resumedFormula || `Resumed depreciation on ${money(ddv.costReinstated)} restored cost = ${money(ddv.deprInPeriod)}`,
    sections: reinstatementSections(result.steps)
  };
}

// ======================================================
// END: calcReinstatement
// ======================================================

// Ported from Htmls/pages/reinstatements.html displayResults().
// ======================================================
// Function : reinstatementSections
// Purpose  : Builds the preview sections for a Reinstatement from the engine steps.
// ======================================================

function reinstatementSections(s: any): LifecyclePreviewSection[] {
  const sections: LifecyclePreviewSection[] = [
    section('Step 2: Timing', s.step2 ? [
      ['Classification formula', 'Compare reinstatementDate vs accountingPeriodDate'],
      ['Timing', s.step2.timing],
      ['Backdated Months', String(s.step2.backdatedMonths)],
      ['Months Disposed', String(s.step2.monthsDisposed)],
      ['Cross-Year', s.step2.crossYear ? 'Yes — Tax approval required' : 'No']
    ] : []),
    section('Step 3: Restore Cost/AD', s.step3 ? [
      ['Restored Cost formula', 'restoredCost = original costDisposed'],
      ['Restored Cost', money(s.step3.restoredCost)],
      ['Restored A/D formula', 'restoredAD = original adDisposed'],
      ['Restored A/D', money(s.step3.restoredAD)],
      ['Restored NBV formula', 'NBV = restoredCost - restoredAD'],
      ['Restored NBV calc', `${money(s.step3.restoredCost)} - ${money(s.step3.restoredAD)} = ${money(s.step3.restoredNBV)}`],
      ['Restored NBV', money(s.step3.restoredNBV)]
    ] : []),
    section('Step 4: Reverse Gain/Loss', s.step4 ? [
      ['Reversal formula', 'reversal = -(original gainLoss)'],
      [`Original ${s.step4.gainLossType}`, money(s.step4.originalGainLoss)],
      ['Reversal Amount', money(s.step4.reversalAmount)]
    ] : []),
    section('Step 5: Resumed Depreciation', s.step5 ? [
      ['Monthly Rate formula', 'monthlyRate from original asset parameters'],
      ['Method/Life/Conv', `${s.step5.method}/${s.step5.lifeMonths}mo/${s.step5.convention}`],
      ['Monthly Rate', money(s.step5.monthlyRate)],
      ['Resumed Depr formula', 'resumedDepr = monthlyRate × monthsResumed'],
      ['Resumed Depr calc', `${money(s.step5.monthlyRate)} × ${s.step5.monthsResumed} = ${money(s.step5.resumedDepr)}`],
      ['Months Resumed', String(s.step5.monthsResumed)],
      ['Resumed Depr', money(s.step5.resumedDepr)]
    ] : []),
    section('Step 6: Revision (Catch-Up)', s.step6 ? [
      ['Catch-Up formula', s.step6.catchUpFormula],
      ['Catch-Up calc', s.step6.catchUpCalc],
      ['Catch-Up Months', String(s.step6.catchUpMonths)],
      ['Catch-Up Depr', money(s.step6.catchUpDepr)],
      ['Revision (CY) formula', s.step6.cyFormula],
      ['Revision (CY)', money(s.step6.revision)],
      ['PY Revision formula', s.step6.pyFormula],
      ['PY Revision', money(s.step6.pyRevision)],
      ['Total formula', s.step6.totalFormula],
      ['Total Revision', money(s.step6.totalRevision)],
      ['Cross-Year Flag', s.step6.crossYearFlag ? '⚠️ Tax approval required' : 'N/A']
    ] : []),
    section('Step 6B: YTD Total', s.step7 ? [
      ['Depr Ending Accum formula', 'deprEndingAccum = restoredAD + resumedDepr + revision'],
      ['Depr Ending Accum', money(s.step7.deprEndingAccum)],
      ['Depr In Period', money(s.step7.deprInPeriod)],
      ['Net Book Value', money(s.step7.netBookValue)]
    ] : []),
    section('Step 8: Validation', s.step8 ? s.step8.map((c: any): [string, string] => [c.checkName, c.passed ? '✓ Passed' : `✗ off by ${money(c.discrepancy)}`]) : [])
  ];
  return sections.filter((sec) => sec.rows.length > 0);
}

// ======================================================
// END: reinstatementSections
// ======================================================

// ── Reclassification ────────────────────────────────────────────────────
// ======================================================
// Function : calcReclassification
// Purpose  : Performs a calculation for 'calcReclassification'
// ======================================================

function calcReclassification(f: Record<string, unknown>): LifecyclePreviewResult {
  const result = reclassificationsEngine.calculateReclassification({
    oldAssetType: str(f, 'oldAssetType'),
    newAssetType: str(f, 'newAssetType'),
    effectiveDate: str(f, 'effectiveDate'),
    accountingPeriodDate: str(f, 'accountingPeriodDate'),
    originalCost: num(f, 'originalCost'),
    existingAD: num(f, 'existingAD'),
    pisd: str(f, 'placedInService'),
    oldMethod: str(f, 'oldMethod', 'MACRS'),
    oldLifeMonths: num(f, 'oldLifeMonths', 60) || 60,
    oldConvention: normConvention(str(f, 'oldConvention', 'HY')),
    oldBonusPercent: num(f, 'oldBonusPct'),
    newMethod: str(f, 'newMethod', 'MACRS'),
    newLifeMonths: num(f, 'newLifeMonths', 60) || 60,
    newConvention: normConvention(str(f, 'newConvention', 'HY')),
    newBonusPercent: num(f, 'newBonusPct')
  });
  if (result.error) return errorResult(result);

  const ddv = result.steps.step7;
  const rows: LifecyclePreviewResultRow[] = [
    { label: 'Previous Method / Life / Convention', value: ddv.previousMLC },
    { label: 'New Method / Life / Convention', value: ddv.newMLC },
    { label: 'Revision (New − Old)', value: money(ddv.fedRevisionAbsorbed), emphasize: true },
    { label: 'Direction', value: ddv.revisionDirection },
    { label: 'Going-Forward Monthly Depreciation', value: money(ddv.goingForwardMonthlyDepr) },
    { label: 'Ending Accum. Depreciation', value: money(ddv.deprEndingAccum), emphasize: true },
    { label: 'Ending Net Book Value', value: money(ddv.netBookValue), emphasize: true }
  ];

  return {
    badgeText: 'Balanced',
    badgeTone: 'amber',
    rows,
    formulaNote: `revision = deprUnderNew − deprUnderOld = ${money(ddv.fedRevisionAbsorbed)} — ${ddv.revisionDirection}`,
    sections: reclassificationSections(result.steps)
  };
}

// ======================================================
// END: calcReclassification
// ======================================================

// Ported from Htmls/pages/reclassifications.html displayResults() — this is
// the exact "Step 2 … Step 8" breakdown shown in the reference calculators'
// Results panel (see additions.html for the same pattern), just for the
// Reclassification event's own step objects.
// ======================================================
// Function : reclassificationSections
// Purpose  : Builds the preview sections for a Reclassification from the engine steps.
// ======================================================

function reclassificationSections(s: any): LifecyclePreviewSection[] {
  const sections: LifecyclePreviewSection[] = [
    section('Step 2: Reclass Type', s.step2 ? [
      ['Change Type', s.step2.changeType],
      ['Old M/L/C', `${s.step2.oldParams.method}/${s.step2.oldParams.lifeMonths}mo/${s.step2.oldParams.convention}`],
      ['New M/L/C', `${s.step2.newParams.method}/${s.step2.newParams.lifeMonths}mo/${s.step2.newParams.convention}`],
      ['Old Bonus', pct(s.step2.oldParams.bonusPercent)],
      ['New Bonus', pct(s.step2.newParams.bonusPercent)]
    ] : []),
    section('Step 3: Timing', s.step3 ? [
      ['Classification formula', 'Compare effectiveDate vs accountingPeriodDate'],
      ['Timing', s.step3.timing],
      ['Backdated Months', String(s.step3.backdatedMonths)]
    ] : []),
    section('Step 4: Old Params Depreciation', s.step4 ? [
      ['Bonus Depr formula', 'bonusDepr = cost × oldBonusPercent'],
      ['Bonus Depr', money(s.step4.bonusDepr)],
      ['Monthly Rate formula', 'monthlyRate = (cost - bonus) × annualRate / 12'],
      ['Monthly Rate', money(s.step4.monthlyRate)],
      ['Months in Service', String(s.step4.monthsInService)],
      ['Regular Depr formula', 'regularDepr = monthlyRate × monthsInService'],
      ['Regular Depr calc', `${money(s.step4.monthlyRate)} × ${s.step4.monthsInService} = ${money(s.step4.regularDepr)}`],
      ['Regular Depr', money(s.step4.regularDepr)],
      ['Total Depr (Old)', money(s.step4.totalDeprOld)]
    ] : []),
    section('Step 5: New Params Depreciation', s.step5 ? [
      ['Bonus Depr formula', 'bonusDepr = cost × newBonusPercent'],
      ['Bonus Depr', money(s.step5.bonusDepr)],
      ['Monthly Rate formula', 'monthlyRate = (cost - bonus) × annualRate / 12'],
      ['Monthly Rate', money(s.step5.monthlyRate)],
      ['Months in Service', String(s.step5.monthsInService)],
      ['Regular Depr formula', 'regularDepr = monthlyRate × monthsInService'],
      ['Regular Depr calc', `${money(s.step5.monthlyRate)} × ${s.step5.monthsInService} = ${money(s.step5.regularDepr)}`],
      ['Regular Depr', money(s.step5.regularDepr)],
      ['Total Depr (New)', money(s.step5.totalDeprNew)]
    ] : []),
    section('Step 6: Revision', s.step6 && s.step6.deprOldFormula ? [
      ['Depr Under Old formula', s.step6.deprOldFormula],
      ['Depr Under Old calc', s.step6.deprOldCalc],
      ['Depr Under Old', money(s.step6.deprUnderOld)],
      ['Depr Under New formula', s.step6.deprNewFormula],
      ['Depr Under New calc', s.step6.deprNewCalc],
      ['Depr Under New', money(s.step6.deprUnderNew)],
      ['Difference formula', s.step6.diffFormula],
      ['Difference calc', s.step6.diffCalc],
      ['Revision (CY) formula', s.step6.cyFormula],
      ['Revision (CY)', money(s.step6.revision)],
      ['PY Revision formula', s.step6.pyFormula],
      ['PY Revision', money(s.step6.pyRevision)],
      ['Total formula', s.step6.totalFormula],
      ['Total calc', s.step6.totalCalc],
      ['Total Revision', money(s.step6.totalRevision)],
      ['Direction', s.step6.direction]
    ] : []),
    section('Step 6B: YTD Total', s.step7 ? [
      ['fed_reg_depr_exp formula', 'fed_reg_depr_exp = newMonthlyRate × monthsInCY + revision'],
      ['fed_reg_depr_exp', money(s.step7.fedRevisionAbsorbed + (s.step5 ? s.step5.regularDepr : 0))],
      ['Going-Forward Monthly', money(s.step7.goingForwardMonthlyDepr)],
      ['Depr Ending Accum', money(s.step7.deprEndingAccum)],
      ['Net Book Value', money(s.step7.netBookValue)]
    ] : []),
    section('Step 8: Validation', s.step8 ? s.step8.map((c: any): [string, string] => [c.checkName, c.passed ? '✓ Passed' : `✗ off by ${money(c.discrepancy)}`]) : [])
  ];
  return sections.filter((sec) => sec.rows.length > 0);
}

// ======================================================
// END: reclassificationSections
// ======================================================

const CALCULATORS: Record<LifecycleEventType, (fields: Record<string, unknown>) => LifecyclePreviewResult> = {
  Addition: calcAddition,
  Adjustment: calcAdjustment,
  Transfer: calcTransfer,
  Retirement: calcRetirement,
  Reinstatement: calcReinstatement,
  Reclassification: calcReclassification
};

// ======================================================
// Function : calculateLifecyclePreview
// Purpose  : Performs a calculation for 'calculateLifecyclePreview'
// ======================================================

export function calculateLifecyclePreview(input: LifecyclePreviewInput): LifecyclePreviewResult {
  const calc = CALCULATORS[input.eventType] ?? calcAddition;
  return calc(input.fields ?? {});
}

// ======================================================
// END: calculateLifecyclePreview
// ======================================================

// ── Scenario projection (Planning page) ─────────────────────────────────
// Not one of the 6 lifecycle cards / standalone calculators — kept as its
// own simplified year-by-year projection for side-by-side "what if" method
// comparisons, independent of the exact-basis engines above.
// ======================================================
// Function : calculateScenarioProjection
// Purpose  : Performs a calculation for 'calculateScenarioProjection'
// ======================================================

export function calculateScenarioProjection(basis: number, scenario: ScenarioInput, years = 4) {
  const rate = 1 / scenario.recoveryPeriodYears;
  const bonus = round2(basis * (scenario.bonusPct / 100));
  const remainingBasis = basis - bonus;

  const projection: number[] = [];
  let firstYear = bonus + remainingBasis * (rate / 2); // half-year first year
  firstYear = round2(firstYear);
  projection.push(firstYear);

  // Year 2 onward repeats Year 1's own $ amount (same bonus%/recovery
  // combination that produced Year 1) rather than straight-lining what's
  // left of the basis — so B and C hold flat at their Year-1 deduction
  // until the basis itself runs out, at which point the remaining amount
  // is capped so the total never exceeds the asset's basis.
  let deducted = firstYear;
  for (let y = 1; y < years; y++) {
    let amt = firstYear;
    if (deducted + amt > basis) amt = round2(basis - deducted);
    projection.push(Math.max(amt, 0));
    deducted += amt;
  }

  return {
    label: scenario.label,
    method: scenario.method,
    yearlyDeduction: projection,
    cumulative: round2(projection.reduce((a, b) => a + b, 0))
  };
}

// ======================================================
// END: calculateScenarioProjection
// ======================================================

// ======================================================
// END: Service Functions
// ======================================================

// ======================================================
// END OF FILE : depreciation.ts
// ======================================================
