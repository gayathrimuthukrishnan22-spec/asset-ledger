// ======================================================
// File Name : book-view.ts
// Purpose   : Makes every table book-aware.
//
//             The ledger stores ONE set of assets (cost, in-service
//             date, status ...) plus ONE stored depreciation schedule —
//             that stored schedule is the Federal Tax book. Every other
//             book shares the same assets but depreciates them under
//             its own rules. Those rules live in Configuration -> Asset
//             Classes -> Customize Table (one row per Book + asset
//             class: method, rate, convention, life).
//
//             For a given (asset, book) this file answers:
//               * Federal Tax            -> the stored data, untouched
//                                           (zero change to what the app
//                                           already showed).
//               * a book WITH a rule for this asset's class
//                                        -> a schedule built from that rule.
//               * a book WITHOUT a rule  -> mirrors Federal Tax, and says
//                                           so (ruleSource = 'federal-mirror')
//                                           so the UI can show a note
//                                           instead of quietly pretending.
// ======================================================

import type { Asset, BookEntry, DepreciationScheduleRow } from '../types.js';
import { BOOKS, DEFAULT_BOOK } from '../data/books.js';
import { assets as allAssets, bookEntries, depreciationSchedules, persist } from '../data/assets.js';
import { buildSchedule, inServiceDate, round2, toISODate } from './schedule-builder.js';
import { loadClassHistory, loadCustomAssetClasses, type ClassVersion, type CustomAssetClassRow } from '../db/repo.js';

// ======================================================
// START: Types
// ======================================================

export type RuleSource = 'stored' | 'book-rule' | 'federal-mirror';

/** An Asset as seen through one book. Extra fields tell the UI where the numbers came from. */
export interface BookAssetView extends Asset {
  book: string;
  ruleSource: RuleSource;
  /** The Customize Table row that produced this view (only for ruleSource = 'book-rule'). */
  ruleName?: string;
}

// ======================================================
// START: Rule cache
// ======================================================

const RULES_TTL_MS = 5000;
let rulesAt = 0;
let rulesInflight: Promise<void> | null = null;
// book (lower-case) -> assetType (lower-case) -> rule row
let rulesByBook = new Map<string, Map<string, CustomAssetClassRow>>();
// Built schedules, keyed by everything that can change them. Cleared
// whenever the rules are re-read so an edited rule shows up right away.
const scheduleCache = new Map<string, DepreciationScheduleRow[]>();
// "c:<rule id>" -> that rule's versions, oldest first (Asset Classes change history).
let historyByRule = new Map<string, ClassVersion[]>();

// ======================================================
// Function : setBookRules
// Purpose  : Installs a set of Customize Table rows as the active book
//            rules and drops every cached schedule built from the old
//            ones. primeBookRules feeds it from Postgres; it is exported
//            so the rules can also be set directly (scripts, checks).
// ======================================================

let rulesSignature = '';

export function setBookRules(rows: CustomAssetClassRow[]): void {
  const signature = JSON.stringify(rows.map((r) => [r.id, r.book, r.assetType, r.method, r.ratePct, r.convention, r.life, r.bonusPct]));
  const changed = signature !== rulesSignature;
  rulesSignature = signature;
  const next = new Map<string, Map<string, CustomAssetClassRow>>();
  for (const r of rows) {
    const b = r.book.trim().toLowerCase();
    if (!next.has(b)) next.set(b, new Map());
    next.get(b)!.set(r.assetType.trim().toLowerCase(), r);
  }
  rulesByBook = next;
  scheduleCache.clear();
  // A Customize Table rule was added / edited / deleted -> every asset's stored
  // per-book entries are now out of date. Rebuild and save them in the DB.
  // (Also runs once after boot, which backfills assets that predate per-book entries.)
  if (changed && allAssets.length > 0) {
    syncBookEntries(allAssets);
    persist();
  }
}

// ======================================================
// Function : primeBookRules
// Purpose  : (Re)reads the Customize Table rows from Postgres, at most
//            every few seconds. Routes await this once before doing
//            book maths so the sync helpers below can read the cache.
//            Never throws: if Postgres hiccups, the last good rules
//            stay in place (or none, which just means "mirror Federal").
// ======================================================

