// ======================================================
// File Name : assets.ts
// Purpose   : Accessors for the asset book. Postgres (Neon) is now the
//             SOURCE OF TRUTH (see db/repo.ts): the arrays below are a
//             request-path working set hydrated from Postgres at boot
//             and written back through on every mutation.
//
//             server/data-store.json is no longer authoritative. It is
//             kept only as an optional local mirror for eyeballing
//             state during development, behind LOCAL_JSON_MIRROR=1.
// ======================================================


import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hydrate, queueFlush, registerSnapshotSource, flushNow } from '../db/repo.js';
import { buildSchedule, ensureSchedules, inServiceDate, recoveryYears } from '../services/schedule-builder.js';
import { syncBookEntries } from '../services/book-view.js';
import type {
  Asset,
  BookEntries,
  DepreciationScheduleRow,
  LifecycleEventType,
  LifecyclePreviewResult,
  LifecyclePreviewResultRow,
  TimelineEntry
} from '../types.js';



// ======================================================
// START: Data Functions
// ======================================================

// ---------- JSON-file persistence ----------
// Resolves to <server>/data-store.json whether running from src (tsx) or
// from the compiled dist/ output — both sit two levels under the server
// root (src/data/assets.ts or dist/data/assets.js).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_PATH = path.join(__dirname, '..', '..', 'data-store.json');

type StoreShape = {
  assets: Asset[];
  timelines: Record<string, TimelineEntry[]>;
  depreciationSchedules: Record<string, DepreciationScheduleRow[]>;
  bookEntries?: BookEntries;
};

// ======================================================
// Function : persist
// Purpose  : Writes the current in-memory assets/timelines/schedules to
//            data-store.json. Called after every mutation so a server
//            restart picks up right where the session left off.
// ======================================================

