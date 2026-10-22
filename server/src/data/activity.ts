// ======================================================
// File Name : activity.ts
// Purpose   : In-memory data store / accessors for activity
// ======================================================

import type { Asset, DepreciationScheduleRow, LifecycleActivity } from '../types.js';
import { assets, depreciationSchedules } from './assets.js';
import { ensureSchedules, inServiceDate, round2, toISODate } from '../services/schedule-builder.js';
import { DEFAULT_BOOK } from './books.js';
import { classLabel } from '../services/assetClassLabels.js';
import { scheduleForBook, viewAssetForBook } from '../services/book-view.js';


// ======================================================
// START: Data Functions
// ======================================================

// Every asset actually stores its IRS Pub. 946 asset-class CODE in
// `assetClass` (e.g. '00.12', '00.4') — that's what the Add Asset form and
// the Asset Register filter both write/read (see client/src/data/assetClasses.js
// and components/asset/AssetForm.jsx). This chart used to group by made-up
// category names ('Network Equipment', 'Buildings', ...) that never once
// occur in real data, so ~everything fell through to one fallback color and
// the seeded 0% categories were pure fiction. Short labels for the Table B-1
// codes come from the asset_class_labels table; anything else just shows its raw code.
const FALLBACK_COLORS = ['#2563eb', '#0d9488', '#7c3aed', '#d97706', '#94a3b8', '#dc2626', '#059669', '#ca8a04', '#0891b2', '#be185d'];

// ======================================================
// Function : round1
// Purpose  : Rounds a number to 1 decimal place.
// ======================================================

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ======================================================
// Function : compactMoney
// Purpose  : Short axis/bar label for a dollar amount ($1.2M, $48.2K,
//            $904). Used so the Monthly Depreciation chart can print a
//            real number on each bar instead of a percent that always
//            rounded to zero.
// ======================================================

