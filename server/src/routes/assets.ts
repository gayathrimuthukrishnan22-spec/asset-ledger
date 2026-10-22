// ======================================================
// File Name : assets.ts
// Purpose   : Defines HTTP route handlers for assets
// ======================================================

import { Router } from 'express';
import { assets, depreciationSchedules, ensureTaxFactPatterns, findAsset, persist, timelines } from '../data/assets.js';
import { computeAssetMonthlyDepreciationForYear } from '../data/activity.js';
import { ensureSchedules } from '../services/schedule-builder.js';
import { resolveBook } from '../data/books.js';
import { primeBookRules, scheduleForBook, syncBookEntries, viewAssetForBook, viewAssetsForBook } from '../services/book-view.js';


// ======================================================
// START: Route Handlers
// ======================================================

export const assetsRouter = Router();

// GET /api/assets?assetClass=&company=&status=&method=&q=
// ======================================================
// Function : GET /
// Purpose  : Route handler for GET /
// Input    : req (HTTP request)
// Output   : res (HTTP response, JSON)
// ======================================================

assetsRouter.get('/', async (req, res) => {
  const { assetClass, company, status, method, q } = req.query as Record<string, string | undefined>;
  // ?book= picks which book's view of the assets to return (default Federal Tax).
  const book = resolveBook(req.query.book);
  await primeBookRules();

  let results = viewAssetsForBook(assets, book);
  if (assetClass && assetClass !== 'All Classes') results = results.filter((a) => a.assetClass === assetClass);
  if (company && company !== 'All Companies') results = results.filter((a) => a.company === company);
  if (status) results = results.filter((a) => a.status === status);
  if (method && method !== 'All Methods') results = results.filter((a) => a.method === method);
  if (q) {
    const needle = q.toLowerCase();
    results = results.filter(
      (a) => a.assetNumber.includes(needle) || a.description.toLowerCase().includes(needle)
    );
  }

  res.json({
    book,
    total: results.length,
    items: results
  });
});

// POST /api/assets — capitalize a new asset (in-memory only, for the Add Asset page).
assetsRouter.post('/', async (req, res) => {
  await primeBookRules();
  const body = req.body as Partial<(typeof assets)[number]>;
  const assetNumber = (body.assetNumber ?? String(800000000 + Math.floor(Math.random() * 90000000))).trim();
  const cost = body.cost ?? 0;

  // One asset number, one asset — never capitalize the same number twice.
  if (findAsset(assetNumber)) {
    res.status(409).json({ error: `Asset ${assetNumber} already exists — an asset number can only have one Addition.` });
    return;
  }

  const newAsset = {
    assetNumber,
    description: body.description ?? 'Untitled Asset',
    assetClass: body.assetClass ?? 'Machinery',
    company: body.company ?? '5B',
    cost,
    accumDepreciation: 0,
    nbv: cost,
    method: body.method ?? 'Straight-Line',
    status: 'Active' as const
  };

  assets.push(newAsset);
  // Same as a lifecycle Addition: build the Federal schedule + fact pattern, then one stored entry per book.
  ensureSchedules([newAsset], depreciationSchedules);
  ensureTaxFactPatterns([newAsset], depreciationSchedules);
  syncBookEntries([newAsset]);
  persist();
  res.status(201).json(newAsset);
});

// ======================================================
// END: GET /
// ======================================================

// ======================================================
// Function : GET /:assetNumber
// Purpose  : Route handler for GET /:assetNumber
// Input    : req (HTTP request)
// Output   : res (HTTP response, JSON)
// ======================================================

assetsRouter.get('/:assetNumber', async (req, res) => {
  const book = resolveBook(req.query.book);
  await primeBookRules();
  const asset = findAsset(req.params.assetNumber);
  if (!asset) {
    res.status(404).json({ error: 'Asset not found' });
    return;
  }
  // Safety net for an asset created mid-session (Add Asset page, a
  // placeholder from Adjustment/Transfer posted against an unknown
  // number) that missed the boot-time backfill in initStore — the
  // Overview tab's Tax Fact Pattern table should never fall back to
  // "no fact pattern on file" just because of when the asset was made.
  if (!asset.taxFactPattern) {
    ensureSchedules([asset], depreciationSchedules);
    const filled = ensureTaxFactPatterns([asset], depreciationSchedules);
    if (filled.length > 0) persist();
  }
  res.json({
    book,
    asset: viewAssetForBook(asset, book),
    timeline: timelines[asset.assetNumber] ?? [],
    depreciationSchedule: scheduleForBook(asset, book)
  });
});

// ======================================================
// END: GET /:assetNumber
// ======================================================

// GET /api/assets/:assetNumber/monthly-depreciation?year=YYYY
// ======================================================
// Function : GET /:assetNumber/monthly-depreciation
// Purpose  : Powers the "click a Year row to see its months" drill-down
//            on Asset Detail → Depreciation Schedule (Federal Tax).
//            Returns this one asset's 12 months of depreciation for the
//            clicked year, computed live from its own stored schedule —
//            past, current, or future year all work, same as the
//            Dashboard's monthly-depreciation endpoint. Defaults to the
//            current calendar year and falls back to it on a
//            missing/invalid year so a bad query string never 500s.
// Input    : req (HTTP request, ?year=YYYY)
// Output   : res (HTTP response, JSON: { year, months })
// ======================================================

assetsRouter.get('/:assetNumber/monthly-depreciation', async (req, res) => {
  try {
    const book = resolveBook(req.query.book);
    await primeBookRules();
    const asset = findAsset(req.params.assetNumber);
    if (!asset) {
      res.status(404).json({ error: 'Asset not found' });
      return;
    }
    const currentYear = new Date().getFullYear();
    const parsed = Number(req.query.year);
    const year = Number.isInteger(parsed) && parsed > 1900 && parsed < 2200 ? parsed : currentYear;
    res.json({ book, year, months: computeAssetMonthlyDepreciationForYear(asset, year, book) });
  } catch (err) {
    console.error('[asset monthly-depreciation] failed:', err);
    res.status(500).json({ error: 'Failed to compute monthly depreciation' });
  }
});

// ======================================================
// END: GET /:assetNumber/monthly-depreciation
// ======================================================

// ======================================================
// END: Route Handlers
// ======================================================

// ======================================================
// END OF FILE : assets.ts
// ======================================================