export async function primeBookRules(force = false): Promise<void> {
  if (!force && Date.now() - rulesAt < RULES_TTL_MS) return;
  if (!rulesInflight) {
    rulesInflight = (async () => {
      try {
        const [rules, history] = await Promise.all([loadCustomAssetClasses(), loadClassHistory().catch(() => [] as ClassVersion[])]);
        const byRule = new Map<string, ClassVersion[]>();
        for (const v of history) if (v.scope === 'custom') byRule.set(v.classKey, [...(byRule.get(v.classKey) ?? []), v]);
        historyByRule = byRule;
        setBookRules(rules);
      } catch (err) {
        console.error('[book-view] could not refresh book rules:', err instanceof Error ? err.message : err);
      } finally {
        rulesAt = Date.now();
      }
    })().finally(() => { rulesInflight = null; });
  }
  return rulesInflight;
}

// ======================================================
// Function : ruleFor
// Purpose  : The Customize Table row for (book, asset class), if any.
// ======================================================

function ruleFor(book: string, assetClass: string, pisDate?: string | null): CustomAssetClassRow | undefined {
  const rule = rulesByBook.get(book.trim().toLowerCase())?.get((assetClass ?? '').trim().toLowerCase());
  if (!rule || !pisDate) return rule;
  // Effective-dated: an asset placed in service before an edit keeps the values
  // that applied back then (the latest version whose effective date is on/before
  // its PIS date; earlier than every version -> the original/baseline one).
  const versions = historyByRule.get(`c:${rule.id}`);
  if (!versions || !versions.length) return rule;
  let pick = versions[0];
  for (const v of versions) if (v.effectiveFrom <= pisDate) pick = v;
  return { ...rule, method: pick.method, ratePct: pick.ratePct, convention: pick.convention, life: pick.life, bonusPct: pick.bonusPct };
}

// ======================================================
// END: Rule cache
// ======================================================

// ======================================================
// START: Rule parsing
// ======================================================

// "10 years 6 months" -> 10.5
function parseLife(life: string): number {
  const m = /(\d+)\s*years?\s*(\d+)\s*months?/i.exec(life ?? '');
  if (!m) return 0;
  return Number(m[1]) + Number(m[2]) / 12;
}

type MethodKind = 'NONE' | 'SL' | 'MACRS' | 'MACRS150' | 'MACRS_SL' | 'ADS';

// "SL - Straight Line", "MC - MACRS", "MS - MACRS Straight Line", "AD - MACRS ADS", "NO - No Depreciation"
function methodKind(method: string, ratePct: string): MethodKind {
  const code = (method.split('-')[0] ?? '').trim().toUpperCase();
  const text = method.toLowerCase();
  if (code === 'NO' || text.includes('no depreciation')) return 'NONE';
  if (code === 'AD' || text.includes('ads')) return 'ADS';
  if (code === 'MS' || (text.includes('macrs') && text.includes('straight'))) return 'MACRS_SL';
  if (code === 'SL' || text.includes('straight')) return 'SL';
  if (text.includes('150') || Number(ratePct) === 150) return 'MACRS150';
  return 'MACRS';
}

type ConventionKind = 'FM' | 'MM' | 'HY' | 'MQ';

// "FM - Full-Month", "MM - Mid-Month", "AHY - Apply Mid-Quarter test (use HY)", "HY - Half-Year"
function conventionKind(convention: string): ConventionKind {
  const code = (convention.split('-')[0] ?? '').trim().toUpperCase();
  if (code === 'FM') return 'FM';
  if (code === 'MM') return 'MM';
  if (code === 'MQ') return 'MQ';
  return 'HY';
}

const CONVENTION_LABEL: Record<ConventionKind, string> = {
  FM: 'Full-Month',
  MM: 'Mid-Month',
  HY: 'Half-Year',
  MQ: 'Mid-Quarter'
};

// ======================================================
// END: Rule parsing
// ======================================================

// ======================================================
// START: Schedule building
// ======================================================

// ======================================================
// Function : buildStraightLineSchedule
// Purpose  : Year-by-year straight-line schedule over `life` years for
//            a non-MACRS book rule. First-year fraction follows the
//            convention: Full-Month starts in the in-service month,
//            Mid-Month starts half way through it, Half-Year (and
//            Mid-Quarter, approximated) books 6 months. The last row
//            takes whatever remains so the schedule always lands on
//            exactly zero NBV — no rounding drift.
// ======================================================