function compactMoney(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${round2(n / 1e9)}B`;
  if (abs >= 1e6) return `$${round2(n / 1e6)}M`;
  if (abs >= 1e3) return `$${round1(n / 1e3)}K`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

// ======================================================
// Function : monthKey
// Purpose  : Returns the YYYY-MM key for a date (used to bucket monthly depreciation).
// ======================================================

function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7); // YYYY-MM
}

// ======================================================
// Function : monthsInServiceDuringYear
// Purpose  : How many of `year`'s 12 months this asset was actually
//            in service for — starts at its placed-in-service month if
//            that fell in `year` (else Jan), ends at its disposal month
//            if it was retired in `year` (else Dec). Lets a partial
//            first/last year split its stored annual depreciation
//            across only the months it was really on the books, instead
//            of always assuming a full 12.
// ======================================================

export function monthsInServiceDuringYear(
  asset: { taxFactPattern?: { placedInService: string }; status: string; disposal?: { disposalDate: string } },
  year: string
): number {
  // Dates in the store come in several shapes ('2026-03-19', '03/06/2026',
  // 'MAR 19, 2026'). Normalize before slicing — the old code did a raw
  // .slice(5, 7) on whatever string was there, so '03/06/2026' read its
  // start month as "20" and this function returned a nonsense window.
  const pis = toISODate(asset.taxFactPattern?.placedInService);
  const startMonth = pis && pis.startsWith(year) ? Number(pis.slice(5, 7)) : 1;

  let endMonth = 12;
  const disposal = toISODate(asset.disposal?.disposalDate);
  if (asset.status === 'Retired' && disposal && disposal.startsWith(year)) {
    endMonth = Number(disposal.slice(5, 7));
  }

  return Math.min(12, Math.max(endMonth - startMonth + 1, 1));
}

// ======================================================
// END: monthsInServiceDuringYear
// ======================================================

// ======================================================
// Function : computeMonthlyDepreciationForMonths
// Purpose  : The core per-month depreciation calculation, factored out
//            so both the Dashboard's default trailing-6-months view and
//            the FY dropdown (any past, current, or future fiscal year)
//            share one real calculation instead of two copies drifting
//            apart. For each month given:
//             1. Skip the asset entirely for this month if it wasn't in
//                service yet, or was already retired, as of that month.
//             2. Otherwise pull ITS OWN stored depreciation schedule row
//                for the calendar year this month falls in (declining-
//                balance/MACRS — same table the Forecasting page reads),
//                and split that year's total across only the months the
//                asset was actually on the books that year
//                (monthsInServiceDuringYear) — not a blind ÷12, so a
//                first or final partial year lands the right monthly
//                amount instead of over/under-counting it.
//             3. Only when an asset has no stored schedule at all (e.g.
//                added without a tax fact pattern) do we fall back to
//                its flat annualRate ÷ 12 approximation.
//            A month later than today is marked projected: true (its
//            number comes from the asset's own forward schedule row,
//            same table Forecasting uses — not a guess) so the chart can
//            render it distinctly.
// ======================================================

// ======================================================
// Function : assetDepreciationForMonth
// Purpose  : One asset's depreciation dollars for one calendar month —
//            the core per-asset/per-month calculation, factored out so
//            it's shared by the all-assets aggregate below (the
//            Dashboard chart) and computeAssetMonthlyDepreciationForYear
//            (the Asset Detail → Depreciation Schedule year drill-down),
//            instead of the two drifting apart. Same three rules either
//            way: skip if not yet in service or already retired as of
//            this month; otherwise take this calendar year's stored
//            schedule row and split it across only the months the asset
//            was actually on the books that year; fall back to a flat
//            annualRate/12 only when the asset genuinely has no stored
//            schedule at all.
// ======================================================

function assetDepreciationForMonth(
  a: Asset,
  monthStart: string,
  monthEnd: string,
  monthYear: string,
  // The schedule to read. Defaults to the stored (Federal Tax) one; the
  // book-aware callers pass the schedule of the book being viewed.
  rows: DepreciationScheduleRow[] = depreciationSchedules[a.assetNumber] ?? []
): number {

  // In service by the END of this month? inServiceDate falls back
  // through the schedule and disposal date when the tax fact pattern
  // has no placedInService — which is the case for most of the book.
  if (inServiceDate(a, rows) > monthEnd) return 0;

  // Retired assets still depreciate up to and including the month they
  // were disposed in; only drop them from months that START after it.
  const disposal = toISODate(a.disposal?.disposalDate);
  if (a.status === 'Retired' && disposal && disposal < monthStart) return 0;

  // Fully depreciated assets have nothing left to charge.
  if (a.status === 'Fully Depreciated') return 0;

  const yearRow = rows.find((r) => r.year.startsWith(monthYear));
  if (yearRow && yearRow.depreciation > 0) {
    const activeMonthsThisYear = monthsInServiceDuringYear(a, monthYear);
    return yearRow.depreciation / activeMonthsThisYear;
  }

  // No schedule row for this calendar year — the asset is past the end
  // of its recovery period, so it charges nothing. Only fall back to the
  // flat annualRate approximation when there is genuinely no schedule at
  // all for the asset (which ensureSchedules should now prevent).
  if (rows.length === 0 && a.taxFactPattern?.annualRate) {
    return (a.cost * a.taxFactPattern.annualRate) / 100 / 12;
  }
  return 0;
}

// ======================================================
// END: assetDepreciationForMonth
// ======================================================

// ======================================================
// Function : computeMonthlyDepreciationForMonths
// Purpose  : Builds the monthly depreciation series (value, asset count, projected flag) for the given months.
// ======================================================

function computeMonthlyDepreciationForMonths(monthDates: Date[], grossCost: number, book: string = DEFAULT_BOOK) {
  const today = new Date();
  // Each asset as this book sees it (its own method/convention) plus that
  // book's schedule — built once, not once per month.
  const bookAssets = assets.map((a) => ({ view: viewAssetForBook(a, book), rows: scheduleForBook(a, book) }));

  const monthly: { month: string; value: number; assetCount: number; projected: boolean }[] = [];
  for (const monthDate of monthDates) {
    const monthStart = monthDate.toISOString().slice(0, 10);
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
      .toISOString()
      .slice(0, 10);
    const monthYear = String(monthDate.getFullYear());
    const label = monthDate.toLocaleString('en-US', { month: 'short' });
    const projected =
      monthDate.getFullYear() > today.getFullYear() ||
      (monthDate.getFullYear() === today.getFullYear() && monthDate.getMonth() > today.getMonth());

    let assetCount = 0;
    const value = bookAssets.reduce((sum, { view, rows }) => {
      const contribution = assetDepreciationForMonth(view, monthStart, monthEnd, monthYear, rows);
      if (contribution > 0) assetCount += 1;
      return sum + contribution;
    }, 0);

    monthly.push({ month: label, value: round2(value), assetCount, projected });
  }

  // The chart shows DOLLARS, not percent-of-gross-cost. A month's
  // depreciation on a book this size is always a fraction of a percent
  // (~0.0012%), so the old percent figure rounded to "0.0" every month
  // and the card looked broken. pct is still returned for anyone who
  // wants the ratio, but value/valueLabel is what the bars represent.
  return monthly.map((m, idx) => {
    const raw = grossCost > 0 ? (m.value / grossCost) * 100 : 0;
    const prev = idx > 0 ? monthly[idx - 1].value : null;
    let dir: 'up' | 'down' | null = null;
    if (prev !== null) {
      if (m.value > prev + 0.005) dir = 'up';
      else if (m.value < prev - 0.005) dir = 'down';
    }
    const deltaPct = prev !== null && prev > 0 ? round1(((m.value - prev) / prev) * 100) : null;
    return {
      month: m.month,
      value: m.value,
      valueLabel: compactMoney(m.value),
      assetCount: m.assetCount,
      pct: round1(raw),
      pctRaw: raw,
      pctLabel: raw === 0 ? '0' : raw.toFixed(4),
      dir,
      deltaPct,
      projected: m.projected
    };
  });
}

// ======================================================
// END: computeMonthlyDepreciationForMonths
// ======================================================

// ======================================================
// Function : computeMonthlyDepreciationForYear
// Purpose  : The Monthly Depreciation Expense card's FY dropdown reads
//            this — 12 real months (Jan–Dec) for whichever fiscal year
//            the user picks, past or future, computed the exact same
//            way as the default trailing-6 view. A past year comes
//            straight from the asset's actual in-service window and
//            stored schedule for that year; a future year comes from
//            that same schedule's forward rows (real MACRS/straight-line
//            projections, the same numbers Forecasting shows) rather
//            than an estimate invented just for this chart.
// ======================================================

export function computeMonthlyDepreciationForYear(year: number, book: string = DEFAULT_BOOK) {
  ensureSchedules(assets, depreciationSchedules);
  const grossCost = assets.reduce((sum, a) => sum + a.cost, 0);
  const months = Array.from({ length: 12 }, (_, m) => new Date(year, m, 1));
  return computeMonthlyDepreciationForMonths(months, grossCost, book);
}

// ======================================================
// END: computeMonthlyDepreciationForYear
// ======================================================

// ======================================================
// Function : computeAssetMonthlyDepreciationForYear
// Purpose  : Powers the Depreciation Schedule (Federal Tax) drill-down
//            on Asset Detail — clicking a Year row expands it into that
//            year's 12 months, each with its own depreciation dollar
//            amount, using the exact same month-by-month calculation
//            the Dashboard chart uses (assetDepreciationForMonth), just
//            scoped to this one asset instead of summed across the book.
//            Works for a past, current, or future year — a future
//            year's months come from this asset's own forward schedule
//            rows (real MACRS/straight-line projections), same as the
//            Dashboard's FY dropdown and Forecasting.
// ======================================================

export function computeAssetMonthlyDepreciationForYear(asset: Asset, year: number, book: string = DEFAULT_BOOK) {
  ensureSchedules([asset], depreciationSchedules);
  const view = viewAssetForBook(asset, book);
  const rows = scheduleForBook(asset, book);
  const today = new Date();
  const months = Array.from({ length: 12 }, (_, m) => new Date(year, m, 1));

  return months.map((monthDate) => {
    const monthStart = monthDate.toISOString().slice(0, 10);
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
      .toISOString()
      .slice(0, 10);
    const monthYear = String(monthDate.getFullYear());
    const projected =
      monthDate.getFullYear() > today.getFullYear() ||
      (monthDate.getFullYear() === today.getFullYear() && monthDate.getMonth() > today.getMonth());
    const value = round2(assetDepreciationForMonth(view, monthStart, monthEnd, monthYear, rows));

    return {
      month: monthDate.toLocaleString('en-US', { month: 'long' }),
      shortMonth: monthDate.toLocaleString('en-US', { month: 'short' }),
      value,
      valueLabel: compactMoney(value),
      projected
    };
  });
}

// ======================================================
// END: computeAssetMonthlyDepreciationForYear
// ======================================================

// ======================================================
// Function : computeDashboardSummary
// Purpose  : Builds the Dashboard KPI cards (Total Assets, Gross Cost,
//            Net Book Value, YTD Depreciation), the Monthly Depreciation
//            Expense chart, and the Assets by Class donut — ALL derived
//            live from the current `assets` store, so they move as
//            assets are added/edited/retired/reinstated instead of
//            sitting on fixed demo numbers.
// ======================================================

export function computeDashboardSummary(book: string = DEFAULT_BOOK) {
  // A "Retired" asset has been disposed — it's no longer part of the
  // active book. Previously totalAssets/grossCost/netBookValue/assetsByClass
  // summed every asset unconditionally, including retired ones. That's how
  // a fully-disposed $339.3M asset (845603468 — its `nbv` was never zeroed
  // out when it was retired, a data bug in the disposal write path, not
  // here) ended up silently accounting for ~97% of every dashboard total.
  // The dashboard should reflect the current book regardless of whether a
  // disposal record was written correctly, so retired assets are excluded
  // from every aggregate below — the same convention the monthly
  // depreciation chart already uses for retired-before-the-period assets.
  // Every asset as the chosen book sees it — Federal Tax is the stored
  // data untouched; other books apply their own rules (services/book-view.ts).
  const activeBook = assets.map((a) => viewAssetForBook(a, book)).filter((a) => a.status !== 'Retired');

  const totalAssets = activeBook.length;
  const grossCost = activeBook.reduce((sum, a) => sum + a.cost, 0);
  const netBookValue = activeBook.reduce((sum, a) => sum + a.nbv, 0);
  const ytdDepreciation = activeBook.reduce((sum, a) => sum + a.accumDepreciation, 0);

  const now = new Date();
  const currentMonthKey = monthKey(now);
  const addedThisPeriod = activeBook.filter(
    (a) => a.taxFactPattern?.placedInService?.startsWith(currentMonthKey)
  ).length;

  // No prior-period snapshot is kept, so the YTD deltas are derived
  // straight from what's on hand: cost added this calendar year as a
  // share of the book, and total depreciation taken as a share of cost.
  const currentYear = String(now.getFullYear());
  const costAddedYtd = activeBook
    .filter((a) => a.taxFactPattern?.placedInService?.startsWith(currentYear))
    .reduce((sum, a) => sum + a.cost, 0);
  const grossCostYtdDeltaPct = grossCost > 0 ? round1((costAddedYtd / grossCost) * 100) : 0;
  const depreciationDeltaPct = grossCost > 0 ? -round1((ytdDepreciation / grossCost) * 100) : 0;

  // Monthly Depreciation Expense — see computeMonthlyDepreciationForMonths
  // below for how each individual month is worked out. The Dashboard card
  // itself always opens on the trailing 6 months ending with the current
  // one; the FY dropdown on the card calls computeMonthlyDepreciationForYear
  // (also below) for any other year the user picks, past or future.
  ensureSchedules(assets, depreciationSchedules);

  const trailing6 = [5, 4, 3, 2, 1, 0].map(
    (i) => new Date(now.getFullYear(), now.getMonth() - i, 1)
  );
  const monthlyDepreciationChart = computeMonthlyDepreciationForMonths(trailing6, grossCost, book);

  // Assets by Class — grouped by NBV share, matching the "By NBV" label
  // already on the card. Grouped by each asset's actual IRS class code
  // (falling back to "Unclassified" for a blank one), not by invented
  // category names — only codes that are really present in the book show
  // up, each with a real percentage.
  const classTotals = new Map<string, number>();
  for (const a of activeBook) {
    const code = a.assetClass?.trim() || 'Unclassified';
    classTotals.set(code, (classTotals.get(code) ?? 0) + a.nbv);
  }
  const assetsByClass = [...classTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([code, nbv], i) => {
      const label = classLabel(code);
      const color = FALLBACK_COLORS[i % FALLBACK_COLORS.length];
      const pct = netBookValue > 0 ? Math.round((nbv / netBookValue) * 100) : 0;
      return { label, pct, color };
    });

  return {
    book,
    totalAssets,
    addedThisPeriod,
    grossCost,
    grossCostYtdDeltaPct,
    netBookValue,
    depreciationDeltaPct,
    ytdDepreciation,
    monthlyDepreciation: monthlyDepreciationChart,
    assetsByClass
  };
}

// ======================================================
// Function : computeForecast
// Purpose  : Builds the Forecasting page (KPIs, 5-Year Expense chart,
//            Capital Roll-Forward table) from each asset's own stored
//            depreciation schedule (real MACRS/Straight-Line rows,
//            already computed at capitalization time) instead of a
//            fixed 5-year demo table. 5 years starting with the
//            current calendar year, summed asset-by-asset; an asset
//            drops out of every year at/after its actual disposal
//            date and contributes its written-off NBV to that year's
//            "retirements" line instead. Company / Asset Type narrow
//            the same computation down to that slice of the book —
//            "All Companies" / "All Types" (the defaults) keep it
//            portfolio-wide, same as before this filter existed.
// ======================================================

export function computeForecast(yearCount = 5, filters: { company?: string[]; assetType?: string[] } = {}, book: string = DEFAULT_BOOK) {
  const span = Math.min(10, Math.max(1, Math.round(yearCount) || 5));
  const now = new Date();
  const currentYear = now.getFullYear();
  const years = Array.from({ length: span }, (_, i) => currentYear + i);

  // Each filter is a checked-set of values (checkbox multi-select on the
  // client) rather than a single choice — an empty/undefined list means
  // "nothing narrowed, keep the whole portfolio", same as before.
  const scopedAssets = assets.filter((a) => (!filters.company?.length || filters.company.includes(a.company)) &&
    (!filters.assetType?.length || filters.assetType.includes(a.assetClass)));

  // Each asset's schedule and NBV as the chosen book sees them.
  const bookRows = new Map<string, DepreciationScheduleRow[]>();
  const bookNbv = new Map<string, number>();
  for (const a of scopedAssets) {
    bookRows.set(a.assetNumber, scheduleForBook(a, book));
    bookNbv.set(a.assetNumber, viewAssetForBook(a, book).nbv);
  }

  function scheduleRowForYear(assetNumber: string, year: number) {
    const rows = bookRows.get(assetNumber) ?? [];
    return rows.find((r) => r.year.startsWith(String(year)));
  }

  function disposalYear(disposalDate: string | undefined): number | null {
    return disposalDate ? Number(disposalDate.slice(0, 4)) : null;
  }

  const rollForward = years.map((year) => {
    let openingNbv = 0;
    let depreciation = 0;
    let closingNbv = 0;
    let additions = 0;
    let retirements = 0;

    for (const a of scopedAssets) {
      const dYear = a.status === 'Retired' ? disposalYear(a.disposal?.disposalDate) : null;
      const stillInScheduleForYear = dYear === null || dYear > year;

      if (stillInScheduleForYear) {
        const row = scheduleRowForYear(a.assetNumber, year);
        if (row) {
          openingNbv += row.openingNbv;
          depreciation += row.depreciation;
          closingNbv += row.closingNbv;
        } else {
          // No stored depreciation schedule for this asset (it was
          // added without a tax fact pattern/method, e.g. via the
          // quick Add Asset form). There's no rate on file to project
          // forward with, so it honestly carries at its current NBV
          // rather than assuming a depreciation curve we don't have.
          const nbv = bookNbv.get(a.assetNumber) ?? a.nbv;
          openingNbv += nbv;
          closingNbv += nbv;
        }
      }

      if (a.taxFactPattern?.placedInService && Number(a.taxFactPattern.placedInService.slice(0, 4)) === year) {
        additions += a.cost;
      }
      if (dYear === year && a.disposal) {
        retirements += a.cost - a.disposal.adAtDisposal;
      }
    }

    return {
      year,
      openingNbv,
      additions,
      depreciation: -depreciation,
      retirements: -retirements,
      closingNbv
    };
  });

  const expenseByYear = rollForward.map((r) => ({ year: r.year, millions: round1(-r.depreciation / 1e6) }));

  const currentNbv = scopedAssets.reduce((sum, a) => sum + (bookNbv.get(a.assetNumber) ?? a.nbv), 0);
  const thisYearDepr = -rollForward[0].depreciation;
  const nextYearDepr = -rollForward[Math.min(1, rollForward.length - 1)].depreciation;
  const projectedDepreciationDeltaPct = thisYearDepr > 0 ? round1(((nextYearDepr - thisYearDepr) / thisYearDepr) * 100) : 0;

  // No forward capital-project pipeline is tracked in this app yet, so
  // Planned CapEx honestly reflects that — nothing planned means $0,
  // not a placeholder guess.
  const plannedCapEx = 0;
  const plannedCapExProjects = 0;

  let assetsFullyDepreciatingNextFY = 0;
  for (const a of scopedAssets) {
    const rows = bookRows.get(a.assetNumber) ?? [];
    const zeroRow = rows.find((r) => r.closingNbv <= 1);
    if (zeroRow && zeroRow.year.startsWith(String(years[Math.min(1, years.length - 1)]))) assetsFullyDepreciatingNextFY += 1;
  }

  const projectedEndingNbv = rollForward[rollForward.length - 1].closingNbv;
  const projectedEndingNbvDeltaPct = currentNbv > 0 ? round1(((projectedEndingNbv - currentNbv) / currentNbv) * 100) : 0;

  return {
    book,
    kpis: {
      projectedDepreciationNextFY: nextYearDepr,
      projectedDepreciationDeltaPct,
      plannedCapEx,
      plannedCapExProjects,
      assetsFullyDepreciatingNextFY,
      projectedEndingNbv,
      projectedEndingNbvDeltaPct
    },
    expenseByYear,
    rollForward
  };
}

// ======================================================
// END: Data Functions
// ======================================================

// ======================================================
// END OF FILE : activity.ts
// ======================================================
