// ======================================================
// File Name : repo.ts
// Purpose   : Postgres (Neon) read/write layer for the core book —
//             assets, lifecycle timelines, and depreciation schedules.
//
//             This is what makes Postgres the SOURCE OF TRUTH.
//             Before this, only the asset_transactions ledger went to
//             the database; the asset master itself lived in
//             server/data-store.json, so "the database" and "what the
//             UI shows" were two different things.
//
//             Shape of the deal:
//               • hydrate()  — boot-time load, Postgres -> memory
//               • flush()    — mutation-time save, memory -> Postgres
//             The in-memory arrays stay as the request-path working
//             set (reads are synchronous everywhere in the app), but
//             every mutation is written through to Postgres.
// ======================================================

import { parsePeriodLabel, periodFromYearLabel } from '../services/bonusPeriod.js';
import { pool } from './postgres.js';
import type { AssetClassSeedRow } from '../data/assetClasses.js';
import type { AssetTypeConfigRow } from '../data/assetTypeConfig.js';
import type { BookDef } from '../data/books.js';
import type { BonusCustomRuleRow, BonusRateRow, BonusReferenceRow, BonusRuleRow } from '../data/bonusRates.js';
import type { Asset, BookEntries, DepreciationScheduleRow, LifecycleActivity, TimelineEntry } from '../types.js';

// ======================================================
// START: Repository Functions
// ======================================================

export interface CoreSnapshot {
  assets: Asset[];
  timelines: Record<string, TimelineEntry[]>;
  depreciationSchedules: Record<string, DepreciationScheduleRow[]>;
  /** Per-book stored entries (asset -> book -> entry). Optional so older callers still compile. */
  bookEntries?: BookEntries;
}

// ======================================================
// Function : ensureBookTables
// Purpose  : Creates the per-book tables if schema-books.sql was never run,
//            so a fresh deploy can't crash on a missing table.
// ======================================================

let bookTablesReady = false;