function buildStraightLineSchedule(asset: Asset, life: number, convention: ConventionKind): DepreciationScheduleRow[] {
  const cost = Number(asset.cost) || 0;
  const totalMonths = Math.round(life * 12);
  if (cost <= 0 || totalMonths <= 0) return [];

  const pis = inServiceDate(asset, depreciationSchedules[asset.assetNumber]);
  const startYear = Number(pis.slice(0, 4));
  const startMonth = Number(pis.slice(5, 7)) || 1;

  let firstYearMonths: number;
  if (convention === 'FM') firstYearMonths = 13 - startMonth;
  else if (convention === 'MM') firstYearMonths = 12.5 - startMonth;
  else firstYearMonths = 6;

  const monthly = cost / totalMonths;
  const rows: DepreciationScheduleRow[] = [];
  let remainingMonths = totalMonths;
  let accum = 0;
  let openingNbv = cost;

  for (let i = 0; remainingMonths > 1e-9 && i < 200; i++) {
    const months = Math.min(remainingMonths, i === 0 ? firstYearMonths : 12);
    const isLast = remainingMonths - months <= 1e-9;
    let depreciation = isLast ? round2(cost - accum) : round2(monthly * months);
    if (accum + depreciation > cost) depreciation = round2(cost - accum);
    if (depreciation < 0) depreciation = 0;
    accum = round2(accum + depreciation);
    const closingNbv = round2(cost - accum);

    rows.push({
      year: `${startYear + i} (Yr ${i + 1})`,
      openingNbv: round2(openingNbv),
      rate: round2((depreciation / cost) * 100),
      depreciation,
      accumDepreciation: accum,
      closingNbv
    });

    openingNbv = closingNbv;
    remainingMonths -= months;
  }
  return rows;
}

// ======================================================
// Function : buildRuleSchedule
// Purpose  : Builds a schedule from a Customize Table rule. MACRS-family
//            rules reuse buildSchedule (the same Pub-946 rate tables the
//            Federal Tax book uses) on a copy of the asset whose fact
//            pattern is swapped for the rule's method / life /
//            convention; plain straight-line rules use the local builder.
//            "No Depreciation" or a 0-year life gives no schedule at all.
// ======================================================

function buildRuleSchedule(asset: Asset, rule: CustomAssetClassRow): DepreciationScheduleRow[] {
  const kind = methodKind(rule.method, rule.ratePct);
  const life = parseLife(rule.life);
  if (kind === 'NONE' || life <= 0) return [];

  const conv = conventionKind(rule.convention);
  if (kind === 'SL') return buildStraightLineSchedule(asset, life, conv);

  const engineMethodName =
    kind === 'ADS' ? 'MACRS ADS' : kind === 'MACRS_SL' ? 'Straight-Line' : kind === 'MACRS150' ? 'MACRS 150DB' : 'MACRS';
  const clone: Asset = {
    ...asset,
    taxFactPattern: {
      placedInService: inServiceDate(asset, depreciationSchedules[asset.assetNumber]),
      recoveryPeriod: `${life} years`,
      method: engineMethodName,
      convention: CONVENTION_LABEL[conv],
      bonusPct: 0,
      annualRate: 0,
      propertyType: rule.propertyType
    }
  };
  return buildSchedule(clone);
}

// ======================================================
// END: Schedule building
// ======================================================

// ======================================================
// START: Public API
// ======================================================

// ======================================================
// Function : liveScheduleForBook
// Purpose  : The depreciation schedule of one asset in one book, calculated
//            now (no stored entry involved).
//            Federal Tax (and any book with no rule for this asset's
//            class) returns the STORED schedule; a book with a rule
//            returns a schedule built from it.
// ======================================================

function liveScheduleForBook(asset: Asset, book: string): DepreciationScheduleRow[] {
  const stored = depreciationSchedules[asset.assetNumber] ?? [];
  if (book === DEFAULT_BOOK) return stored;

  const rule = ruleFor(book, asset.assetClass, toISODate(asset.taxFactPattern?.placedInService));
  if (!rule) return stored;

  const key = [book, asset.assetNumber, asset.cost, asset.taxFactPattern?.placedInService ?? '', rule.id, rule.method, rule.ratePct, rule.convention, rule.life].join('|');
  const hit = scheduleCache.get(key);
  if (hit) return hit;
  const built = buildRuleSchedule(asset, rule);
  scheduleCache.set(key, built);
  return built;
}

