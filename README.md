# AssetLedger — React + Node.js conversion

A working full-stack conversion of the original static HTML prototype:
a **Node.js/Express API** (TypeScript, in-memory data) backing a
**React SPA** (Vite + TypeScript + React Router).

## Structure

```
asset-ledger/
├── server/     Express API — TypeScript, in-memory data layer, real
│               depreciation calculator (services/depreciation.ts)
└── client/     Vite + React + TypeScript SPA, react-router-dom routes,
                proxies /api/* to the server in dev
```

## Running it

Two terminals:

```bash
# 1. API — http://localhost:4000
cd server
npm install
npm run dev

# 2. Web app — http://localhost:5173
cd client
npm install
npm run dev
```

Open http://localhost:5173. Vite proxies `/api/*` requests to the
Express server (see `client/vite.config.ts`), so no CORS setup is
needed in dev even though `cors()` is enabled server-side too.

## What changed from the static prototype

- `assets/shell.js`'s `renderShell()` → `<Shell>` / `<Sidebar>` /
  `<Topbar>` React components (`client/src/layout/`). Active-nav
  highlighting and the breadcrumb are now props instead of a global
  function call.
- Each `*.html` page → a route component under `client/src/pages/`,
  wired up in `client/src/App.tsx` with `react-router-dom`.
- Repeated UI patterns (KPI stat cards, status pills, bar charts, the
  CSS conic-gradient donut) → reusable components in
  `client/src/components/ui.tsx`.
- All the hardcoded numbers in the HTML are now served by the API from
  `server/src/data/*.ts` (an in-memory "table" per entity — swap these
  modules for real DB queries later without touching the routes).
- The Lifecycle "Calculate Preview" and the Modeling scenario
  comparison used to show static, hand-typed numbers. They now call
  `POST /api/lifecycle/preview` and `POST /api/modeling/compare`,
  which run an actual (simplified) straight-line / half-year-convention
  depreciation calculation in `server/src/services/depreciation.ts`.
  This is illustrative, not a certified tax engine — see the note at
  the top of that file before using it for anything real.
- The original `assets/styles.css` carries over almost unchanged as
  `client/src/styles.css`; a few page-scoped `<style>` blocks
  (lifecycle event picker, report cards, user avatars) were merged in.

## 📚 Books (multi-book ledger)

The ledger used to maintain ONE book (Federal Tax). It now maintains every book on the
Books List (GAAP, Federal Tax, Federal Tax - E&P, DE, IA, IL, MS, NE, OK, OR, State AMT - QIP,
State No Bonus, State No Bonus - AMT, State QIP, TN). Every table has a **Book** dropdown;
picking a book reloads that table with that book's numbers. Federal Tax is still the default
and is exactly the data the app always showed.

**How a book's numbers are produced** (`server/src/services/book-view.ts`):

| Situation | What the table shows |
|---|---|
| Book = Federal Tax | The stored data, untouched. |
| Book has a rule for the asset's class (a row in **Configuration → Asset Classes → Customize Table** with that Book + asset type) | A schedule built from that rule's method / rate / convention / life. Accumulated depreciation and NBV are recomputed from it. |
| Book has NO rule for the asset's class | Mirrors Federal Tax, and the table says so in a note. |

Cost, in-service date and status are shared by all books; only depreciation differs.
Use **+ Add Rule** on the Customize Table to give a book its own treatment for an asset class.

| Table / page | Book dropdown |
|---|---|
| Dashboard → Monthly Depreciation, Assets by Class (and the KPI cards) | yes |
| Asset Register → Assets | yes (row click opens Asset Detail on the same book) |
| Asset Detail → Fact Pattern, Depreciation Schedule (and monthly drill-down) | yes |
| Planning → Forecasting → both tables | yes |
| Planning → Modeling → both tables | yes |
| Compliance → Reporting → Recently Generated (filter) and report generation (multi-select; CSV has a Book column, one block of rows per book) | yes |
| Asset Detail → Transactions / Audit Trail, Lifecycle posted events | no — an event posts once for all books, so there is one list |

