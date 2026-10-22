// ======================================================
// File Name : dashboard.ts
// Purpose   : Defines HTTP route handlers for dashboard
// ======================================================

import { Router } from 'express';
import { computeDashboardSummary, computeMonthlyDepreciationForYear } from '../data/activity.js';
import { loadRecentActivity } from '../db/repo.js';
import { resolveBook } from '../data/books.js';
import { primeBookRules } from '../services/book-view.js';


// ======================================================
// START: Route Handlers
// ======================================================

export const dashboardRouter = Router();

// ======================================================
// Function : GET /summary
// Purpose  : Route handler for GET /summary
// Input    : req (HTTP request)
// Output   : res (HTTP response, JSON)
// ======================================================

dashboardRouter.get('/summary', async (req, res) => {
  try {
    const book = resolveBook(req.query.book);
    await primeBookRules();
    res.json(computeDashboardSummary(book));
  } catch (err) {
    console.error('[dashboard summary] failed:', err);
    res.status(500).json({ error: 'Failed to compute dashboard summary' });
  }
});

dashboardRouter.get('/activity', async (_req, res) => {
  try {
    res.json(await loadRecentActivity());
  } catch (err) {
    console.error('[dashboard] activity failed:', err);
    res.status(500).json({ error: 'Failed to load recent activity' });
  }
});

// ======================================================
// Function : GET /monthly-depreciation
// Purpose  : Powers the Monthly Depreciation Expense card's FY dropdown.
//            ?fy=2025 returns 12 real months (Jan–Dec) for that fiscal
//            year — past, current, or future — computed live from each
//            asset's own depreciation schedule (see data/activity.ts).
//            Defaults to the current calendar year and falls back to it
//            on a missing/invalid fy so a bad query string never 500s.
// Input    : req (HTTP request, ?fy=YYYY)
// Output   : res (HTTP response, JSON: { year, months })
// ======================================================

dashboardRouter.get('/monthly-depreciation', async (req, res) => {
  try {
    const book = resolveBook(req.query.book);
    await primeBookRules();
    const currentYear = new Date().getFullYear();
    const parsed = Number(req.query.fy);
    const year = Number.isInteger(parsed) && parsed > 1900 && parsed < 2200 ? parsed : currentYear;
    res.json({ book, year, months: computeMonthlyDepreciationForYear(year, book) });
  } catch (err) {
    // Without this, a thrown error here becomes an unhandled rejection —
    // the request never resolves, and the client's fetch just hangs, which
    // is what left the dashboard stuck on "Loading depreciation…" forever.
    console.error('[monthly-depreciation] failed:', err);
    res.status(500).json({ error: 'Failed to compute monthly depreciation' });
  }
});

// ======================================================
// END: GET /monthly-depreciation
// ======================================================

// ======================================================
// END: GET /summary
// ======================================================

// ======================================================
// END: Route Handlers
// ======================================================

// ======================================================
// END OF FILE : dashboard.ts
// ======================================================