export function persist(): void {
  // ClickHouse write-behind — serialized, one flush in flight at a time.
  queueFlush();

  // Optional local mirror, dev convenience only. Never read back.
  if (process.env.LOCAL_JSON_MIRROR === '1') {
    const snapshot: StoreShape = { assets, timelines, depreciationSchedules, bookEntries };
    try {
      fs.writeFileSync(STORE_PATH, JSON.stringify(snapshot, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to write local JSON mirror:', err);
    }
  }
}

// ======================================================
// Function : persistNow
// Purpose  : Awaitable version, for shutdown hooks and scripts.
// ======================================================

export async function persistNow(): Promise<void> {
  await flushNow();
}

// ======================================================
// END: persist
// ======================================================

// ======================================================
// Function : readJsonSeed
// Purpose  : One-time bootstrap only. If ClickHouse comes back empty on
//            first boot, prefer an existing data-store.json (a prior
//            session's real work), so nobody loses data when switching the store over.
// ======================================================

function readJsonSeed(): StoreShape | null {
  try {
    if (!fs.existsSync(STORE_PATH)) return null;
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8')) as Partial<StoreShape>;
    if (!Array.isArray(parsed.assets) || parsed.assets.length === 0) return null;
    return {
      assets: parsed.assets,
      timelines: parsed.timelines ?? {},
      depreciationSchedules: parsed.depreciationSchedules ?? {}
    };
  } catch (err) {
    console.error('Could not read data-store.json for bootstrap:', err);
    return null;
  }
}

// ======================================================
// END: readJsonSeed
// ======================================================

// The live working set. Empty until initStore() has run — index.ts
// awaits it before the server starts listening, so no request can ever
// observe an unhydrated book.
export const assets: Asset[] = [];
export const depreciationSchedules: Record<string, DepreciationScheduleRow[]> = {};
export const timelines: Record<string, TimelineEntry[]> = {};
// One stored entry (+ schedule) per asset PER BOOK — asset -> book -> entry.
export const bookEntries: BookEntries = {};

registerSnapshotSource(() => ({ assets, timelines, depreciationSchedules, bookEntries }));

// ======================================================
// Function : replaceContents
// Purpose  : Replaces the in-memory assets, timelines and schedules with the contents of a loaded snapshot.
// ======================================================

function replaceContents(snapshot: StoreShape): void {
  assets.length = 0;
  assets.push(...snapshot.assets);
  for (const k of Object.keys(timelines)) delete timelines[k];
  Object.assign(timelines, snapshot.timelines);
  for (const k of Object.keys(depreciationSchedules)) delete depreciationSchedules[k];
  Object.assign(depreciationSchedules, snapshot.depreciationSchedules);
  for (const k of Object.keys(bookEntries)) delete bookEntries[k];
  Object.assign(bookEntries, snapshot.bookEntries ?? {});
}

// ======================================================
// Function : ensureTaxFactPatterns
// Purpose  : Backfills a Tax Fact Pattern for every asset that lacks one
//            (12 of the 16 seeded assets never had one — only assets
//            that went through a Lifecycle "Addition" ever got a
//            taxFactPattern block). Asset Detail → Overview always
//            renders this table now instead of falling back to "No
//            detailed fact pattern on file", so every asset needs a
//            real one, not just the ones that happened to be added
//            through that one form. Derives it from whatever the asset
//            already carries (method, asset class, its own depreciation
//            schedule) using the exact same helpers buildSchedule()
//            uses, so the numbers shown here match the schedule below
//            it rather than being invented separately.
//            Returns the asset numbers it filled in, for the boot log.
// ======================================================

// ======================================================
// Function : conventionLabel
// Purpose  : Maps a method description to its convention label (Mid-Month, Mid-Quarter or Half-Year).
// ======================================================

function conventionLabel(method: string): string {
  const m = method.toLowerCase();
  if (m.includes('mid-month') || m.includes('mid month')) return 'Mid-Month';
  if (m.includes('mid-quarter') || m.includes('mid quarter') || m.includes('mq')) return 'Mid-Quarter';
  return 'Half-Year';
}

// ======================================================
// Function : propertyTypeFor
// Purpose  : Returns Real Property for 39 / 27.5 year lives, otherwise Personal Property.
// ======================================================

function propertyTypeFor(life: number): string {
  return life === 39 || life === 27.5 ? 'Real Property' : 'Personal Property';
}

// ======================================================
// Function : ensureTaxFactPatterns
// Purpose  : Fills in the tax fact pattern (in-service date, recovery period, method, convention, rate) for assets that lack one; returns the asset numbers it filled.
// ======================================================

export function ensureTaxFactPatterns(
  assetList: Asset[],
  schedules: Record<string, DepreciationScheduleRow[]>
): string[] {
  const filled: string[] = [];
  const currentYear = new Date().getFullYear();

  for (const asset of assetList) {
    if (asset.taxFactPattern) continue;

    const life = recoveryYears(asset);
    const schedule = schedules[asset.assetNumber] ?? [];
    // Prefer this year's own row so the rate matches what's currently
    // depreciating; fall back to the schedule's first row, then to a
    // straight-line estimate when there's no schedule at all (e.g. a
    // zero-cost asset, which buildSchedule() skips).
    const currentRow = schedule.find((r) => r.year.startsWith(String(currentYear))) ?? schedule[0];
    const annualRate = currentRow?.rate ?? Math.round((100 / life) * 100) / 100;

    asset.taxFactPattern = {
      placedInService: inServiceDate(asset, schedule),
      recoveryPeriod: `${Number.isInteger(life) ? life : life.toFixed(1)} years`,
      method: asset.method || 'MACRS',
      convention: conventionLabel(asset.method || ''),
      bonusPct: 0,
      annualRate,
      propertyType: propertyTypeFor(life)
    };
    filled.push(asset.assetNumber);
  }

  return filled;
}

// ======================================================
// END: ensureTaxFactPatterns
// ======================================================

// ======================================================
// Function : initStore
// Purpose  : Boot-time hydration. Postgres first; if it has no assets
//            yet, bootstrap it from data-store.json  and write that straight back so Postgres
//            becomes authoritative from the very first run.
//            Throws if Postgres is unreachable — the app must NOT
//            quietly fall back to a JSON file and pretend it has a
//            database.
// ======================================================

export async function initStore(): Promise<{ source: string; assetCount: number; schedulesBuilt: number }> {
  const fromCh = await hydrate();

  let source: string;
  if (fromCh.assets.length > 0) {
    replaceContents(fromCh);
    source = 'postgres';
  } else {
    const jsonSeed = readJsonSeed();
    // Nothing hard-coded: with no DB rows and no JSON file the register starts empty.
    // Load sample/real assets with: npm run db:seed:assets
    replaceContents(jsonSeed ?? { assets: [], timelines: {}, depreciationSchedules: {} });
    source = jsonSeed ? 'bootstrap:data-store.json' : 'empty';
  }

  // Backfill a real depreciation schedule for any asset that lacks one,
  // so the Dashboard chart and Forecasting roll-forward never fall back
  // to a flat annualRate/12 approximation.
  const built = ensureSchedules(assets, depreciationSchedules);
  // Backfill a Tax Fact Pattern for any asset that lacks one, so Asset
  // Detail → Overview always has a real table to show. Runs after
  // ensureSchedules so it can read each asset's own schedule for its
  // current-year rate.
  const tfpBuilt = ensureTaxFactPatterns(assets, depreciationSchedules);
  // Backfill the per-book entries (all 15 books) for any asset that has none yet.
  const needBooks = assets.filter((a) => !bookEntries[a.assetNumber]);
  if (needBooks.length > 0) syncBookEntries(needBooks);

  if (source !== 'postgres' || needBooks.length > 0 || built.length > 0 || tfpBuilt.length > 0) {
    await flushNow();
  }

  return { source, assetCount: assets.length, schedulesBuilt: built.length };
}

// ======================================================
// END: initStore
// ======================================================

// ======================================================
// Function : findAsset
// Purpose  : Finds an asset in the in-memory register by asset number.
// ======================================================

export function findAsset(assetNumber: string): Asset | undefined {
  return assets.find((a) => a.assetNumber === assetNumber);
}

// ======================================================
// END: findAsset
// ======================================================

// ── Apply a posted Lifecycle event to the Asset Register ────────────────
// Called right after a "Confirm & Post" click successfully writes its
// immutable row to the ClickHouse asset_transactions ledger (see
// routes/lifecycle.ts POST /post). This is what makes a posted event show
// up on the Asset Register / Asset Detail pages: it mutates (or creates)
// the matching row in the `assets` in-memory table using the exact same
// preview numbers the user saw on the Lifecycle page, and drops a matching
// entry into that asset's Lifecycle Timeline.

// ======================================================
// Function : parseMoney
// Purpose  : Turns a formatted money string (e.g. "-$1,850.00") back into
//            a plain number, so preview.rows values can drive the store.
// ======================================================

function parseMoney(value: string | undefined): number {
  if (!value) return 0;
  const negative = value.trim().startsWith('-');
  const digits = value.replace(/[^0-9.]/g, '');
  const n = parseFloat(digits);
  if (Number.isNaN(n)) return 0;
  return negative ? -n : n;
}

// ======================================================
// END: parseMoney
// ======================================================

// ======================================================
// Function : rowValue
// Purpose  : Looks up a preview row's value by its label.
// ======================================================

function rowValue(rows: LifecyclePreviewResultRow[], label: string): string | undefined {
  return rows.find((r) => r.label === label)?.value;
}

// ======================================================
// END: rowValue
// ======================================================

// ======================================================
// Function : createPlaceholder
// Purpose  : Non-Addition events reference an assetNumber that should
//            already exist. If the user posted against one that isn't in
//            the register yet, don't silently drop the event — create a
//            bare 'Under Review' row so the post is still visible.
// ======================================================

function createPlaceholder(assetNumber: string): Asset {
  const placeholder: Asset = {
    assetNumber,
    description: `Asset ${assetNumber}`,
    assetClass: 'Machinery',
    company: '5B',
    cost: 0,
    accumDepreciation: 0,
    nbv: 0,
    method: 'MACRS',
    status: 'Under Review'
  };
  assets.push(placeholder);
  persist();
  return placeholder;
}

// ======================================================
// END: createPlaceholder
// ======================================================

// ======================================================
// Function : buildTaxFactPattern
// Purpose  : Derives/updates the Tax Fact Pattern block shown on Asset
//            Detail → Overview from the submitted fields + preview rows.
// ======================================================

function buildTaxFactPattern(
  fields: Record<string, string | number | boolean>,
  rows: LifecyclePreviewResultRow[],
  prior?: Asset['taxFactPattern']
): Asset['taxFactPattern'] {
  const methodConv = rowValue(rows, 'Method / Convention') ?? '';
  const [method, convention] = methodConv.split('/').map((s) => s?.trim());
  const bonusPct = typeof fields.bonusPct === 'number' ? fields.bonusPct : Number(fields.bonusPct);
  // 'Current-Year Rate' is the % this addition is actually depreciating at
  // (from the MACRS/SL rate table lookup) — this is what the Dashboard's
  // Monthly Depreciation Expense chart and the Forecasting roll-forward
  // both multiply against cost. It used to be dropped on the floor here
  // (hardcoded to prior?.annualRate ?? 0), which silently zeroed out every
  // newly-added asset's contribution to those two views.
  const rateRow = rowValue(rows, 'Current-Year Rate');
  const annualRate = rateRow ? parseMoney(rateRow) : undefined;

  return {
    placedInService: typeof fields.placedInService === 'string' && fields.placedInService ? fields.placedInService : prior?.placedInService ?? '',
    recoveryPeriod: rowValue(rows, 'Recovery Life') ?? prior?.recoveryPeriod ?? '',
    method: method || prior?.method || 'MACRS',
    convention: convention || prior?.convention || 'Half-Year',
    bonusPct: Number.isFinite(bonusPct) ? bonusPct : prior?.bonusPct ?? 0,
    annualRate: annualRate ?? prior?.annualRate ?? 0,
    propertyType: prior?.propertyType ?? 'Personal Property'
  };
}

// ======================================================
// END: buildTaxFactPattern
// ======================================================

// ======================================================
// Function : pushTimelineEntry
// Purpose  : Prepends a "just posted" entry to this asset's Lifecycle
//            Timeline (shown on Asset Detail → Overview).
// ======================================================

function pushTimelineEntry(assetNumber: string, eventType: LifecycleEventType, preview: LifecyclePreviewResult): void {
  const entry: TimelineEntry = {
    date: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase(),
    title: `${eventType} — ${preview.badgeText}`,
    description: preview.formulaNote,
    done: true
  };
  timelines[assetNumber] = [entry, ...(timelines[assetNumber] ?? [])];
}

// ======================================================
// END: pushTimelineEntry
// ======================================================

// ======================================================
// Function : applyLifecycleEvent
// Purpose  : Updates (or creates) the Asset Register row for a posted
//            Lifecycle event, using the same preview numbers the user
//            confirmed on-screen. Returns the resulting Asset.
// ======================================================

// ======================================================
// Function : inferAssetClass
// Purpose  : The Lifecycle "Addition" card now has its own Asset Class
//            select (see client/src/data/lifecycleFormSchemas.js) — use
//            whatever the user picked there. If it's missing (e.g. an
//            older test case posted before that field existed), fall
//            back to a best-guess from the tax Asset Type string rather
//            than always defaulting to 'Machinery': real-property tax
//            types are Buildings, everything else keeps the previous
//            'Machinery' fallback since Personal Property tax types
//            don't otherwise distinguish equipment from vehicles.
//            Fixes the Dashboard "Assets by Class" pie silently
//            collapsing toward one class over time, since every new
//            addition used to land in the same bucket regardless of
//            what was actually being capitalized.
// ======================================================

function inferAssetClass(fields: Record<string, string | number | boolean>): string {
  if (typeof fields.assetClass === 'string' && fields.assetClass) return fields.assetClass;
  const assetType = typeof fields.assetType === 'string' ? fields.assetType : '';
  if (/residential|nonresidential/i.test(assetType)) return 'Buildings';
  return 'Machinery';
}

// ======================================================
// END: inferAssetClass
// ======================================================

// ======================================================
// Function : refreshStoredSchedule
// Purpose  : Rebuilds the asset's STORED depreciation schedule after an event
//            that changes its cost or recovery terms (Addition, Adjustment,
//            Transfer, Reinstatement, Reclassification).
//            Why: every book reads this one asset record. Books that have a
//            Customize Table rule rebuild their own schedule from the asset's
//            current cost, but Federal Tax - and every book without a rule,
//            which mirrors Federal Tax - read the STORED schedule. Without this
//            refresh an Adjustment changed some books and left the rest on the
//            old cost. Now all books move together.
// ======================================================

function refreshStoredSchedule(
  asset: Asset,
  eventType: LifecycleEventType,
  fields: Record<string, string | number | boolean>
): void {
  // Make sure the fact pattern exists first (it supplies the in-service date).
  ensureTaxFactPatterns([asset], depreciationSchedules);

  // Reclassification: carry the NEW method / life / convention into the fact
  // pattern so the rebuilt schedule follows them.
  if (eventType === 'Reclassification' && asset.taxFactPattern) {
    const months = Number(fields.newLifeMonths);
    if (typeof fields.newMethod === 'string' && fields.newMethod) asset.taxFactPattern.method = fields.newMethod;
    if (Number.isFinite(months) && months > 0) {
      const years = months / 12;
      asset.taxFactPattern.recoveryPeriod = `${Number.isInteger(years) ? years : years.toFixed(1)} years`;
    }
    if (typeof fields.newConvention === 'string' && fields.newConvention) asset.taxFactPattern.convention = fields.newConvention;
  }

  const rebuilt = buildSchedule(asset);
  if (rebuilt.length > 0) depreciationSchedules[asset.assetNumber] = rebuilt;
}

// ======================================================
// Function : applyLifecycleEvent
// Purpose  : Applies a posted lifecycle event (addition, adjustment, transfer, etc.) to the in-memory asset and its timeline.
// ======================================================

export function applyLifecycleEvent(
  eventType: LifecycleEventType,
  assetNumber: string,
  fields: Record<string, string | number | boolean>,
  preview: LifecyclePreviewResult
): Asset {
  const rows = preview.rows;
  const existing = findAsset(assetNumber);
  let asset: Asset;

  switch (eventType) {
    case 'Addition': {
      const cost = typeof fields.cost === 'number' ? fields.cost : Number(fields.cost) || 0;
      const accumDepreciation = parseMoney(rowValue(rows, 'Ending Accum. Depreciation'));
      const nbv = parseMoney(rowValue(rows, 'Ending Net Book Value'));
      const methodConv = rowValue(rows, 'Method / Convention') ?? '';
      const method = methodConv.split('/')[0]?.trim();

      if (existing) {
        existing.cost = cost || existing.cost;
        existing.accumDepreciation = accumDepreciation;
        existing.nbv = nbv;
        existing.status = 'Active';
        if (method) existing.method = method;
        existing.taxFactPattern = buildTaxFactPattern(fields, rows, existing.taxFactPattern);
        asset = existing;
      } else {
        asset = {
          assetNumber,
          description: typeof fields.description === 'string' && fields.description ? fields.description : `New ${String(fields.assetType ?? 'Asset')}`,
          assetClass: inferAssetClass(fields),
          company: typeof fields.company === 'string' && fields.company ? fields.company : '5B',
          cost,
          accumDepreciation,
          nbv,
          method: method || 'MACRS',
          status: 'Active',
          taxFactPattern: buildTaxFactPattern(fields, rows)
        };
        assets.push(asset);
      }
      break;
    }

    case 'Adjustment': {
      asset = existing ?? createPlaceholder(assetNumber);
      const newCost = parseMoney(rowValue(rows, 'New Cost Basis'));
      asset.cost = newCost || asset.cost;
      asset.accumDepreciation = parseMoney(rowValue(rows, 'Ending Accum. Depreciation'));
      asset.nbv = parseMoney(rowValue(rows, 'Ending Net Book Value'));
      break;
    }

    case 'Transfer': {
      asset = existing ?? createPlaceholder(assetNumber);
      const destCompany = typeof fields.destCompany === 'string' ? fields.destCompany : undefined;
      const destLocation = typeof fields.destLocation === 'string' ? fields.destLocation : undefined;
      if (destCompany) asset.company = destCompany;
      if (destLocation) asset.location = destLocation;

      const remainingCost = parseMoney(rowValue(rows, 'Remaining Cost at Source'));
      const remainingAD = parseMoney(rowValue(rows, 'Remaining A/D at Source'));
      const remainingNBV = parseMoney(rowValue(rows, 'Remaining NBV at Source'));
      if (remainingCost) asset.cost = remainingCost;
      asset.accumDepreciation = remainingAD || asset.accumDepreciation;
      asset.nbv = remainingNBV || asset.nbv;
      asset.status = 'Transferred';
      break;
    }

    case 'Retirement': {
      asset = existing ?? createPlaceholder(assetNumber);
      const costDisposed = parseMoney(rowValue(rows, 'Cost Disposed'));
      const nbvDisposed = parseMoney(rowValue(rows, 'Net Book Value Disposed'));
      const glRow = rows.find((r) => ['Gain', 'Loss', 'No Gain/Loss'].includes(r.label));

      asset.status = 'Retired';
      asset.accumDepreciation = costDisposed - nbvDisposed || asset.accumDepreciation;
      asset.nbv = Math.max(asset.cost - asset.accumDepreciation, 0);
      asset.disposal = {
        disposalDate: typeof fields.disposalDate === 'string' && fields.disposalDate ? fields.disposalDate : new Date().toISOString().slice(0, 10),
        adAtDisposal: asset.accumDepreciation,
        gainLoss: glRow ? parseMoney(glRow.value) : 0
      };
      break;
    }

    case 'Reinstatement': {
      asset = existing ?? createPlaceholder(assetNumber);
      const restoredCost = parseMoney(rowValue(rows, 'Restored Cost'));
      asset.status = 'Active';
      if (restoredCost) asset.cost = restoredCost;
      asset.accumDepreciation = parseMoney(rowValue(rows, 'Ending Accum. Depreciation'));
      asset.nbv = parseMoney(rowValue(rows, 'Ending Net Book Value'));
      delete asset.disposal;
      break;
    }

    case 'Reclassification': {
      asset = existing ?? createPlaceholder(assetNumber);
      const newMlc = rowValue(rows, 'New Method / Life / Convention');
      if (newMlc) asset.method = newMlc.split('/')[0]?.trim() || asset.method;
      asset.accumDepreciation = parseMoney(rowValue(rows, 'Ending Accum. Depreciation'));
      asset.nbv = parseMoney(rowValue(rows, 'Ending Net Book Value'));
      break;
    }

    default:
      asset = existing ?? createPlaceholder(assetNumber);
  }

  // Cost / terms changed -> every book (Federal Tax and all the mirror books) must see it.
  if (['Addition', 'Adjustment', 'Transfer', 'Reinstatement', 'Reclassification'].includes(eventType)) {
    refreshStoredSchedule(asset, eventType, fields);
  }

  // Every book gets its own stored entry + schedule for this asset (Addition creates all
  // of them; later events that change cost / terms rebuild them). Saved by persist() below.
  syncBookEntries([asset]);

  pushTimelineEntry(assetNumber, eventType, preview);
  persist();
  return asset;
}

// ======================================================
// END: applyLifecycleEvent
// ======================================================

// ======================================================
// END: Data Functions
// ======================================================

// ======================================================
// END OF FILE : assets.ts
// ======================================================