API: `GET /api/books`; `?book=` on `/api/assets`, `/api/assets/:n`, `/api/assets/:n/monthly-depreciation`,
`/api/dashboard/summary`, `/api/dashboard/monthly-depreciation`, `/api/forecasting`; `book` in the body of
`POST /api/modeling/compare`. Unknown / missing book = Federal Tax. Rules: `POST` / `PUT` / `DELETE`
`/api/config/asset-classes/custom`.

## 🗂️ Where is everything? (file map)

```
asset-ledger-new/
├── server/                → Backend — Node.js + Express + TypeScript
│   ├── src/
│   │   ├── index.ts          → App entry point. Starts Express, mounts all routes.
│   │   ├── types.ts           → Shared TypeScript types (Asset, Transaction, etc.)
│   │   ├── data/               → In-memory "tables" (seed data + persist logic)
│   │   │   ├── assets.ts          → asset master data + initStore()/persist()/applyLifecycleEvent()
│   │   │   ├── activity.ts         → dashboard summary + recent activity feed
│   │   │   └── admin.ts             → users, roles, report catalog
│   │   ├── db/
│   │   │   ├── postgres.ts          → Postgres (Neon) pool connection (the `pool` object)
│   │   │   └── repo.ts               → ONLY file that talks to Postgres directly
│   │   ├── routes/                    → Express routes = your API endpoints
│   │   │   ├── assets.ts                 → /api/assets/*
│   │   │   ├── dashboard.ts               → /api/dashboard/*
│   │   │   ├── lifecycle.ts                → /api/lifecycle/*  (Addition, Transfer, Post, Bulk Import/Post)
│   │   │   ├── modeling.ts                  → /api/modeling/*  (scenario comparison)
│   │   │   └── misc.ts                       → /api/forecasting, /api/reporting, /api/users
│   │   └── services/
│   │       ├── depreciation.ts               → depreciation math (straight-line etc.)
│   │       └── schedule-builder.ts            → builds year-by-year schedule rows
│   ├── calc-engine/                    → lifecycle event calculators (.cjs)
│   │   └── additions.cjs, adjustments.cjs, disposals.cjs, reclassifications.cjs,
│   │       reinstatements.cjs, transfers.cjs, rate-tables.cjs
│   ├── db/                              → 🟢 DATABASE TABLE DEFINITIONS LIVE HERE
│   │   ├── schema.sql                      → base tables (assets, users, roles, ...)
│   │   ├── schema-core.sql                  → timeline + depreciation schedule tables
│   │   └── schema-transactions.sql           → posted-event ledger table
│   ├── scripts/                          → one-off scripts (apply-schema, migrate, seed, check)
│   ├── data-store.json                    → OLD local JSON fallback (Postgres is now the real source)
│   └── .env                                → 🔒 DB password etc. (NOT committed to git)
│
└── client/                 → Frontend — React + Vite
    └── src/
        ├── main.jsx / App.jsx      → app bootstrap + route table
        ├── pages/                    → one folder per screen (Dashboard, Assets, Lifecycle, ...)
        ├── components/                → reusable UI pieces (Table, Modal, Button, AssetCard, ...)
        ├── hooks/                       → useAssets.js, useAuth.js — data-fetching hooks
        ├── api/                          → thin fetch() wrappers, one per backend resource
        ├── layout/                        → Sidebar, Header, BottomNav, Footer
        └── data/                           → static reference tables (asset classes, IRS tables)
```

**Rule of thumb:** UI screen → `client/src/pages/`. API call → `server/src/routes/`.
Actual database table (columns) → `server/db/*.sql`. Depreciation math →
`server/src/services/depreciation.ts`.

## 🗃️ Database tables — full list (11 tables + 1 view)

All real tables live in `server/db/` as plain SQL (Postgres/Neon), applied in this order:
`schema.sql` → `schema-core.sql` → `schema-transactions.sql` (see `POSTGRES.md`).