async function ensureBookTables(): Promise<void> {
  if (bookTablesReady) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS asset_book_entry (
    "assetNumber" TEXT NOT NULL, book TEXT NOT NULL,
    "ruleSource" TEXT NOT NULL DEFAULT 'stored', "ruleName" TEXT NOT NULL DEFAULT '',
    method TEXT NOT NULL DEFAULT '', convention TEXT NOT NULL DEFAULT '', life TEXT NOT NULL DEFAULT '',
    cost NUMERIC(20,2) NOT NULL DEFAULT 0, "accumDepreciation" NUMERIC(20,2) NOT NULL DEFAULT 0,
    nbv NUMERIC(20,2) NOT NULL DEFAULT 0, sig TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY ("assetNumber", book))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS asset_book_schedule (
    "assetNumber" TEXT NOT NULL, book TEXT NOT NULL, seq INTEGER NOT NULL, year TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL, "openingNbv" NUMERIC(20,2) NOT NULL DEFAULT 0,
    rate NUMERIC(9,4) NOT NULL DEFAULT 0, depreciation NUMERIC(20,2) NOT NULL DEFAULT 0,
    "accumDepreciation" NUMERIC(20,2) NOT NULL DEFAULT 0, "closingNbv" NUMERIC(20,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY ("assetNumber", book, seq))`);
  bookTablesReady = true;
}

// ======================================================
// Function : query
// Purpose  : Thin parameterized SELECT helper.
// ======================================================

async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const result = await pool.query(sql, params);
  return result.rows as T[];
}

// ======================================================
// END: query
// ======================================================

// ======================================================
// Function : n
// Purpose  : Converts a value to a finite number (0 when it is not numeric).
// ======================================================

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

// ======================================================
// Function : dateOnly
// Purpose  : Formats a Postgres DATE value as a plain YYYY-MM-DD string.
// ======================================================

// Postgres DATE columns come back from `pg` as JS Date objects (local
// midnight). String(date) gives "Sun Mar 15 2026 00:00:00 GMT+0530 …",
// which is hard to parse reliably; send a plain "YYYY-MM-DD" instead.
function dateOnly(v: unknown): string {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const mm = String(v.getMonth() + 1).padStart(2, '0');
    const dd = String(v.getDate()).padStart(2, '0');
    return `${v.getFullYear()}-${mm}-${dd}`;
  }
  return String(v ?? '');
}

// ======================================================
// Function : orUndef
// Purpose  : Returns undefined for null / empty values, otherwise the value as a string.
// ======================================================

function orUndef(v: unknown): string | undefined {
  return v === null || v === undefined || v === '' ? undefined : String(v);
}

// ======================================================
// Function : hydrate
// Purpose  : Loads the whole core book out of Postgres at boot.
//            Ordinary table reads — no FINAL needed, Postgres rows
//            are already the current version.
// Output   : CoreSnapshot
// ======================================================

export async function hydrate(): Promise<CoreSnapshot> {
  await ensureBookTables();
  const [assetRows, timelineRows, scheduleRows, bookRows, bookScheduleRows] = await Promise.all([
    query<Record<string, unknown>>(`SELECT * FROM assets ORDER BY "assetNumber"`),
    query<Record<string, unknown>>(`SELECT * FROM asset_timeline ORDER BY "assetNumber", seq`),
    query<Record<string, unknown>>(`SELECT * FROM asset_depreciation_schedule ORDER BY "assetNumber", seq`),
    query<Record<string, unknown>>(`SELECT * FROM asset_book_entry ORDER BY "assetNumber", book`),
    query<Record<string, unknown>>(`SELECT * FROM asset_book_schedule ORDER BY "assetNumber", book, seq`)
  ]);

  const assets: Asset[] = assetRows.map((r) => {
    const asset: Asset = {
      assetNumber: String(r.assetNumber),
      description: String(r.description ?? ''),
      assetClass: String(r.assetClass ?? ''),
      company: String(r.company ?? ''),
      costCenter: orUndef(r.costCenter),
      location: orUndef(r.location),
      project: orUndef(r.project),
      cost: n(r.cost),
      accumDepreciation: n(r.accumDepreciation),
      nbv: n(r.nbv),
      method: String(r.method ?? ''),
      status: String(r.status ?? 'Active') as Asset['status']
    };

    if (r.tfp_placedInService || r.tfp_method || r.tfp_recoveryPeriod) {
      asset.taxFactPattern = {
        placedInService: dateOnly(r.tfp_placedInService),
        recoveryPeriod: String(r.tfp_recoveryPeriod ?? ''),
        method: String(r.tfp_method ?? ''),
        convention: String(r.tfp_convention ?? ''),
        bonusPct: n(r.tfp_bonusPct),
        annualRate: n(r.tfp_annualRate),
        propertyType: String(r.tfp_propertyType ?? '')
      };
    }

    if (r.disp_disposalDate) {
      asset.disposal = {
        disposalDate: dateOnly(r.disp_disposalDate),
        adAtDisposal: n(r.disp_adAtDisposal),
        gainLoss: n(r.disp_gainLoss)
      };
    }

    return asset;
  });

  const timelines: Record<string, TimelineEntry[]> = {};
  for (const r of timelineRows) {
    const key = String(r.assetNumber);
    (timelines[key] ??= []).push({
      date: String(r.entryDate ?? ''),
      title: String(r.title ?? ''),
      description: String(r.description ?? ''),
      done: n(r.done) === 1
    });
  }

  const depreciationSchedules: Record<string, DepreciationScheduleRow[]> = {};
  for (const r of scheduleRows) {
    const key = String(r.assetNumber);
    (depreciationSchedules[key] ??= []).push({
      year: String(r.year ?? ''),
      openingNbv: n(r.openingNbv),
      rate: n(r.rate),
      depreciation: n(r.depreciation),
      accumDepreciation: n(r.accumDepreciation),
      closingNbv: n(r.closingNbv)
    });
  }

  const bookEntries: BookEntries = {};
  for (const r of bookRows) {
    (bookEntries[String(r.assetNumber)] ??= {})[String(r.book)] = {
      book: String(r.book),
      ruleSource: String(r.ruleSource ?? 'stored') as BookEntries[string][string]['ruleSource'],
      ruleName: String(r.ruleName ?? ''),
      method: String(r.method ?? ''),
      convention: String(r.convention ?? ''),
      life: String(r.life ?? ''),
      cost: n(r.cost),
      accumDepreciation: n(r.accumDepreciation),
      nbv: n(r.nbv),
      sig: String(r.sig ?? ''),
      schedule: []
    };
  }
  for (const r of bookScheduleRows) {
    const entry = bookEntries[String(r.assetNumber)]?.[String(r.book)];
    if (!entry) continue;
    entry.schedule.push({
      year: String(r.year ?? ''),
      openingNbv: n(r.openingNbv),
      rate: n(r.rate),
      depreciation: n(r.depreciation),
      accumDepreciation: n(r.accumDepreciation),
      closingNbv: n(r.closingNbv)
    });
  }

  return { assets, timelines, depreciationSchedules, bookEntries };
}

// ======================================================
// END: hydrate
// ======================================================

// ======================================================
// Function : toDateOrNull
// Purpose  : The store still carries dates in mixed shapes ('' included),
//            and a Postgres date/text column shouldn't get '' written to
//            it. Normalize here and write NULL when there is genuinely
//            no date, instead of failing the whole insert.
// ======================================================

function toDateOrNull(raw: unknown): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const slash = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slash) return `${slash[3]}-${slash[1].padStart(2, '0')}-${slash[2].padStart(2, '0')}`;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime()) && d.getFullYear() > 1900 && d.getFullYear() < 2200) {
    return d.toISOString().slice(0, 10);
  }
  return null;
}

// ======================================================
// END: toDateOrNull
// ======================================================

// ======================================================
// Function : flush
// Purpose  : Writes the current in-memory book back to Postgres.
//            `assets` is upserted (INSERT ... ON CONFLICT (assetNumber)
//            DO UPDATE) — same role the ReplacingMergeTree engine played
//            in ClickHouse, but explicit here. Timeline and schedule
//            rows are delete-then-insert per asset, so a list that
//            shrinks doesn't leave orphaned rows behind. Runs inside a
//            transaction so a flush is all-or-nothing.
// Input    : snapshot (the live assets/timelines/schedules)
// ======================================================

export async function flush(snapshot: CoreSnapshot): Promise<void> {
  const { assets, timelines, depreciationSchedules, bookEntries = {} } = snapshot;

  await ensureBookTables();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (assets.length > 0) {
      for (const a of assets) {
        await client.query(
          `INSERT INTO assets (
             "assetNumber", description, "assetClass", company, "costCenter", location, project,
             cost, "accumDepreciation", nbv, method, status,
             "tfp_placedInService", "tfp_recoveryPeriod", "tfp_method", "tfp_convention", "tfp_bonusPct", "tfp_annualRate", "tfp_propertyType",
             "disp_disposalDate", "disp_adAtDisposal", "disp_gainLoss", "updatedAt"
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22, now())
           ON CONFLICT ("assetNumber") DO UPDATE SET
             description = EXCLUDED.description,
             "assetClass" = EXCLUDED."assetClass",
             company = EXCLUDED.company,
             "costCenter" = EXCLUDED."costCenter",
             location = EXCLUDED.location,
             project = EXCLUDED.project,
             cost = EXCLUDED.cost,
             "accumDepreciation" = EXCLUDED."accumDepreciation",
             nbv = EXCLUDED.nbv,
             method = EXCLUDED.method,
             status = EXCLUDED.status,
             "tfp_placedInService" = EXCLUDED."tfp_placedInService",
             "tfp_recoveryPeriod" = EXCLUDED."tfp_recoveryPeriod",
             "tfp_method" = EXCLUDED."tfp_method",
             "tfp_convention" = EXCLUDED."tfp_convention",
             "tfp_bonusPct" = EXCLUDED."tfp_bonusPct",
             "tfp_annualRate" = EXCLUDED."tfp_annualRate",
             "tfp_propertyType" = EXCLUDED."tfp_propertyType",
             "disp_disposalDate" = EXCLUDED."disp_disposalDate",
             "disp_adAtDisposal" = EXCLUDED."disp_adAtDisposal",
             "disp_gainLoss" = EXCLUDED."disp_gainLoss",
             "updatedAt" = now()`,
          [
            a.assetNumber,
            a.description,
            a.assetClass,
            a.company,
            a.costCenter ?? null,
            a.location ?? null,
            a.project ?? null,
            a.cost,
            a.accumDepreciation,
            a.nbv,
            a.method,
            a.status,
            toDateOrNull(a.taxFactPattern?.placedInService),
            a.taxFactPattern?.recoveryPeriod ?? null,
            a.taxFactPattern?.method ?? null,
            a.taxFactPattern?.convention ?? null,
            a.taxFactPattern?.bonusPct ?? null,
            a.taxFactPattern?.annualRate ?? null,
            a.taxFactPattern?.propertyType ?? null,
            toDateOrNull(a.disposal?.disposalDate),
            a.disposal?.adAtDisposal ?? null,
            a.disposal?.gainLoss ?? null
          ]
        );
      }
    }

    // Clear then re-insert, so shrinking lists don't leave stale rows.
    const touched = [...new Set([...Object.keys(timelines), ...Object.keys(depreciationSchedules)])];
    if (touched.length > 0) {
      await client.query(`DELETE FROM asset_timeline WHERE "assetNumber" = ANY($1::text[])`, [touched]);
      await client.query(`DELETE FROM asset_depreciation_schedule WHERE "assetNumber" = ANY($1::text[])`, [touched]);
    }

    for (const [assetNumber, entries] of Object.entries(timelines)) {
      for (const [seq, e] of entries.entries()) {
        await client.query(
          `INSERT INTO asset_timeline ("assetNumber", seq, "entryDate", title, description, done, "updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6, now())`,
          [assetNumber, seq, e.date, e.title, e.description, e.done ? 1 : 0]
        );
      }
    }

    for (const [assetNumber, rows] of Object.entries(depreciationSchedules)) {
      for (const [seq, r] of rows.entries()) {
        await client.query(
          `INSERT INTO asset_depreciation_schedule
             ("assetNumber", seq, year, "fiscalYear", "openingNbv", rate, depreciation, "accumDepreciation", "closingNbv", "updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())`,
          [
            assetNumber,
            seq,
            r.year,
            Number(r.year.match(/(\d{4})/)?.[1] ?? 0),
            r.openingNbv,
            r.rate,
            r.depreciation,
            r.accumDepreciation,
            r.closingNbv
          ]
        );
      }
    }

    // Per-book entries: every asset has one entry (+ its own schedule) for every book.
    // Same delete-then-insert per asset so a changed schedule never leaves stale rows.
    const bookAssets = Object.keys(bookEntries);
    if (bookAssets.length > 0) {
      await client.query(`DELETE FROM asset_book_entry WHERE \"assetNumber\" = ANY($1::text[])`, [bookAssets]);
      await client.query(`DELETE FROM asset_book_schedule WHERE \"assetNumber\" = ANY($1::text[])`, [bookAssets]);
    }
    for (const [assetNumber, byBook] of Object.entries(bookEntries)) {
      for (const [book, e] of Object.entries(byBook)) {
        await client.query(
          `INSERT INTO asset_book_entry
             (\"assetNumber\", book, \"ruleSource\", \"ruleName\", method, convention, life, cost, \"accumDepreciation\", nbv, sig, \"updatedAt\")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())`,
          [assetNumber, book, e.ruleSource, e.ruleName, e.method, e.convention, e.life, e.cost, e.accumDepreciation, e.nbv, e.sig]
        );
        for (const [seq, r] of e.schedule.entries()) {
          await client.query(
            `INSERT INTO asset_book_schedule
               (\"assetNumber\", book, seq, year, \"fiscalYear\", \"openingNbv\", rate, depreciation, \"accumDepreciation\", \"closingNbv\", \"updatedAt\")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())`,
            [assetNumber, book, seq, r.year, Number(r.year.match(/(\d{4})/)?.[1] ?? 0), r.openingNbv, r.rate, r.depreciation, r.accumDepreciation, r.closingNbv]
          );
        }
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ======================================================
// END: flush
// ======================================================

// ======================================================
// Function : queueFlush
// Purpose  : persist() is called synchronously from ~8 places in the
//            request path (applyLifecycleEvent, POST /assets, bulk
//            import, ...). Rather than making all of them async — and
//            risking two overlapping writes racing each other — every
//            call collapses into a single serialized write-behind: one
//            flush in flight at a time, and at most one more queued.
//            The caller returns immediately; the write still happens.
// ======================================================

let inFlight: Promise<void> | null = null;
let pending = false;
let snapshotSource: (() => CoreSnapshot) | null = null;

// ======================================================
// Function : registerSnapshotSource
// Purpose  : Registers the function that supplies the current in-memory snapshot to be flushed to Postgres.
// ======================================================

export function registerSnapshotSource(fn: () => CoreSnapshot): void {
  snapshotSource = fn;
}

export function queueFlush(): void {
  if (!snapshotSource) return;
  pending = true;
  if (inFlight) return;

  const run = async (): Promise<void> => {
    while (pending) {
      pending = false;
      try {
        await flush(snapshotSource!());
      } catch (err) {
        console.error('[postgres] flush failed — retrying on next mutation:', err);
        break;
      }
    }
    inFlight = null;
  };

  inFlight = run();
}

// ======================================================
// Function : flushNow
// Purpose  : Awaitable flush, for shutdown and for the migration
//            script where "fire and forget" isn't good enough.
// ======================================================

export async function flushNow(): Promise<void> {
  if (inFlight) await inFlight;
  if (snapshotSource) await flush(snapshotSource());
}

// ======================================================
// END: queueFlush
// ======================================================

// ======================================================
// Function : loadAdmin
// Purpose  : Users / roles / report catalog / generated reports, read
//            from Postgres instead of the hardcoded arrays in
//            data/admin.ts. Rows now live only in Postgres (db/seed-admin.sql), so the Administration
//            and Reporting pages are reading real table data.
// ======================================================

export async function loadAdmin() {
  const [roles, users, reportCatalog, generatedReports] = await Promise.all([
    query<Record<string, unknown>>(`SELECT * FROM roles ORDER BY name`),
    query<Record<string, unknown>>(`SELECT * FROM users ORDER BY id`),
    query<Record<string, unknown>>(`SELECT * FROM report_catalog ORDER BY key`),
    query<Record<string, unknown>>(`SELECT * FROM generated_reports ORDER BY "reportDate" DESC, name`)
  ]);

  const mappedUsers = users.map(toUserView);

  return {
    // userCount is derived from the real users table below rather than a
    // separately-stored counter — that counter was seeded with arbitrary
    // placeholder numbers and only ever nudged by ±1 on create/delete, so
    // it drifted from what the Users list actually showed (e.g. staying
    // at "5 Administrators" after a delete+invite round-trip). Counting
    // the live rows means Roles & Permissions always matches Users.
    roles: roles.map((r) => ({
      name: String(r.name),
      userCount: mappedUsers.filter((u) => u.role === String(r.name)).length,
      access: String(r.access ?? ''),
      permissions: safeJson(r.permissions)
    })),
    users: mappedUsers,
    reportCatalog: reportCatalog.map((r) => ({
      key: String(r.key),
      name: String(r.name ?? ''),
      description: String(r.description ?? '')
    })),
    generatedReports: generatedReports.map((r) => ({
      name: String(r.name ?? ''),
      book: String(r.book ?? ''),
      period: String(r.period ?? ''),
      generatedBy: String(r.generatedBy ?? ''),
      date: String(r.reportDate ?? ''),
      format: String(r.format ?? ''),
      status: String(r.status ?? ''),
      csvContent: String(r.csvContent ?? '')
    }))
  };
}

// ======================================================
// Function : toUserView
// Purpose  : Maps a raw users row to the shape sent to the client. The
//            password is intentionally omitted (write-only, never sent).
// ======================================================

function toUserView(u: Record<string, unknown>): Record<string, unknown> {
  return {
    id: String(u.id),
    name: String(u.name ?? ''),
    email: String(u.email ?? ''),
    role: String(u.role ?? ''),
    lastActive: String(u.lastActive ?? ''),
    status: String(u.status ?? ''),
    menuAccess: safeJson(u.menuAccess)
  };
}

// ======================================================
// Function : safeJson
// Purpose  : Parses a JSON string into a menuAccess object; returns {} when it is malformed.
// ======================================================

function safeJson(raw: unknown): Record<string, boolean> {
  try {
    return JSON.parse(String(raw ?? '{}'));
  } catch {
    return {};
  }
}

// ======================================================
// END: loadAdmin
// ======================================================

// ======================================================
// END: admin
// ======================================================

// ======================================================
// Function : loadAssetClasses
// Purpose  : Configuration -> Asset Classes page. Same first-run
//            bootstrap shape as seedAdminIfEmpty above: seeds the
//            asset_classes table from the array in
//            data/assetClasses.ts exactly once (only when the table
//            is empty), then every read afterward comes straight out
//            of Postgres — Postgres is the source of truth from then
//            on, same as the asset book itself.
// ======================================================

// `id` is the row's sortOrder (primary key) - lets the UI delete a default row.
export type AssetClassRow = AssetClassSeedRow & { id?: number };

// Creates the table on first use, so the page works even if nobody ran
// `npm run db:schema:apply` yet (same DDL as db/schema.sql). Runs once.
let assetClassesTableReady: Promise<void> | null = null;
// ======================================================
// Function : ensureAssetClassesTable
// Purpose  : Creates the asset_classes table on first use (runs once).
// ======================================================

function ensureAssetClassesTable(): Promise<void> {
  if (!assetClassesTableReady) {
    assetClassesTableReady = pool.query(
      `CREATE TABLE IF NOT EXISTS asset_classes (
         "sortOrder"     INTEGER PRIMARY KEY,
         name            TEXT NOT NULL,
         "propertyType"  TEXT NOT NULL,
         method          TEXT NOT NULL,
         "ratePct"       TEXT NOT NULL,
         convention      TEXT NOT NULL,
         life            TEXT NOT NULL
       )`
    ).then(async () => {
      // Bonus % column (added later). When the column is new, rows named "... No Bonus" get 0
      // so they fill 0 into the Addition form; every other row stays blank until edited.
      const had = await query<Record<string, unknown>>(`SELECT 1 FROM information_schema.columns WHERE table_name='asset_classes' AND column_name='bonusPct'`);
      await pool.query(`ALTER TABLE asset_classes ADD COLUMN IF NOT EXISTS "bonusPct" TEXT NOT NULL DEFAULT ''`);
      if (!had.length) await pool.query(`UPDATE asset_classes SET "bonusPct"='0' WHERE name ILIKE '%No Bonus%'`);
      // One-time repair: the seed once lost the leading zero on the 00.xx classes
      // ("0.11", "0.12", "0.241" ... instead of "00.11", "00.12", "00.241").
      // Add the missing zero (only when the "00." name isn't already taken); harmless when already fixed.
      await pool.query(
        `UPDATE asset_classes a SET name='0' || a.name
          WHERE a.name ~ '^0\\.[0-9]+$'
            AND NOT EXISTS (SELECT 1 FROM asset_classes b WHERE b.name='0' || a.name)`
      );
      // Keep anything that already refers to an old name in step (tables may not exist yet - ignore).
      await pool.query(`UPDATE assets SET "assetClass"='0' || "assetClass" WHERE "assetClass" ~ '^0\\.[0-9]+$'`).catch(() => undefined);
      await pool.query(`UPDATE asset_class_custom_table SET "assetType"='0' || "assetType" WHERE "assetType" ~ '^0\\.[0-9]+$'`).catch(() => undefined);
    }).catch((err) => { assetClassesTableReady = null; throw err; });
  }
  return assetClassesTableReady;
}

// ======================================================
// Function : loadAssetClasses
// Purpose  : Reads every asset class row from Postgres in sort order.
// ======================================================

export async function loadAssetClasses(): Promise<AssetClassRow[]> {
  await ensureAssetClassesTable();
  const rows = await query<Record<string, unknown>>(
    `SELECT * FROM asset_classes ORDER BY "sortOrder" ASC`
  );
  return rows.map((r) => ({
    id: Number(r.sortOrder),
    name: String(r.name ?? ''),
    propertyType: String(r.propertyType ?? ''),
    method: String(r.method ?? ''),
    ratePct: String(r.ratePct ?? ''),
    convention: String(r.convention ?? ''),
    life: String(r.life ?? ''),
    bonusPct: String(r.bonusPct ?? '')
  }));
}

// ======================================================
// Function : deleteAssetClass
// Purpose  : Deletes one default asset class row (by its sortOrder id); false when it doesn't exist.
// ======================================================

export async function deleteAssetClass(id: number): Promise<boolean> {
  await ensureAssetClassesTable();
  const rows = await query<Record<string, unknown>>(`DELETE FROM asset_classes WHERE "sortOrder"=$1 RETURNING "sortOrder"`, [id]);
  return rows.length > 0;
}

// ======================================================
// Function : updateAssetClass
// Purpose  : Edits one Default Table row (by its sortOrder id) and returns the
//            saved row (null when it doesn't exist). When the Name is changed,
//            assets and Customize Table rules that used the old name follow it.
// ======================================================

export async function updateAssetClass(id: number, f: Omit<AssetClassRow, 'id'>): Promise<AssetClassRow | null> {
  await ensureAssetClassesTable();
  const old = await query<Record<string, unknown>>(`SELECT name FROM asset_classes WHERE "sortOrder"=$1`, [id]);
  if (!old.length) return null;
  const oldName = String(old[0].name ?? '');
  const rows = await query<Record<string, unknown>>(
    `UPDATE asset_classes
        SET name=$2, "propertyType"=$3, method=$4, "ratePct"=$5, convention=$6, life=$7, "bonusPct"=$8
      WHERE "sortOrder"=$1
      RETURNING *`,
    [id, f.name, f.propertyType, f.method, f.ratePct, f.convention, f.life, f.bonusPct ?? '']
  );
  if (oldName !== f.name) {
    await pool.query(`UPDATE assets SET "assetClass"=$2 WHERE "assetClass"=$1`, [oldName, f.name]).catch(() => undefined);
    await pool.query(`UPDATE asset_class_custom_table SET "assetType"=$2 WHERE "assetType"=$1`, [oldName, f.name]).catch(() => undefined);
  }
  const r = rows[0];
  return {
    id: Number(r.sortOrder),
    name: String(r.name ?? ''),
    propertyType: String(r.propertyType ?? ''),
    method: String(r.method ?? ''),
    ratePct: String(r.ratePct ?? ''),
    convention: String(r.convention ?? ''),
    life: String(r.life ?? ''),
    bonusPct: String(r.bonusPct ?? '')
  };
}

// ======================================================
// END: loadAssetClasses
// ======================================================

// ======================================================
// Function : Custom asset classes (Configuration -> Asset Classes ->
//            "Customize Table")
// Purpose  : User-added rules, same 6 columns as the default table (Name, Property
//            Type, Method, Rate %, Convention, Life). The Name is the Book
//            followed by the asset type, e.g. "GAAP - Acquisition"; the
//            two parts are stored separately so each can be edited.
//            Starts empty. The default asset_classes table is not touched
//            by edits here.
// ======================================================

export interface CustomAssetClassRow extends AssetClassRow {
  id: number;
  book: string;
  assetType: string;
}

let customRowsTableReady: Promise<void> | null = null;
// ======================================================
// Function : ensureCustomRowsTable
// Purpose  : Creates the asset_class_custom_table on first use (runs once).
// ======================================================

function ensureCustomRowsTable(): Promise<void> {
  if (!customRowsTableReady) {
    customRowsTableReady = pool.query(
      `CREATE TABLE IF NOT EXISTS asset_class_custom_table (
         id              SERIAL PRIMARY KEY,
         book            TEXT NOT NULL,
         "assetType"     TEXT NOT NULL,
         "propertyType"  TEXT NOT NULL,
         method          TEXT NOT NULL,
         "ratePct"       TEXT NOT NULL,
         convention      TEXT NOT NULL,
         life            TEXT NOT NULL,
         "bonusPct"      TEXT NOT NULL DEFAULT ''
       )`
    ).then(() => pool.query(`ALTER TABLE asset_class_custom_table ADD COLUMN IF NOT EXISTS "bonusPct" TEXT NOT NULL DEFAULT ''`)).then(() => undefined).catch((err) => { customRowsTableReady = null; throw err; });
  }
  return customRowsTableReady;
}

// ======================================================
// Function : toCustomRow
// Purpose  : Maps a raw custom-table row to a CustomAssetClassRow (Name = asset type; Book is its own field).
// ======================================================

function toCustomRow(r: Record<string, unknown>): CustomAssetClassRow {
  const book = String(r.book ?? '');
  const assetType = String(r.assetType ?? '');
  return {
    id: Number(r.id),
    book,
    assetType,
    name: assetType, // Book is a separate field - it is not part of the Name
    propertyType: String(r.propertyType ?? ''),
    method: String(r.method ?? ''),
    ratePct: String(r.ratePct ?? ''),
    convention: String(r.convention ?? ''),
    life: String(r.life ?? ''),
    bonusPct: String(r.bonusPct ?? '')
  };
}

// ======================================================
// Function : loadCustomAssetClasses
// Purpose  : Reads the custom asset class rows (rules the user added). No starter rows are seeded.
// ======================================================

export async function loadCustomAssetClasses(): Promise<CustomAssetClassRow[]> {
  await ensureCustomRowsTable();
  const rows = await query<Record<string, unknown>>(`SELECT * FROM asset_class_custom_table ORDER BY id ASC`);
  return rows.map(toCustomRow);
}

// ======================================================
// Function : updateCustomAssetClass
// Purpose  : Updates one custom asset class row and returns the saved row (null when not found).
// ======================================================

export async function updateCustomAssetClass(id: number, f: Omit<CustomAssetClassRow, 'id' | 'name'>): Promise<CustomAssetClassRow | null> {
  await ensureCustomRowsTable();
  const rows = await query<Record<string, unknown>>(
    `UPDATE asset_class_custom_table
        SET book=$2, "assetType"=$3, "propertyType"=$4, method=$5,
            "ratePct"=$6, convention=$7, life=$8, "bonusPct"=$9
      WHERE id=$1
      RETURNING *`,
    [id, f.book, f.assetType, f.propertyType, f.method, f.ratePct, f.convention, f.life, f.bonusPct ?? '']
  );
  return rows.length ? toCustomRow(rows[0]) : null;
}

// ======================================================
// Function : createCustomAssetClass
// Purpose  : Adds one custom asset class row (a depreciation rule for one
//            Book + asset type) and returns it. A book has no rule for an
//            asset class until a row like this exists — until then it just
//            mirrors Federal Tax (services/book-view.ts).
// ======================================================

export async function createCustomAssetClass(f: Omit<CustomAssetClassRow, 'id' | 'name'>): Promise<CustomAssetClassRow> {
  await ensureCustomRowsTable();
  const rows = await query<Record<string, unknown>>(
    `INSERT INTO asset_class_custom_table (book, "assetType", "propertyType", method, "ratePct", convention, life, "bonusPct")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [f.book, f.assetType, f.propertyType, f.method, f.ratePct, f.convention, f.life, f.bonusPct ?? '']
  );
  return toCustomRow(rows[0]);
}

// ======================================================
// Function : deleteCustomAssetClass
// Purpose  : Deletes one custom asset class row; false when it doesn't exist.
// ======================================================

export async function deleteCustomAssetClass(id: number): Promise<boolean> {
  await ensureCustomRowsTable();
  const rows = await query<Record<string, unknown>>(`DELETE FROM asset_class_custom_table WHERE id=$1 RETURNING id`, [id]);
  return rows.length > 0;
}

// ======================================================
// END: Custom asset classes
// ======================================================

// ======================================================
// Function : Asset class FACT TABLE (effective-dated versions)
// Purpose  : The Fact Table is append-only and permanent: rows are only ever
//            inserted (Postgres triggers reject UPDATE, DELETE and TRUNCATE),
//            so every update ever made to an asset class stays visible.
//            Every edit of a Default Table or Customize Table row is kept as
//            a version: the values that apply FROM the day of the edit.
//            The first edit of a row also stores its original values as a
//            baseline version (effectiveFrom 1900-01-01). Anything dated
//            before an edit keeps resolving to the older version, so e.g.
//            "Bonus 100% until yesterday, 90% from today" leaves old
//            assets at 100% (see resolveClassVersion callers).
//            classKey = "d:<sortOrder>" (default row) or "c:<id>" (custom rule).
// ======================================================

export interface ClassChange { field: string; from: string; to: string }
export interface ClassVersion {
  id: number;
  scope: 'default' | 'custom';
  classKey: string;
  name: string;
  book: string;
  effectiveFrom: string;
  changedAt: string;
  changedBy: string;
  propertyType: string;
  method: string;
  ratePct: string;
  convention: string;
  life: string;
  bonusPct: string;
  changes: ClassChange[];
}

export const CLASS_BASELINE_DATE = '1900-01-01';
const TRACKED_FIELDS = ['name', 'book', 'propertyType', 'method', 'ratePct', 'convention', 'life', 'bonusPct'] as const;

let historyTableReady: Promise<void> | null = null;
// ======================================================
// Function : ensureHistoryTable
// Purpose  : Creates the asset_class_fact_table table on first use (runs once), carries over rows
//            of its earlier name (asset_class_history), and installs the triggers that make it
//            append-only.
// ======================================================

function ensureHistoryTable(): Promise<void> {
  if (!historyTableReady) {
    historyTableReady = pool.query(
      `CREATE TABLE IF NOT EXISTS asset_class_fact_table (
         id               SERIAL PRIMARY KEY,
         scope            TEXT NOT NULL,
         "classKey"       TEXT NOT NULL,
         name             TEXT NOT NULL DEFAULT '',
         book             TEXT NOT NULL DEFAULT '',
         "effectiveFrom"  DATE NOT NULL,
         "changedAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
         "changedBy"      TEXT NOT NULL DEFAULT '',
         "propertyType"   TEXT NOT NULL DEFAULT '',
         method           TEXT NOT NULL DEFAULT '',
         "ratePct"        TEXT NOT NULL DEFAULT '',
         convention       TEXT NOT NULL DEFAULT '',
         life             TEXT NOT NULL DEFAULT '',
         "bonusPct"       TEXT NOT NULL DEFAULT '',
         changes          TEXT NOT NULL DEFAULT '[]'
       )`
    ).then(async () => {
      // The carry-over and the append-only triggers are extras: if the database refuses either,
      // log it and keep going so the Fact Table itself still loads and records.
      try {
      // Earlier builds called this table asset_class_history: copy its rows over once.
      const old = await query<Record<string, unknown>>(`SELECT to_regclass('asset_class_history') AS t`);
      if (old[0]?.t) {
        const [{ c }] = await query<{ c: string }>(`SELECT count(*) AS c FROM asset_class_fact_table`);
        if (Number(c) === 0) {
          await pool.query(
            `INSERT INTO asset_class_fact_table (scope, "classKey", name, book, "effectiveFrom", "changedAt", "changedBy", "propertyType", method, "ratePct", convention, life, "bonusPct", changes)
             SELECT scope, "classKey", name, book, "effectiveFrom", "changedAt", "changedBy", "propertyType", method, "ratePct", convention, life, "bonusPct", changes
               FROM asset_class_history ORDER BY id`
          );
        }
      }
      // Append-only: nothing may ever change or remove a Fact Table row.
      await pool.query(
        `CREATE OR REPLACE FUNCTION asset_class_fact_table_locked() RETURNS trigger AS $f$
         BEGIN RAISE EXCEPTION 'asset_class_fact_table is append-only: rows cannot be changed or deleted'; END;
         $f$ LANGUAGE plpgsql;
         DROP TRIGGER IF EXISTS asset_class_fact_table_no_change ON asset_class_fact_table;
         CREATE TRIGGER asset_class_fact_table_no_change BEFORE UPDATE OR DELETE ON asset_class_fact_table
           FOR EACH ROW EXECUTE FUNCTION asset_class_fact_table_locked();
         DROP TRIGGER IF EXISTS asset_class_fact_table_no_truncate ON asset_class_fact_table;
         CREATE TRIGGER asset_class_fact_table_no_truncate BEFORE TRUNCATE ON asset_class_fact_table
           FOR EACH STATEMENT EXECUTE FUNCTION asset_class_fact_table_locked();`
      );
      } catch (err) {
        console.error('[fact-table] carry-over / append-only triggers not installed:', err instanceof Error ? err.message : err);
      }
    }).then(() => undefined).catch((err) => { historyTableReady = null; throw err; });
  }
  return historyTableReady;
}

// ======================================================
// Function : toVersion
// Purpose  : Maps a raw history row to a ClassVersion.
// ======================================================

function toVersion(r: Record<string, unknown>): ClassVersion {
  const eff = r.effectiveFrom instanceof Date ? r.effectiveFrom.toISOString().slice(0, 10) : String(r.effectiveFrom ?? '').slice(0, 10);
  let changes: ClassChange[] = [];
  try { changes = JSON.parse(String(r.changes ?? '[]')); } catch { changes = []; }
  return {
    id: Number(r.id),
    scope: r.scope === 'custom' ? 'custom' : 'default',
    classKey: String(r.classKey ?? ''),
    name: String(r.name ?? ''),
    book: String(r.book ?? ''),
    effectiveFrom: eff,
    changedAt: r.changedAt instanceof Date ? r.changedAt.toISOString() : String(r.changedAt ?? ''),
    changedBy: String(r.changedBy ?? ''),
    propertyType: String(r.propertyType ?? ''),
    method: String(r.method ?? ''),
    ratePct: String(r.ratePct ?? ''),
    convention: String(r.convention ?? ''),
    life: String(r.life ?? ''),
    bonusPct: String(r.bonusPct ?? ''),
    changes
  };
}

// ======================================================
// Function : recordClassChange
// Purpose  : Called after an edit. Does nothing when no tracked field changed;
//            otherwise stores the baseline (first edit only) and the new
//            version effective from today.
// ======================================================

export async function recordClassChange(
  scope: 'default' | 'custom',
  classKey: string,
  beforeRow: object,
  afterRow: object,
  changedBy: string
): Promise<void> {
  await ensureHistoryTable();
  const before = beforeRow as Record<string, unknown>;
  const after = afterRow as Record<string, unknown>;
  const changes: ClassChange[] = [];
  for (const f of TRACKED_FIELDS) {
    const a = String(before[f] ?? '');
    const b = String(after[f] ?? '');
    if (a !== b) changes.push({ field: f, from: a, to: b });
  }
  if (!changes.length) return;
  const insert = (v: Record<string, unknown>, eff: string | null, by: string, ch: ClassChange[]) => pool.query(
    `INSERT INTO asset_class_fact_table (scope, "classKey", name, book, "effectiveFrom", "changedBy", "propertyType", method, "ratePct", convention, life, "bonusPct", changes)
     VALUES ($1,$2,$3,$4, COALESCE($5::date, CURRENT_DATE), $6,$7,$8,$9,$10,$11,$12,$13)`,
    [scope, classKey, String(v.name ?? ''), String(v.book ?? ''), eff, by, String(v.propertyType ?? ''), String(v.method ?? ''),
      String(v.ratePct ?? ''), String(v.convention ?? ''), String(v.life ?? ''), String(v.bonusPct ?? ''), JSON.stringify(ch)]
  );
  const [{ c }] = await query<{ c: string }>(`SELECT count(*) AS c FROM asset_class_fact_table WHERE scope=$1 AND "classKey"=$2`, [scope, classKey]);
  if (Number(c) === 0) await insert(before, CLASS_BASELINE_DATE, 'Original', []);
  await insert(after, null, changedBy || 'Unknown', changes);
}

// ======================================================
// Function : recordClassCreated
// Purpose  : Writes the first Fact Table entry of a newly added rule (its original values).
// ======================================================

export async function recordClassCreated(scope: 'default' | 'custom', classKey: string, rowObj: object, createdBy: string): Promise<void> {
  await ensureHistoryTable();
  const v = rowObj as Record<string, unknown>;
  const [{ c }] = await query<{ c: string }>(`SELECT count(*) AS c FROM asset_class_fact_table WHERE scope=$1 AND "classKey"=$2`, [scope, classKey]);
  if (Number(c) > 0) return;
  await pool.query(
    `INSERT INTO asset_class_fact_table (scope, "classKey", name, book, "effectiveFrom", "changedBy", "propertyType", method, "ratePct", convention, life, "bonusPct", changes)
     VALUES ($1,$2,$3,$4,$5::date,$6,$7,$8,$9,$10,$11,$12,'[]')`,
    [scope, classKey, String(v.name ?? ''), String(v.book ?? ''), CLASS_BASELINE_DATE, createdBy || 'Unknown', String(v.propertyType ?? ''), String(v.method ?? ''),
      String(v.ratePct ?? ''), String(v.convention ?? ''), String(v.life ?? ''), String(v.bonusPct ?? '')]
  );
}

// ======================================================
// Function : loadClassHistory
// Purpose  : Versions oldest-first (by effective date, then id). Optionally limited to one class.
// ======================================================

export async function loadClassHistory(scope?: string, classKey?: string): Promise<ClassVersion[]> {
  await ensureHistoryTable();
  const rows = scope && classKey
    ? await query<Record<string, unknown>>(`SELECT * FROM asset_class_fact_table WHERE scope=$1 AND "classKey"=$2 ORDER BY "effectiveFrom" ASC, id ASC`, [scope, classKey])
    : await query<Record<string, unknown>>(`SELECT * FROM asset_class_fact_table ORDER BY "effectiveFrom" ASC, id ASC`);
  return rows.map(toVersion);
}

// ======================================================
// END: Asset class change history
// ======================================================

// ======================================================
// Function : createGeneratedReport
// Purpose  : Insert one row into generated_reports — called when the
//            Reporting page's "+ Custom Report" card is submitted, so
//            the run shows up in "Recently Generated Reports" the same
//            way the seeded rows do (see loadAdmin's generatedReports
//            mapping, which reads this table back out ordered by
//            reportDate DESC).
// ======================================================

export async function createGeneratedReport(input: {
  name: string;
  book: string;
  period: string;
  generatedBy: string;
  date: string;
  format: string;
  status: string;
  csvContent?: string;
}): Promise<Record<string, unknown>> {
  const rows = await query<Record<string, unknown>>(
    `INSERT INTO generated_reports (name, book, period, "generatedBy", "reportDate", format, status, "csvContent")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING name, book, period, "generatedBy", "reportDate" AS date, format, status, "csvContent"`,
    [input.name, input.book, input.period, input.generatedBy, input.date, input.format, input.status, input.csvContent ?? '']
  );
  return rows[0];
}

// ======================================================
// END: createGeneratedReport
// ======================================================

// ======================================================
// Function : createUser
// Purpose  : Insert a new user row. Role headcounts are no longer a
//            stored counter (see loadAdmin) — they're derived live
//            from this table, so there's nothing else to update here.
// ======================================================

export async function createUser(input: {
  id: string;
  name: string;
  email: string;
  role: string;
  lastActive: string;
  status: string;
  password: string;
  menuAccess?: Record<string, { view: boolean; edit: boolean }>;
}): Promise<void> {
  await pool.query(
    `INSERT INTO users (id, name, email, role, "lastActive", status, password, "menuAccess")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [input.id, input.name, input.email, input.role, input.lastActive, input.status, input.password, JSON.stringify(input.menuAccess ?? {})]
  );
}

// ======================================================
// END: createUser
// ======================================================

// ======================================================
// Function : updateUser
// Purpose  : Edit an existing user (name/email/role/status/password).
// ======================================================

export async function updateUser(id: string, patch: {
  name: string;
  email: string;
  role: string;
  status: string;
  password?: string;
  menuAccess?: Record<string, { view: boolean; edit: boolean }>;
}): Promise<Record<string, unknown> | null> {
  const [existing] = await query<Record<string, unknown>>(`SELECT * FROM users WHERE id = $1`, [id]);
  if (!existing) return null;

  const updated = {
    id,
    name: patch.name,
    email: patch.email,
    role: patch.role,
    lastActive: String(existing.lastActive ?? ''),
    status: patch.status,
    // Only overwrite the stored password if a new one was actually
    // submitted — leaving the field blank means "keep current password".
    password: patch.password ? patch.password : String(existing.password ?? ''),
    // Only overwrite menuAccess when the caller actually sent a Page
    // Access map (e.g. from the Edit User modal). A plain rename/role
    // change from elsewhere shouldn't wipe out per-user overrides.
    menuAccess: JSON.stringify(patch.menuAccess ?? safeJson(existing.menuAccess))
  };

  await pool.query(
    `UPDATE users SET name = $2, email = $3, role = $4, status = $5, password = $6, "menuAccess" = $7 WHERE id = $1`,
    [updated.id, updated.name, updated.email, updated.role, updated.status, updated.password, updated.menuAccess]
  );

  return toUserView(updated);
}

// ======================================================
// END: updateUser
// ======================================================

// ======================================================
// Function : updateRolePermissions
// Purpose  : Flip a single capability on/off for a role in the
//            Permission Matrix. Reads the existing row, merges the one
//            changed capability into the stored permissions JSON, and
//            writes it back.
// ======================================================

export async function updateRolePermissions(
  name: string,
  capabilityKey: string,
  value: boolean
): Promise<{ name: string; access: string; permissions: Record<string, boolean> } | null> {
  const [existing] = await query<Record<string, unknown>>(`SELECT * FROM roles WHERE name = $1`, [name]);
  if (!existing) return null;

  const permissions = safeJson(existing.permissions);
  permissions[capabilityKey] = value;

  const updated = {
    name,
    access: String(existing.access ?? ''),
    permissions: JSON.stringify(permissions)
  };
  await pool.query(`UPDATE roles SET permissions = $2 WHERE name = $1`, [name, updated.permissions]);

  return { name, access: updated.access, permissions };
}

// ======================================================
// END: updateRolePermissions
// ======================================================

// ======================================================
// Function : deleteUser
// Purpose  : Remove a user row. Role headcounts recompute on next
//            read (see loadAdmin), so no separate counter to update.
// ======================================================

export async function deleteUser(id: string): Promise<boolean> {
  const result = await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

// ======================================================
// END: deleteUser
// ======================================================

// ======================================================
// Function : emailTaken
// Purpose  : Case-insensitive existence check used by self-registration
//            (POST /api/auth/register) so two people can't register the
//            same work email.
// ======================================================

export async function emailTaken(email: string): Promise<boolean> {
  const [existing] = await query<{ id: string }>(`SELECT id FROM users WHERE lower(email) = lower($1)`, [email]);
  return !!existing;
}

// ======================================================
// END: emailTaken
// ======================================================

// ======================================================
// Function : verifyLogin
// Purpose  : Real (still-prototype: plaintext) credential check for
//            POST /api/auth/login. Looks the row up by email — case
//            insensitive, since that's how people actually type emails —
//            and compares the stored password. On a match, flips an
//            "Invited" user to "Active" and stamps lastActive, same as
//            the old client-only mock used to fake, except this is now
//            the thing that actually gates access (see ProtectedRoute).
// ======================================================

export async function verifyLogin(email: string, password: string): Promise<Record<string, unknown> | null | 'PENDING'> {
  const [existing] = await query<Record<string, unknown>>(`SELECT * FROM users WHERE lower(email) = lower($1)`, [email]);
  if (!existing) return null;
  if (String(existing.password ?? '') !== password) return null;
  // Self-registered accounts sit in "Pending" until an admin reviews them
  // in User Management and assigns a role / Page Access, then saves —
  // that Save is what flips status to "Active". Until then, correct
  // credentials still don't get in.
  if (String(existing.status ?? '') === 'Pending') return 'PENDING';

  const updated = {
    id: String(existing.id),
    name: String(existing.name ?? ''),
    email: String(existing.email ?? ''),
    role: String(existing.role ?? ''),
    lastActive: 'Just now',
    status: 'Active',
    menuAccess: String(existing.menuAccess ?? '{}')
  };

  await pool.query(`UPDATE users SET "lastActive" = $2, status = $3 WHERE id = $1`, [updated.id, updated.lastActive, updated.status]);

  return toUserView(updated);
}

// ======================================================
// END: verifyLogin
// ======================================================

// ======================================================
// Function : markInactive
// Purpose  : Flip a user's status to "Inactive" on sign-out (POST
//            /api/auth/logout). Mirrors verifyLogin flipping it to
//            "Active" on sign-in. A no-op (returns false) if the id
//            doesn't exist, e.g. a stale session — logout should still
//            succeed client-side either way.
// ======================================================

export async function markInactive(id: string): Promise<boolean> {
  const result = await pool.query(`UPDATE users SET status = 'Inactive' WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

// ======================================================
// END: markInactive
// ======================================================

// ======================================================
// Notification feed (header bell) — persisted in Postgres.
// Rows are never trimmed automatically; they go away only via
// deleteNotification (the X button in the UI).
// ======================================================

export interface NotificationRow {
  seq: number;
  id: string;
  name: string;
  email: string;
  role: string;
  at: string;
  type: 'login' | 'registration';
}

let notificationsTableReady: Promise<unknown> | null = null;
// ======================================================
// Function : ensureNotificationsTable
// Purpose  : Creates the notifications table on first use (runs once; retries if creation failed).
// ======================================================

function ensureNotificationsTable(): Promise<unknown> {
  if (!notificationsTableReady) {
    notificationsTableReady = pool.query(
      `CREATE TABLE IF NOT EXISTS notifications (
         seq BIGSERIAL PRIMARY KEY,
         id TEXT NOT NULL DEFAULT '',
         name TEXT NOT NULL DEFAULT '',
         email TEXT NOT NULL DEFAULT '',
         role TEXT NOT NULL DEFAULT '',
         at TEXT NOT NULL DEFAULT '',
         type TEXT NOT NULL DEFAULT 'login'
       )`
    ).catch((err) => { notificationsTableReady = null; throw err; });
  }
  return notificationsTableReady;
}

// ======================================================
// Function : addNotification
// Purpose  : Saves one sign-in / registration notification to Postgres.
// ======================================================

export async function addNotification(n: Omit<NotificationRow, 'seq'>): Promise<void> {
  await ensureNotificationsTable();
  await pool.query(
    `INSERT INTO notifications (id, name, email, role, at, type) VALUES ($1,$2,$3,$4,$5,$6)`,
    [n.id, n.name, n.email, n.role, n.at, n.type]
  );
}

// ======================================================
// Function : listNotifications
// Purpose  : Reads every notification, newest first.
// ======================================================

export async function listNotifications(): Promise<NotificationRow[]> {
  await ensureNotificationsTable();
  const rows = await query<Record<string, unknown>>(`SELECT * FROM notifications ORDER BY seq DESC`);
  return rows.map((r) => ({
    seq: Number(r.seq),
    id: String(r.id),
    name: String(r.name),
    email: String(r.email),
    role: String(r.role),
    at: String(r.at),
    type: r.type === 'registration' ? 'registration' : 'login'
  }));
}

// ======================================================
// Function : deleteNotification
// Purpose  : Deletes one notification by seq; returns true when a row was removed.
// ======================================================

export async function deleteNotification(seq: number): Promise<boolean> {
  await ensureNotificationsTable();
  const result = await pool.query(`DELETE FROM notifications WHERE seq = $1`, [seq]);
  return (result.rowCount ?? 0) > 0;
}

// ======================================================
// Function : loadAssetTypeConfig
// Purpose  : Reads the depreciation asset-type table (code, label,
//            property type, method, convention, rate) from Postgres,
//            (rows come from db/asset-type-config.sql).
//            The calc-engine reads these rows (via
//            services/assetTypeConfig.ts) instead of hard-coded maps.
// ======================================================

let assetTypeConfigTableReady: Promise<void> | null = null;

function ensureAssetTypeConfigTable(): Promise<void> {
  if (!assetTypeConfigTableReady) {
    assetTypeConfigTableReady = pool.query(
      `CREATE TABLE IF NOT EXISTS asset_type_config (
         code            TEXT PRIMARY KEY,
         label           TEXT NOT NULL UNIQUE,
         "propertyType"  TEXT NOT NULL,
         method          TEXT NOT NULL,
         convention      TEXT NOT NULL,
         rate            NUMERIC NOT NULL DEFAULT 0,
         "sortOrder"     INTEGER NOT NULL DEFAULT 0,
         active          BOOLEAN NOT NULL DEFAULT TRUE
       )`
    ).then(() => undefined).catch((err) => { assetTypeConfigTableReady = null; throw err; });
  }
  return assetTypeConfigTableReady;
}

export async function loadAssetTypeConfig(): Promise<AssetTypeConfigRow[]> {
  await ensureAssetTypeConfigTable();
  const rows = await query<Record<string, unknown>>(
    `SELECT * FROM asset_type_config WHERE active = TRUE ORDER BY "sortOrder" ASC, code ASC`
  );
  return rows.map((r) => ({
    code: String(r.code ?? ''),
    label: String(r.label ?? ''),
    propertyType: String(r.propertyType ?? ''),
    method: String(r.method ?? ''),
    convention: String(r.convention ?? ''),
    rate: Number(r.rate ?? 0)
  }));
}

// ======================================================
// END: loadAssetTypeConfig
// ======================================================

// ======================================================
// Function : loadEngineTestCases
// Purpose  : Reads the calc-engine regression test cases from Postgres
//            (optionally for one engine). Replaces the test-case arrays
//            that used to sit inside each calc-engine .cjs file.
// ======================================================

export interface EngineTestCase {
  engine: string;
  caseId: string;
  name: string;
  inputs: Record<string, unknown>;
  expectedOutputs: Record<string, unknown>;
}

export async function loadEngineTestCases(engine?: string): Promise<EngineTestCase[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT engine, "caseId", name, inputs, "expectedOutputs"
       FROM engine_test_cases
      WHERE active = TRUE AND ($1::text IS NULL OR engine = $1)
      ORDER BY engine ASC, "sortOrder" ASC, "caseId" ASC`,
    [engine ?? null]
  );
  return rows.map((r) => ({
    engine: String(r.engine),
    caseId: String(r.caseId),
    name: String(r.name),
    inputs: (r.inputs ?? {}) as Record<string, unknown>,
    expectedOutputs: (r.expectedOutputs ?? {}) as Record<string, unknown>
  }));
}

// ======================================================
// END: loadEngineTestCases
// ======================================================

// ======================================================
// Function : loadRateTables
// Purpose  : Reads the IRS Pub 946 MACRS percentage tables from Postgres and
//            shapes them the way calc-engine/rate-tables.cjs load() expects.
// ======================================================

export interface RateTablesData {
  byYear: Record<string, Record<string, number[]>>;
  mm: Record<string, { year1: Record<string, number>; annual: number }>;
  adsLives: number[];
}

export async function loadRateTables(): Promise<RateTablesData> {
  const byYearRows = await query<Record<string, unknown>>(
    `SELECT "tableKey", life, year, "ratePct" FROM macrs_rate_by_year ORDER BY "tableKey", life, year`
  );
  const mmRows = await query<Record<string, unknown>>(
    `SELECT "tableKey", month, "year1Pct", "annualPct" FROM macrs_mm_rate ORDER BY "tableKey", month`
  );
  const lifeRows = await query<Record<string, unknown>>(`SELECT life FROM macrs_ads_lives ORDER BY life`);

  const byYear: RateTablesData['byYear'] = {};
  for (const r of byYearRows) {
    const key = String(r.tableKey);
    const life = String(r.life);
    const arr = ((byYear[key] ??= {})[life] ??= []);
    arr[Number(r.year) - 1] = Number(r.ratePct);
  }
  const mm: RateTablesData['mm'] = {};
  for (const r of mmRows) {
    const key = String(r.tableKey);
    const t = (mm[key] ??= { year1: {}, annual: Number(r.annualPct) });
    t.year1[String(r.month)] = Number(r.year1Pct);
  }
  return { byYear, mm, adsLives: lifeRows.map((r) => Number(r.life)) };
}

// ======================================================
// END: loadRateTables
// ======================================================

// ======================================================
// END: Repository Functions
// ======================================================

// ======================================================
// END OF FILE : repo.ts
// ======================================================

// ======================================================
// Function : books / form options / bonus rates (config tables)
// Purpose  : Read access for the tables that replaced the
//            hard-coded Books list, Lifecycle dropdown choices and the
//            bonus-depreciation reference data. Each table is created on
//            demand (same SQL as db/schema.sql) so a fresh deploy can't
//            crash. Rows come from db/config-tables.sql.
// ======================================================

let configTablesReady: Promise<void> | null = null;

function ensureConfigTables(): Promise<void> {
  if (!configTablesReady) {
    configTablesReady = (async () => {
      await pool.query(`CREATE TABLE IF NOT EXISTS books (
        name TEXT PRIMARY KEY, description TEXT NOT NULL DEFAULT '', "bookOfRecord" BOOLEAN NOT NULL DEFAULT FALSE,
        "periodCloseDate" TEXT NOT NULL DEFAULT '', "reportingMonthEnd" TEXT NOT NULL DEFAULT '', "reportingYearEnd" TEXT NOT NULL DEFAULT '',
        "sortOrder" INTEGER NOT NULL DEFAULT 0, active BOOLEAN NOT NULL DEFAULT TRUE)`);
      await pool.query(`CREATE TABLE IF NOT EXISTS bonus_depreciation_rates (
        id SERIAL PRIMARY KEY, "year" TEXT NOT NULL, pct NUMERIC NOT NULL DEFAULT 0, lpp NUMERIC NOT NULL DEFAULT 0,
        law TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', highlight BOOLEAN NOT NULL DEFAULT FALSE,
        "sortOrder" INTEGER NOT NULL DEFAULT 0, active BOOLEAN NOT NULL DEFAULT TRUE)`);
      await pool.query(`CREATE TABLE IF NOT EXISTS bonus_depreciation_rules (
        id SERIAL PRIMARY KEY, "effectiveFrom" DATE, "effectiveTo" DATE, pct NUMERIC NOT NULL DEFAULT 0,
        label TEXT NOT NULL DEFAULT '', "sortOrder" INTEGER NOT NULL DEFAULT 0, active BOOLEAN NOT NULL DEFAULT TRUE)`);
      await pool.query(`CREATE TABLE IF NOT EXISTS bonus_reference_rows (
        id SERIAL PRIMARY KEY, kind TEXT NOT NULL, data JSONB NOT NULL, "sortOrder" INTEGER NOT NULL DEFAULT 0, active BOOLEAN NOT NULL DEFAULT TRUE)`);
      await pool.query(`CREATE TABLE IF NOT EXISTS form_option_lists (
        list TEXT NOT NULL, value TEXT NOT NULL, "sortOrder" INTEGER NOT NULL DEFAULT 0, active BOOLEAN NOT NULL DEFAULT TRUE,
        PRIMARY KEY (list, value))`);
      await pool.query(`CREATE TABLE IF NOT EXISTS asset_class_labels (
        code TEXT PRIMARY KEY, label TEXT NOT NULL, "sortOrder" INTEGER NOT NULL DEFAULT 0, active BOOLEAN NOT NULL DEFAULT TRUE)`);
      await pool.query(`CREATE TABLE IF NOT EXISTS irs_class_lookup (
        code TEXT PRIMARY KEY, description TEXT NOT NULL, "classLife" TEXT NOT NULL DEFAULT '', gds TEXT NOT NULL DEFAULT '',
        ads TEXT NOT NULL DEFAULT '', "sortOrder" INTEGER NOT NULL DEFAULT 0, active BOOLEAN NOT NULL DEFAULT TRUE)`);
      await pool.query(`CREATE TABLE IF NOT EXISTS class_default_life ("assetClass" TEXT PRIMARY KEY, years NUMERIC NOT NULL)`);
      await pool.query(`CREATE TABLE IF NOT EXISTS modeling_scenarios (
        id SERIAL PRIMARY KEY, label TEXT NOT NULL, method TEXT NOT NULL, "bonusPct" NUMERIC NOT NULL DEFAULT 0,
        "recoveryPeriodYears" NUMERIC NOT NULL DEFAULT 0, "sortOrder" INTEGER NOT NULL DEFAULT 0, active BOOLEAN NOT NULL DEFAULT TRUE)`);
      await pool.query(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '')`);
      await pool.query(`CREATE TABLE IF NOT EXISTS companies (
        code TEXT PRIMARY KEY, name TEXT NOT NULL, "sortOrder" INTEGER NOT NULL DEFAULT 0, active BOOLEAN NOT NULL DEFAULT TRUE)`);
      await pool.query(`CREATE TABLE IF NOT EXISTS pub946_tables (
        id TEXT PRIMARY KEY, "shortName" TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '', subtitle TEXT NOT NULL DEFAULT '',
        convention TEXT NOT NULL DEFAULT '', columns JSONB NOT NULL DEFAULT '[]', data JSONB NOT NULL DEFAULT '[]',
        "sortOrder" INTEGER NOT NULL DEFAULT 0, active BOOLEAN NOT NULL DEFAULT TRUE)`);
    })().catch((err) => { configTablesReady = null; throw err; });
  }
  return configTablesReady;
}

// One value from app_settings (null when the key has no row).
export async function loadAppSetting(key: string): Promise<string | null> {
  await ensureConfigTables();
  const rows = await query<{ value: string }>(`SELECT value FROM app_settings WHERE key = $1`, [key]);
  return rows.length ? String(rows[0].value) : null;
}

// { code: full name } for the Company pickers.
export async function loadCompanies(): Promise<Record<string, string>> {
  await ensureConfigTables();
  const rows = await query<{ code: string; name: string }>(`SELECT code, name FROM companies WHERE active = TRUE ORDER BY "sortOrder" ASC, code ASC`);
  const out: Record<string, string> = {};
  for (const r of rows) out[r.code] = r.name;
  return out;
}

export interface Pub946TableRow { id: string; shortName: string; title: string; subtitle: string; convention: string; columns: string[]; data: number[][] }

export async function loadPub946Tables(): Promise<Pub946TableRow[]> {
  await ensureConfigTables();
  const rows = await query<Record<string, unknown>>(`SELECT * FROM pub946_tables WHERE active = TRUE ORDER BY "sortOrder" ASC, id ASC`);
  return rows.map((r) => ({
    id: String(r.id), shortName: String(r.shortName ?? ''), title: String(r.title ?? ''), subtitle: String(r.subtitle ?? ''),
    convention: String(r.convention ?? ''), columns: (r.columns as string[]) ?? [], data: (r.data as number[][]) ?? []
  }));
}

// { '00.12': 'Information Systems (Computers)', ... } for the Dashboard "assets by class" chart.
export async function loadAssetClassLabels(): Promise<Record<string, string>> {
  await ensureConfigTables();
  const rows = await query<{ code: string; label: string }>(`SELECT code, label FROM asset_class_labels WHERE active = TRUE ORDER BY "sortOrder" ASC, code ASC`);
  const out: Record<string, string> = {};
  for (const r of rows) out[r.code] = r.label;
  return out;
}

// Dashboard "Recent Activity" rows (lifecycle_activity), in the order they were inserted.
export async function loadRecentActivity(): Promise<LifecycleActivity[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT "assetNumber", description, event, amount, to_char("eventDate",'YYYY-MM-DD') AS date, status FROM lifecycle_activity ORDER BY id ASC`);
  return rows.map((r) => ({
    assetNumber: String(r.assetNumber), description: String(r.description ?? ''), event: String(r.event) as LifecycleActivity['event'],
    amount: Number(r.amount), date: String(r.date), status: String(r.status) as LifecycleActivity['status']
  }));
}

export interface IrsClassRow { code: string; description: string; classLife: string; gds: string; ads: string }

// IRS Table B-1 rows used by the asset-class lookup (irs_class_lookup).
export async function loadIrsClassRows(): Promise<IrsClassRow[]> {
  await ensureConfigTables();
  const rows = await query<Record<string, unknown>>(`SELECT code, description, "classLife", gds, ads FROM irs_class_lookup WHERE active = TRUE ORDER BY "sortOrder" ASC, code ASC`);
  return rows.map((r) => ({ code: String(r.code), description: String(r.description), classLife: String(r.classLife ?? ''), gds: String(r.gds ?? ''), ads: String(r.ads ?? '') }));
}

// { assetClass: default recovery years } (class_default_life).
export async function loadClassDefaultLife(): Promise<Record<string, number>> {
  await ensureConfigTables();
  const rows = await query<{ assetClass: string; years: string }>(`SELECT "assetClass", years FROM class_default_life`);
  const out: Record<string, number> = {};
  for (const r of rows) out[r.assetClass] = Number(r.years);
  return out;
}

// Scenario Modeling default scenarios (modeling_scenarios), in order.
export async function loadModelingScenarios(): Promise<Array<{ label: string; method: string; bonusPct: number; recoveryPeriodYears: number }>> {
  await ensureConfigTables();
  const rows = await query<Record<string, unknown>>(`SELECT label, method, "bonusPct", "recoveryPeriodYears" FROM modeling_scenarios WHERE active = TRUE ORDER BY "sortOrder" ASC, id ASC`);
  return rows.map((r) => ({ label: String(r.label), method: String(r.method), bonusPct: Number(r.bonusPct), recoveryPeriodYears: Number(r.recoveryPeriodYears) }));
}

export async function loadBooks(): Promise<BookDef[]> {
  await ensureConfigTables();
  const rows = await query<Record<string, unknown>>(`SELECT * FROM books WHERE active = TRUE ORDER BY "sortOrder" ASC, name ASC`);
  return rows.map((r) => ({
    name: String(r.name ?? ''),
    description: String(r.description ?? ''),
    bookOfRecord: r.bookOfRecord === true,
    periodCloseDate: String(r.periodCloseDate ?? ''),
    reportingMonthEnd: String(r.reportingMonthEnd ?? ''),
    reportingYearEnd: String(r.reportingYearEnd ?? '')
  }));
}

export async function loadFormOptionLists(): Promise<Record<string, string[]>> {
  await ensureConfigTables();
  const rows = await query<{ list: string; value: string }>(`SELECT list, value FROM form_option_lists WHERE active = TRUE ORDER BY list, "sortOrder" ASC, value ASC`);
  const out: Record<string, string[]> = {};
  for (const r of rows) (out[r.list] ??= []).push(r.value);
  return out;
}

export interface BonusConfig {
  rates: BonusRateRow[];
  rules: BonusRuleRow[];
  reference: { qualifyingRules: Array<Record<string, string>>; excludedProperty: Array<Record<string, string>>; vehicleLimits: Array<Record<string, string>> };
}

export async function loadBonusConfig(): Promise<BonusConfig> {
  await ensureConfigTables();
  const [rates, rules, ref] = await Promise.all([
    query<Record<string, unknown>>(`SELECT * FROM bonus_depreciation_rates WHERE active = TRUE ORDER BY "sortOrder" ASC, id ASC`),
    query<Record<string, unknown>>(
      `SELECT to_char("effectiveFrom",'YYYY-MM-DD') AS "effectiveFrom", to_char("effectiveTo",'YYYY-MM-DD') AS "effectiveTo", pct, label
         FROM bonus_depreciation_rules WHERE active = TRUE ORDER BY "sortOrder" ASC, id ASC`),
    query<Record<string, unknown>>(`SELECT kind, data FROM bonus_reference_rows WHERE active = TRUE ORDER BY "sortOrder" ASC, id ASC`)
  ]);
  const byKind = (k: string) => ref.filter((r) => r.kind === k).map((r) => r.data as Record<string, string>);
  return {
    rates: rates.map((r) => ({ year: String(r.year), pct: Number(r.pct), lpp: Number(r.lpp), law: String(r.law ?? ''), notes: String(r.notes ?? ''), highlight: r.highlight === true })),
    rules: rules.map((r) => ({ effectiveFrom: (r.effectiveFrom as string | null) ?? null, effectiveTo: (r.effectiveTo as string | null) ?? null, pct: Number(r.pct), label: String(r.label ?? '') })),
    reference: { qualifyingRules: byKind('qualifying_rule'), excludedProperty: byKind('excluded_property'), vehicleLimits: byKind('vehicle_limit') }
  };
}


// ======================================================
// Function : bonus custom rules (Configuration -> Bonus Depreciation -> Customize Table)
// Purpose  : Bonus % rules the user adds: Book / Company / Asset Type (blank = all)
//            + Year placed in service -> Bonus %. The default tables are never
//            touched by edits here. No starter rows are seeded.
// ======================================================

let bonusCustomReady: Promise<void> | null = null;

function ensureBonusCustomTable(): Promise<void> {
  if (!bonusCustomReady) {
    bonusCustomReady = (async () => {
      await pool.query(`CREATE TABLE IF NOT EXISTS bonus_depreciation_custom_table (
        id SERIAL PRIMARY KEY, book TEXT NOT NULL DEFAULT '', company TEXT NOT NULL DEFAULT '', "assetType" TEXT NOT NULL DEFAULT '',
        year INTEGER, pct NUMERIC NOT NULL DEFAULT 0)`);
      // Upgrade the earlier date-range layout in place.
      await pool.query(`ALTER TABLE bonus_depreciation_custom_table ADD COLUMN IF NOT EXISTS company TEXT NOT NULL DEFAULT ''`);
      await pool.query(`ALTER TABLE bonus_depreciation_custom_table ADD COLUMN IF NOT EXISTS "assetType" TEXT NOT NULL DEFAULT ''`);
      await pool.query(`ALTER TABLE bonus_depreciation_custom_table ADD COLUMN IF NOT EXISTS year INTEGER`);
      // Month-to-month period ('YYYY-MM'). Older year-only rows become Jan-Dec of that year.
      await pool.query(`ALTER TABLE bonus_depreciation_custom_table ADD COLUMN IF NOT EXISTS "fromMonth" TEXT`);
      await pool.query(`ALTER TABLE bonus_depreciation_custom_table ADD COLUMN IF NOT EXISTS "toMonth" TEXT`);
      await pool.query(`UPDATE bonus_depreciation_custom_table SET "fromMonth" = year::text || '-01' WHERE "fromMonth" IS NULL AND year IS NOT NULL`);
      await pool.query(`UPDATE bonus_depreciation_custom_table SET "toMonth" = year::text || '-12' WHERE "toMonth" IS NULL AND year IS NOT NULL`);
      // Exact day range ('YYYY-MM-DD', '' = open). Month rules are first day .. last day of the month;
      // this is what lets the Default Table's mid-month rows (e.g. 20 Jan 2025) be copied faithfully.
      await pool.query(`ALTER TABLE bonus_depreciation_custom_table ADD COLUMN IF NOT EXISTS "fromDate" TEXT`);
      await pool.query(`ALTER TABLE bonus_depreciation_custom_table ADD COLUMN IF NOT EXISTS "toDate" TEXT`);
      await pool.query(`UPDATE bonus_depreciation_custom_table SET "fromDate" = CASE WHEN COALESCE("fromMonth",'') = '' THEN '' ELSE "fromMonth" || '-01' END WHERE "fromDate" IS NULL`);
      await pool.query(`UPDATE bonus_depreciation_custom_table SET "toDate" = CASE WHEN COALESCE("toMonth",'') = '' THEN '' ELSE to_char((("toMonth" || '-01')::date + INTERVAL '1 month' - INTERVAL '1 day'), 'YYYY-MM-DD') END WHERE "toDate" IS NULL`);
      // Default Table columns copied into the Customize Table (Year label, LPP %, Authority, Notes, highlight).
      await pool.query(`ALTER TABLE bonus_depreciation_custom_table ADD COLUMN IF NOT EXISTS "yearLabel" TEXT`);
      await pool.query(`ALTER TABLE bonus_depreciation_custom_table ADD COLUMN IF NOT EXISTS lpp NUMERIC`);
      await pool.query(`ALTER TABLE bonus_depreciation_custom_table ADD COLUMN IF NOT EXISTS law TEXT NOT NULL DEFAULT ''`);
      await pool.query(`ALTER TABLE bonus_depreciation_custom_table ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT ''`);
      await pool.query(`ALTER TABLE bonus_depreciation_custom_table ADD COLUMN IF NOT EXISTS highlight BOOLEAN NOT NULL DEFAULT FALSE`);
      // active = FALSE: an untouched copy of a Default Table row. It is shown and editable but does not
      // override anything until the user edits it (then it becomes active).
      await pool.query(`ALTER TABLE bonus_depreciation_custom_table ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE`);
      await pool.query(`ALTER TABLE bonus_depreciation_custom_table ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0`);
      // One-time: start the Customize Table with a copy of the Default Table rows (same columns).
      await pool.query(`CREATE TABLE IF NOT EXISTS bonus_custom_seed_v2 (done BOOLEAN PRIMARY KEY)`);
      const seeded = await pool.query(`SELECT 1 FROM bonus_custom_seed_v2 LIMIT 1`);
      if (!seeded.rowCount) {
        await ensureConfigTables(); // Default Table (bonus_depreciation_rates) must exist first
        // Remove the earlier build's untouched copy of the date rules (blank scope, no Year label, same dates + %).
        await pool.query(`DELETE FROM bonus_depreciation_custom_table c
           WHERE c."yearLabel" IS NULL AND c.book = '' AND c.company = '' AND c."assetType" = ''
             AND EXISTS (SELECT 1 FROM bonus_depreciation_rules r WHERE r.active = TRUE AND c.pct = r.pct
                 AND COALESCE(c."fromDate",'') = COALESCE(to_char(r."effectiveFrom",'YYYY-MM-DD'),'')
                 AND COALESCE(c."toDate",'') = COALESCE(to_char(r."effectiveTo",'YYYY-MM-DD'),''))`);
        const rates = await pool.query(`SELECT "year", pct, lpp, law, notes, highlight, "sortOrder" FROM bonus_depreciation_rates WHERE active = TRUE ORDER BY "sortOrder" ASC, id ASC`);
        for (const r of rates.rows) {
          const per = periodFromYearLabel(String(r.year));
          await pool.query(
            `INSERT INTO bonus_depreciation_custom_table (book, company, "assetType", year, "fromMonth", "toMonth", "fromDate", "toDate", "yearLabel", pct, lpp, law, notes, highlight, active, "sortOrder")
             VALUES ('', '', '', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, FALSE, $12)`,
            [per.fromDate ? Number(per.fromDate.slice(0, 4)) : 0, per.fromDate.slice(0, 7), per.toDate.slice(0, 7), per.fromDate, per.toDate,
             String(r.year), Number(r.pct), Number(r.lpp), String(r.law ?? ''), String(r.notes ?? ''), r.highlight === true, Number(r.sortOrder)]
          );
        }
        // Only mark as done once something was copied; an empty Default Table is retried on the next start.
        if (rates.rowCount) await pool.query(`INSERT INTO bonus_custom_seed_v2 (done) VALUES (TRUE) ON CONFLICT DO NOTHING`);
      }
      // Repair: an earlier build mis-read labels like '2025-01-20 – Open' as the whole year 2025. The label
      // is exactly what the user saw, so re-read the dates from it when they disagree.
      const labelled = await pool.query(`SELECT id, "yearLabel", "fromDate", "toDate" FROM bonus_depreciation_custom_table WHERE "yearLabel" LIKE '% – %'`);
      const isoLabel = /^(\d{4}-\d{2}-\d{2}|Open) – (\d{4}-\d{2}-\d{2}|Open)$/;
      for (const row of labelled.rows) {
        if (!isoLabel.test(String(row.yearLabel))) continue;
        const per = parsePeriodLabel(String(row.yearLabel));
        if (per && (per.fromDate !== String(row.fromDate ?? '') || per.toDate !== String(row.toDate ?? ''))) {
          await pool.query(`UPDATE bonus_depreciation_custom_table SET "fromDate"=$2, "toDate"=$3, "fromMonth"=$4, "toMonth"=$5, year=$6 WHERE id=$1`,
            [row.id, per.fromDate, per.toDate, per.fromDate.slice(0, 7), per.toDate.slice(0, 7), per.fromDate ? Number(per.fromDate.slice(0, 4)) : 0]);
        }
      }
    })().catch((err) => { bonusCustomReady = null; throw err; });
  }
  return bonusCustomReady;
}

function toBonusCustomRow(r: Record<string, unknown>): BonusCustomRuleRow {
  const pct = Number(r.pct);
  const fromDate = String(r.fromDate ?? '');
  const toDate = String(r.toDate ?? '');
  return {
    id: Number(r.id), book: String(r.book ?? ''), company: String(r.company ?? ''), assetType: String(r.assetType ?? ''),
    year: Number(r.year), fromMonth: String(r.fromMonth ?? ''), toMonth: String(r.toMonth ?? ''), fromDate, toDate,
    yearLabel: String(r.yearLabel ?? '') || `${fromDate || 'Open'} – ${toDate || 'Open'}`,
    pct, lpp: r.lpp === null || r.lpp === undefined ? pct : Number(r.lpp),
    law: String(r.law ?? ''), notes: String(r.notes ?? ''), highlight: r.highlight === true, active: r.active !== false
  };
}

export async function loadBonusCustomRules(): Promise<BonusCustomRuleRow[]> {
  await ensureBonusCustomTable();
  const rows = await query<Record<string, unknown>>(`SELECT * FROM bonus_depreciation_custom_table WHERE year IS NOT NULL ORDER BY "sortOrder" ASC, id ASC`);
  return rows.map(toBonusCustomRow);
}

export async function createBonusCustomRule(f: Omit<BonusCustomRuleRow, 'id' | 'active'>): Promise<BonusCustomRuleRow> {
  await ensureBonusCustomTable();
  const rows = await query<Record<string, unknown>>(
    `INSERT INTO bonus_depreciation_custom_table (book, company, "assetType", year, "fromMonth", "toMonth", "fromDate", "toDate", "yearLabel", pct, lpp, law, notes, highlight, active, "sortOrder")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,TRUE,-1) RETURNING *`,
    [f.book, f.company, f.assetType, f.year, f.fromMonth, f.toMonth, f.fromDate, f.toDate, f.yearLabel, f.pct, f.lpp, f.law, f.notes, f.highlight]
  );
  return toBonusCustomRow(rows[0]);
}

// Editing a row (including an untouched copy of a Default row) makes it active.
export async function updateBonusCustomRule(id: number, f: Omit<BonusCustomRuleRow, 'id' | 'active'>): Promise<BonusCustomRuleRow | null> {
  await ensureBonusCustomTable();
  const rows = await query<Record<string, unknown>>(
    `UPDATE bonus_depreciation_custom_table SET book=$2, company=$3, "assetType"=$4, year=$5, "fromMonth"=$6, "toMonth"=$7, "fromDate"=$8, "toDate"=$9,
            "yearLabel"=$10, pct=$11, lpp=$12, law=$13, notes=$14, highlight=$15, active=TRUE WHERE id=$1 RETURNING *`,
    [id, f.book, f.company, f.assetType, f.year, f.fromMonth, f.toMonth, f.fromDate, f.toDate, f.yearLabel, f.pct, f.lpp, f.law, f.notes, f.highlight]
  );
  return rows.length ? toBonusCustomRow(rows[0]) : null;
}

export async function deleteBonusCustomRule(id: number): Promise<boolean> {
  await ensureBonusCustomTable();
  const rows = await query<Record<string, unknown>>(`DELETE FROM bonus_depreciation_custom_table WHERE id=$1 RETURNING id`, [id]);
  return rows.length > 0;
}