// ======================================================
// Function : scheduleForBook
// Purpose  : The depreciation schedule of one asset in one book — read from
//            that book's STORED entry (asset_book_schedule). If the stored
//            entry is missing or was built from older inputs (cost, in-service
//            date, rule changed), it falls back to the live calculation so a
//            page never shows a stale number.
// ======================================================

export function scheduleForBook(asset: Asset, book: string): DepreciationScheduleRow[] {
  if (book === DEFAULT_BOOK) return depreciationSchedules[asset.assetNumber] ?? [];
  const entry = bookEntries[asset.assetNumber]?.[book];
  if (entry && entry.sig === signatureFor(asset, book)) return entry.schedule;
  return liveScheduleForBook(asset, book);
}

// ======================================================
// Function : signatureFor
// Purpose  : Fingerprint of everything a book's entry is built from: cost,
//            in-service date, the book's rule (or 'mirror'), and the stored
//            Federal Tax schedule that mirror books copy.
// ======================================================

function signatureFor(asset: Asset, book: string): string {
  const stored = depreciationSchedules[asset.assetNumber] ?? [];
  const storedHash = `${stored.length}:${round2(stored.reduce((t, r) => t + r.depreciation, 0))}`;
  const pis = toISODate(asset.taxFactPattern?.placedInService);
  const rule = book === DEFAULT_BOOK ? undefined : ruleFor(book, asset.assetClass, pis);
  const ruleKey = book === DEFAULT_BOOK ? 'stored' : rule ? [rule.id, rule.method, rule.ratePct, rule.convention, rule.life].join('/') : 'mirror';
  return [book, asset.assetNumber, asset.cost, pis, ruleKey, storedHash].join('|');
}

// ======================================================
// Function : computeBookEntry
// Purpose  : Builds the stored entry for ONE asset in ONE book.
//            Federal Tax -> the stored schedule. A book with a Customize
//            Table rule -> a schedule built from that rule (SL / MACRS / ADS).
//            A book with no rule -> a copy of Federal Tax's schedule, flagged
//            'federal-mirror' so it is visible that no book rule exists yet.
// ======================================================

function computeBookEntry(asset: Asset, book: string): BookEntry {
  const tfp = asset.taxFactPattern;
  const pis = toISODate(tfp?.placedInService);
  const stored = depreciationSchedules[asset.assetNumber] ?? [];
  const rule = book === DEFAULT_BOOK ? undefined : ruleFor(book, asset.assetClass, pis);
  const sig = signatureFor(asset, book);
  const cost = Number(asset.cost) || 0;

  if (!rule) {
    return {
      book,
      ruleSource: book === DEFAULT_BOOK ? 'stored' : 'federal-mirror',
      ruleName: '',
      method: tfp?.method ?? asset.method,
      convention: tfp?.convention ?? '',
      life: tfp?.recoveryPeriod ?? '',
      cost,
      accumDepreciation: asset.accumDepreciation,
      nbv: asset.nbv,
      sig,
      schedule: stored.map((r) => ({ ...r }))
    };
  }

  const rows = buildRuleSchedule(asset, rule);
  const live = asset.status !== 'Retired' && asset.status !== 'Fully Depreciated';
  const accum = live ? accumulatedToDate(asset, rows) : asset.accumDepreciation;
  return {
    book,
    ruleSource: 'book-rule',
    ruleName: `${rule.book} - ${rule.assetType}`,
    method: rule.method,
    convention: rule.convention,
    life: rule.life,
    cost,
    accumDepreciation: accum,
    nbv: live ? round2(cost - accum) : asset.nbv,
    sig,
    schedule: rows
  };
}

// ======================================================
// Function : syncBookEntries
// Purpose  : Writes one stored entry for EVERY book (all of BOOKS) for each
//            given asset into the in-memory store; the caller's persist()
//            then saves them to asset_book_entry / asset_book_schedule.
//            Called on Addition (and every event that changes cost / terms),
//            when a Customize Table rule changes, and after boot.
// ======================================================