| # | Table | Holds | Defined in |
|---|---|---|---|
| 1 | `assets` | Asset master (cost, NBV, method, status, tax facts, disposal info) | schema.sql |
| 2 | `lifecycle_activity` | Recent-activity feed on the Dashboard | schema.sql |
| 3 | `roles` | Role names + permission matrix | schema.sql |
| 4 | `users` | User accounts | schema.sql |
| 5 | `report_catalog` | List of report *types* available | schema.sql |
| 6 | `generated_reports` | Reports actually generated (Compliance page) | schema.sql |
| 7 | `dashboard_summary` | KPI snapshot row for the Dashboard | schema.sql |
| 8 | `forecast_snapshot` | 5-yr forecast snapshot | schema.sql |
| 9 | `asset_timeline` | Lifecycle Timeline shown on Asset Detail page | schema-core.sql |
| 10 | `asset_depreciation_schedule` | Year-by-year depreciation rows per asset | schema-core.sql |
| 11 | `asset_transactions` | Every "Confirm & Post" click — immutable ledger | schema-transactions.sql |
| — | `v_monthly_depreciation` (VIEW) | Same monthly-depreciation number as the Dashboard chart, queryable in SQL | schema-core.sql |

Credentials to connect are in `server/.env` (`DATABASE_URL`, the Neon connection
string) — gitignored on purpose, it holds the password.

## 🖱️ Click → Table map (what gets touched when you click something)

| Screen / Action (click) | API route hit | Table(s) touched |
|---|---|---|
| Open **Dashboard** | `GET /api/dashboard/summary` | `dashboard_summary`, `assets` |
| Dashboard → **Recent Activity** panel | `GET /api/dashboard/activity` | `lifecycle_activity` |
| Open **Asset Register** | `GET /api/assets` | `assets` |
| Click an asset row → **Asset Detail** | `GET /api/assets/:assetNumber` | `assets`, `asset_timeline`, `asset_depreciation_schedule` |
| Asset Detail → **Transactions** / **Audit Trail** tabs | `GET /api/lifecycle/transactions/:assetNumber` | `asset_transactions` |
| Asset Register → **Posted Lifecycle Events** table | `GET /api/lifecycle/transactions` | `asset_transactions` |
| Lifecycle event card → **Calculate Preview** | `POST /api/lifecycle/preview` | none saved — pure calculation |
| Lifecycle event card → **Confirm & Post** | `POST /api/lifecycle/post` | `asset_transactions` (new row) **+** `assets`, `asset_timeline`, `asset_depreciation_schedule` (all rewritten via `applyLifecycleEvent` → `repo.ts` `flush()`) |
| **Bulk Import** (CSV, one event type) → Import All | `POST /api/lifecycle/bulk-import` | same 4 tables as above, once per row |
| **Master Data Set** → Post All | `POST /api/lifecycle/bulk-post` | same 4 tables as above, once per row (Additions processed first) |
| **Planning → Modeling** → Compare Scenarios | `POST /api/modeling/compare` | none saved — pure calculation |
| **Planning → Forecasting** | `GET /api/forecasting` | `forecast_snapshot`, `asset_depreciation_schedule` |
| **Compliance → Reporting** | `GET /api/reporting/catalog`, `GET /api/reporting/recent` | `report_catalog`, `generated_reports` |
| **Administration → Users** | `GET /api/users`, `GET /api/users/roles` | `users`, `roles` |
| **Configuration → Asset Classes / Bonus Depreciation / Pub 946 Tables** | (none — served from `client/src/data/*.js`) | none — hardcoded reference data, not DB tables |

**Key idea:** every **Confirm & Post** click (single, Bulk Import, or Master
Data Set) is the one action that touches **4 tables in one go** —
`asset_transactions` (immutable ledger row) plus `assets`, `asset_timeline`,
and `asset_depreciation_schedule` (rewritten to reflect the new state).
Everything else on the site is either a read-only page load or a
client-side/preview-only calculation that saves nothing.

## 💹 Bonus Depreciation — Customize Table

Configuration → Bonus Depreciation → **Table: Customize Table**. It has exactly the
**Default Table's columns** — Year Placed in Service, Bonus %, Longer Production
Period / Aircraft, Legislative Authority, Notes — plus three extra columns at the
front: **Book, Company, Asset Type** (`-` / blank = all). Rows are editable
(`+ Add Rule`, Edit, Delete) and live in `bonus_depreciation_custom_table`.

