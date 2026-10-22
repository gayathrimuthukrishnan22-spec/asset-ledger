# AssetLedger — Postgres (Neon) setup

Postgres is the **source of truth** for the asset book. `server/data-store.json`
is no longer authoritative; the server refuses to start if Postgres is unreachable.

## 1. Credentials

`server/.env`:

```
DATABASE_URL=postgresql://user:password@ep-xxxx.aws.neon.tech/neondb?sslmode=require
```

Get the real value from the Neon console -> your project -> **Connect**.

## 2. Install the new dependency

The ClickHouse client library was swapped for `pg`. From `server/`:

```bash
npm install
```

## 3. Apply the schema (run in order)

You already ran an earlier version of this by hand in the Neon SQL editor —
these files are now the canonical, in-repo copy, and every statement is
`CREATE TABLE IF NOT EXISTS` / `CREATE OR REPLACE VIEW`, so re-running them
is safe and won't touch existing data.

```bash
cd server
npm run db:schema:apply
```

(`db:schema:apply` runs `scripts/apply-schema.ts`, which uses the `pg`
library directly — no `psql` binary required. If you do have `psql` on
PATH, `npm run db:schema` works too.)

## 4. Move existing data in (one time)

```bash
npm run db:migrate
```

Reads `server/data-store.json`, generates a depreciation schedule for any asset
missing one, writes everything to Postgres, then renames the JSON file to
`data-store.json.migrated-YYYY-MM-DD` so nothing can read it back by accident.
Safe to re-run — it upserts rather than duplicating.

## 5. Verify

```bash
npm run db:check
```

Prints row counts, book totals (compare against the Dashboard KPI cards), any
assets still missing a depreciation schedule, and the last 10 posted transactions.

## What lives where

| Table | Holds | Written by |
|---|---|---|
| `assets` | the asset master | every mutation, via `persist()` |
| `asset_timeline` | Asset Detail → Lifecycle Timeline | `applyLifecycleEvent` |
| `asset_depreciation_schedule` | year-by-year schedule rows | `ensureSchedules` + lifecycle posts |
| `asset_transactions` | append-only posted-event ledger | `POST /api/lifecycle/post`, bulk import/post |
| `users`, `roles`, `report_catalog`, `generated_reports` | admin/reporting | bootstrap seed on first run |
| `v_monthly_depreciation` | SQL view behind the Dashboard chart | — |

## Adding new SQL

Put new DDL in a file under `server/db/`, add it to the `db:schema` script, and
read it through `server/src/db/repo.ts` — that is the only module that talks to
Postgres directly. Don't add a second client/pool instance; import `{ pool }`
from `src/db/postgres.ts`.

## Write path

`persist()` is synchronous at the call site but does a **serialized write-behind**
to Postgres: one flush in flight at a time, at most one queued. `SIGINT`/`SIGTERM`
await the final flush before exiting, so Ctrl-C doesn't drop a write. Each flush
runs inside a transaction, so it's all-or-nothing.

## Column casing

Column names that came from the TypeScript shapes (`assetNumber`, `accumDepreciation`,
`tfp_placedInService`, ...) are quoted with double quotes everywhere — in the schema
files and in every query in `repo.ts` / `lifecycle.ts`. Postgres folds *unquoted*
identifiers to lowercase, so if you add a new camelCase column, quote it consistently
on both the DDL side and the query side or lookups will silently return `undefined`.