export function syncBookEntries(list: Asset[]): void {
  for (const asset of list) {
    const byBook: Record<string, BookEntry> = {};
    for (const b of BOOKS) byBook[b.name] = computeBookEntry(asset, b.name);
    bookEntries[asset.assetNumber] = byBook;
  }
}

// ======================================================
// Function : accumulatedToDate
// Purpose  : Accumulated depreciation of a schedule up to and including
//            the current month: every completed year in full, plus the
//            current year's row spread over the months the asset is in
//            service that year (same spreading the monthly views use).
// ======================================================

function accumulatedToDate(asset: Asset, rows: DepreciationScheduleRow[]): number {
  const now = new Date();
  const thisYear = now.getFullYear();
  let accum = 0;
  for (const r of rows) {
    const y = Number(r.year.match(/\d{4}/)?.[0]);
    if (!y) continue;
    if (y < thisYear) {
      accum += r.depreciation;
    } else if (y === thisYear) {
      const pis = toISODate(asset.taxFactPattern?.placedInService);
      const startMonth = pis && pis.startsWith(String(thisYear)) ? Number(pis.slice(5, 7)) : 1;
      const activeMonths = Math.max(1, 12 - startMonth + 1);
      const elapsed = Math.min(activeMonths, Math.max(0, now.getMonth() + 1 - startMonth + 1));
      accum += (r.depreciation * elapsed) / activeMonths;
    }
  }
  return round2(Math.min(accum, Number(asset.cost) || 0));
}

// ======================================================
// Function : viewAssetForBook
// Purpose  : One asset as one book sees it. Federal Tax returns the asset
//            as stored. A rule-driven book swaps in that book's method /
//            life / convention / rate and recomputes accumulated
//            depreciation and NBV from its own schedule (only for
//            assets still on the books — retired, fully-depreciated
//            ones keep their stored figures).
// ======================================================

export function viewAssetForBook(asset: Asset, book: string): BookAssetView {
  if (book === DEFAULT_BOOK) return { ...asset, book, ruleSource: 'stored' };

  const rule = ruleFor(book, asset.assetClass, toISODate(asset.taxFactPattern?.placedInService));
  if (!rule) return { ...asset, book, ruleSource: 'federal-mirror' };

  const rows = scheduleForBook(asset, book);
  const cost = Number(asset.cost) || 0;
  const live = asset.status !== 'Retired' && asset.status !== 'Fully Depreciated';
  const accumDepreciation = live ? accumulatedToDate(asset, rows) : asset.accumDepreciation;
  const nbv = live ? round2(cost - accumDepreciation) : asset.nbv;

  const life = parseLife(rule.life);
  const now = new Date().getFullYear();
  const currentRow = rows.find((r) => r.year.startsWith(String(now))) ?? rows[0];
  const tfp = asset.taxFactPattern;

  return {
    ...asset,
    book,
    ruleSource: 'book-rule',
    ruleName: `${rule.book} - ${rule.assetType}`,
    accumDepreciation,
    nbv,
    method: rule.method.replace(/^[A-Z]{1,3}\s*-\s*/, '') || rule.method,
    taxFactPattern: {
      placedInService: tfp?.placedInService ?? inServiceDate(asset, rows),
      recoveryPeriod: life > 0 ? `${Number.isInteger(life) ? life : life.toFixed(1)} years` : 'N/A',
      method: rule.method.replace(/^[A-Z]{1,3}\s*-\s*/, '') || rule.method,
      convention: CONVENTION_LABEL[conventionKind(rule.convention)],
      bonusPct: 0,
      annualRate: currentRow?.rate ?? 0,
      propertyType: rule.propertyType.replace(/^[A-Z]{1,3}\s*-\s*/, '') || rule.propertyType
    }
  };
}

// ======================================================
// Function : viewAssetsForBook
// Purpose  : viewAssetForBook over a list.
// ======================================================

export function viewAssetsForBook(list: Asset[], book: string): BookAssetView[] {
  return list.map((a) => viewAssetForBook(a, book));
}

// ======================================================
// END: Public API
// ======================================================

// ======================================================
// END OF FILE : book-view.ts
// ======================================================