**Starts as a copy of the Default Table.** The first time the server loads the
Customize Table it copies every active row of `bonus_depreciation_rates` (same
Year label, %, LPP %, authority, notes, highlight, order) with Book / Company /
Asset Type = all. This happens once (flag table `bonus_custom_seed_v2`); deleting
rows later does not re-copy. If the Default Table is empty at that moment
(config-tables.sql not run yet) nothing is copied and it is retried next start.
The earlier build's copy of the date rules is removed automatically (only rows
still identical to a default rule).

**Copied rows are marked "Default" and do not change any calculation until you
edit them.** Editing a row (or adding one) makes it active.

**Year Placed in Service decides the period.** Type it the way the Default Table
does: `2026`, `2027+`, `2026–2027`, `Jan 2026`, `Jan 2026 – Jun 2026`,
`2026-01 to 2026-06`, `Jan 2026+`, `2025 (acquired after 1/19/2025)`,
`Before 9/11/2001`. The server reads it (`parsePeriodLabel` in `bonusPeriod.ts`)
into exact From / To dates used for the calculation; an unrecognised text is
rejected with a hint. There are no separate date pickers.

**How an asset's Bonus % is chosen** (first hit wins):

1. An *active* Customize Table row whose period contains the asset's
   placed-in-service date and whose non-blank Book / Company / Asset Type all
   equal the asset's. Rows can be any combo (only Book, only Company, only
   Asset Type, or a mix). Most specific row (most non-blank fields) wins; on a
   tie Book beats Company beats Asset Type; then the newest row.
2. The Asset Class row's own Bonus %.
3. **Default Table** — the date-based IRS rules (`bonus_depreciation_rules`).

**Paste from Excel** (button above the table) adds many rows at once from cells
copied as `Book | Company | Asset Type | year | bonus %` (`-` = all; year like
`2026`, `2027+`, `Jan 2026 – Jun 2026` ...). 
A row with Book, Company **and** Asset Type set (e.g. Federal · 2D · 00.13) applies
only to assets that match all three and whose placed-in-service date falls in its
Year. In the Addition form, the Bonus % box then says where the value came from
("From Customize Table (Federal · 2D · 00.13; 2026)"); `/config/bonus-rates/resolve`
re-reads the saved rows on every call so edits apply immediately.

Year text also accepts the exact forms the table shows for old rows
(`2025-01-20 – Open`, `20 Jan 2025 – 31 Mar 2025`). On start the server re-reads
the dates of any row whose label is in that form, repairing rows an earlier build
had saved as a whole calendar year.

If no Customize Table row matches, the note under Bonus % lists exactly what was
compared (Book, Company, Asset Class, date, how many active rows were checked, and
any server error reading the table) — handy for finding a mismatch.

In the Addition form Bonus % is always filled by year: from the Placed-In-Service
Date, or (until that is entered) the Accounting Period Date, or today's year — and
it re-fills the moment the real date, Book, Company or Asset Class changes.

The Addition form (Lifecycle Events) has **Book** and **Company** fields and fills
Bonus % from this lookup; the value stays editable. If Bonus % is blank on the
server (e.g. bulk import) the same lookup runs. Active rows with the same Book /
Company / Asset Type cannot have overlapping periods (the API returns 409).

Code: `server/src/services/bonusRates.ts` (`customBonusPct`),
`server/src/services/bonusPeriod.ts`, `server/src/routes/misc.ts`
(`/config/bonus-rates/custom`, `/config/bonus-rates/resolve`),
`client/src/pages/Configuration/BonusDepreciation.jsx` (`CustomBonusTable`).

## ➕ Add Asset

**+ Add Asset** on the Asset Register opens the **Addition** form in Lifecycle Events
(`/lifecycle?type=addition`), the same form used for posting an Addition. The old
`/assets/new` address redirects there. The button shows for users with Lifecycle
edit access.

## API surface

