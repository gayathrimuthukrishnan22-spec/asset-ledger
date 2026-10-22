// ======================================================
// File Name : modeling.ts
// Purpose   : Defines HTTP route handlers for modeling
// ======================================================

import { Router } from 'express';
import { calculateScenarioProjection, round2 } from '../services/depreciation.js';
import type { ScenarioInput } from '../types.js';
import { assets } from '../data/assets.js';
import { DEFAULT_BOOK, resolveBook } from '../data/books.js';
import { loadAppSetting, loadModelingScenarios } from '../db/repo.js';
import { primeBookRules, scheduleForBook } from '../services/book-view.js';


// ======================================================
// START: Route Handlers
// ======================================================

export const modelingRouter = Router();

const MODELING_BASIS_KEY = 'modelingBasis';

// Default basis + scenarios come from the DB (app_settings 'modelingBasis' + modeling_scenarios).
async function modelingDefaults(): Promise<{ basis: number; scenarios: ScenarioInput[] }> {
  const [basisRaw, scenarios] = await Promise.all([loadAppSetting(MODELING_BASIS_KEY), loadModelingScenarios()]);
  const basis = Number(basisRaw);
  if (!Number.isFinite(basis) || !scenarios.length) throw new Error('modeling defaults missing - run db/config-tables.sql');
  return { basis, scenarios: scenarios as ScenarioInput[] };
}

// ======================================================
// Function : GET /scenarios
// Purpose  : Route handler for GET /scenarios
// Input    : req (HTTP request)
// Output   : res (HTTP response, JSON)
// ======================================================

modelingRouter.get('/scenarios', async (_req, res) => {
  try {
    res.json(await modelingDefaults());
  } catch (err) {
    console.error('[modeling] defaults failed:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Could not load modeling defaults' });
  }
});

// ======================================================
// Function : baselineFromSchedules
// Purpose  : Scenario A (Baseline) for a filtered slice of the book.
//            The simplified formula collapses to $0.00 in every year
//            after year 1 whenever the asset's own election is a 100%
//            bonus, so the "next years" of the baseline looked empty.
//            Instead, predict each future year from the assets' OWN
//            forward depreciation schedules (same source the
//            Forecasting page uses), summed asset-by-asset by calendar
//            year. An asset stops contributing from its disposal year.
// Input    : assetNumbers, startYear, years
// Output   : { yearlyDeduction, cumulative }
// ======================================================
function baselineFromSchedules(assetNumbers: string[], startYear: number, years: number, book: string = DEFAULT_BOOK) {
  const wanted = new Set(assetNumbers);
  const yearly: number[] = Array.from({ length: years }, () => 0);

  for (const a of assets) {
    if (!wanted.has(a.assetNumber)) continue;
    const dYear = a.status === 'Retired' && a.disposal?.disposalDate ? Number(a.disposal.disposalDate.slice(0, 4)) : null;
    const rows = scheduleForBook(a, book);
    for (let i = 0; i < years; i++) {
      const year = startYear + i;
      if (dYear !== null && dYear <= year) continue;
      const row = rows.find((r) => r.year.startsWith(String(year)));
      if (row) yearly[i] += row.depreciation;
    }
  }

  const yearlyDeduction = yearly.map((v) => Math.round(v * 100) / 100);
  const cumulative = Math.round(yearlyDeduction.reduce((x, y) => x + y, 0) * 100) / 100;
  return { yearlyDeduction, cumulative };
}

// POST /api/modeling/compare — { basis?: number, scenarios: ScenarioInput[], baselineAssetNumbers?: string[], startYear?: number, bonusPctByYear?: number[] }
modelingRouter.post('/compare', async (req, res) => {
  const book = resolveBook(req.body?.book);
  await primeBookRules();
  const defaults = await modelingDefaults();
  const basis = Number(req.body?.basis ?? defaults.basis);
  const scenarios: ScenarioInput[] = req.body?.scenarios ?? defaults.scenarios;
  const baselineAssetNumbers: string[] = Array.isArray(req.body?.baselineAssetNumbers) ? req.body.baselineAssetNumbers : [];
  const startYear = Number(req.body?.startYear) || new Date().getFullYear();
  const bonusPctByYear: number[] = Array.isArray(req.body?.bonusPctByYear) ? req.body.bonusPctByYear.map(Number) : [];

  // Scenario A ("1st table") is computed first — from the filtered assets'
  // own real schedules when a slice of the book is picked, otherwise the
  // generic Method/Bonus/Recovery projection. Its year-by-year value is
  // the "final value" the person predicts with confidence, and that same
  // number is what B and C each build on: B = A's year value + bonus-1%
  // (+ bonus-2% if given, per year via bonusPctByYear), C = A's year value
  // + Scenario C's flat Bonus %. Year N's A value already carries forward
  // into year N+1 on its own (baselineFromSchedules walks the real
  // schedule forward; the generic projection holds its own basis-capped
  // run rate), so B and C automatically roll forward with it instead of
  // being computed as independent, disconnected projections — which used
  // to make C run out and show $0.00 once its own basis fully depreciated
  // even though A (and therefore the "real" picture) was still ongoing.
  const aProjected = calculateScenarioProjection(basis, scenarios[0]);
  const aResult = baselineAssetNumbers.length > 0
    ? { ...aProjected, ...baselineFromSchedules(baselineAssetNumbers, startYear, aProjected.yearlyDeduction.length, book) }
    : aProjected;
  const aYearly = aResult.yearlyDeduction;

  const results = scenarios.map((s, i) => {
    if (i === 0) return aResult;

    const pctForYear = (yearIdx: number) => {
      if (i === 1) {
        // Scenario B — per-year override table, one flat % repeated when
        // no per-year overrides are given.
        if (bonusPctByYear.length > 0)
          return bonusPctByYear[Math.min(yearIdx, bonusPctByYear.length - 1)];
        return s.bonusPct;
      }
      // Scenario C — single flat Bonus % every year.
      return s.bonusPct;
    };

    const yearlyDeduction = aYearly.map((aVal, yearIdx) => round2(aVal * (1 + pctForYear(yearIdx) / 100)));
    const cumulative = round2(yearlyDeduction.reduce((x, y) => x + y, 0));
    const projected = calculateScenarioProjection(basis, s);
    return {
      ...projected,
      yearlyDeduction,
      cumulative,
      aValues: aYearly,
      ...(i === 1 ? { bonusPctByYear: aYearly.map((_, yearIdx) => pctForYear(yearIdx)) } : {})
    };
  });
  res.json({ book, basis, results });
});

// ======================================================
// END: GET /scenarios
// ======================================================

// ======================================================
// END: Route Handlers
// ======================================================

// ======================================================
// END OF FILE : modeling.ts
// ======================================================