| Method | Path | Notes |
|---|---|---|
| GET | `/api/dashboard/summary` | KPIs, monthly chart, class mix |
| GET | `/api/dashboard/activity` | Recent lifecycle activity |
| GET | `/api/assets?assetClass=&company=&status=&method=&q=` | Filterable register |
| GET | `/api/assets/:assetNumber` | Asset + timeline + schedule |
| GET | `/api/lifecycle/event-types` | Event type picker options |
| POST | `/api/lifecycle/preview` | **Live** depreciation preview calc |
| GET | `/api/modeling/scenarios` | Default scenario set |
| POST | `/api/modeling/compare` | **Live** scenario projection calc |
| GET | `/api/forecasting` | 5-yr forecast + roll-forward |
| GET | `/api/reporting/catalog` | Report type catalog |
| GET | `/api/reporting/recent` | Recently generated reports |
| GET | `/api/users` | Users |
| GET | `/api/users/roles` | Roles + permission matrix |

## Known gaps / next steps

- No auth — every route is open, matching the prototype's scope.
- Persistence now runs through Postgres (Neon) — see `POSTGRES.md`.
- Pagination on the Asset Register is cosmetic (shows the small seed
  set); wire up real paging once there's a real data source.
- Asset Detail's "Documents" tab is stubbed — no file storage is
  connected. "Overview", "Depreciation Schedule", "Transactions", and
  "Audit Trail" are all live now; Audit Trail reads the same
  Postgres `asset_transactions` ledger as Transactions, and every
  post now records the real logged-in user in `posted_by` (via
  `postedBy` in the /post, /bulk-import, and /bulk-post request
  bodies) instead of always defaulting to "system".
- **Production checklist**: `server/.env` is gitignored on purpose
  (it holds the Neon connection string), so it does NOT travel with a
  `git push` to your live host. `server/src/index.ts` refuses to boot
  at all if it can't reach Postgres — so if the live server has no
  `DATABASE_URL` set, it exits on startup and every page (Overview,
  Depreciation Schedule, Transactions, Audit Trail) will look empty,
  even though it works locally. Set that variable in your hosting
  platform's environment-variables screen (Render/Railway/Fly/etc.),
  same value as your local `server/.env`. If the client is deployed
  separately from the server, also set `VITE_API_URL` at build time
  to the server's public URL — otherwise the client calls `/api/...`
  on its OWN domain, which has no API behind it.
  Check `GET https://<your-server-domain>/api/health` — it should
  return `{ ok: true, postgres: true }`.
- The depreciation math is intentionally simplified (see the note in
  `services/depreciation.ts`); replace with a real tax engine before
  this touches actual filings.
- `server/CREATE`, `server/tsx`, and `server/asset-ledger-server@0.1.0`
  are stray **0-byte junk files** (likely from a mistyped terminal
  command) — they are not used by the app and are safe to delete.

## 🗄️ Values live in the DB, code holds only keys

No reference data is hard-coded any more (books + default book, bonus depreciation, form dropdowns,
asset types, asset classes, companies, Pub 946 tables, roles/users/report catalog). The server does
NOT seed anything at boot; it refuses to start (and names the SQL file) if a table is empty.

Fill the DB once (all files are safe to re-run):

```bash
cd server
npm run db:schema:apply   # tables (or: npm run db:schema)
npm run db:seed:assets    # optional: load the 9 sample assets (db/seed-assets.json)
npm run db:seed           # config-tables.sql, asset-type-config.sql, rate-tables.sql, seed-asset-classes.sql, seed-admin.sql, seed-activity.sql
```

Also moved to DB: IRS Table B-1 lookup rows (`irs_class_lookup`), default recovery years (`class_default_life`),
Modeling default scenarios (`modeling_scenarios`), asset-form method dropdown (`form_option_lists`, list `assetMethod`).
Optional one-time cleanup of old starter rows: `db/cleanup-legacy-custom-rows.sql`.

To change a value later, edit the row in Postgres (e.g. `UPDATE app_settings SET value='GAAP' WHERE key='defaultBook'`)
and restart the server. Code only knows the keys (`defaultBook`, list names such as `rateTable`, ...).
