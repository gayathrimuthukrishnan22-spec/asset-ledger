# Service API (machine-to-machine lifecycle posting + read-back)

For external systems (ERP, billing, ...) to post lifecycle events **and read the results back**. Posting runs the
**same pipeline** as the UI (Bulk Import page), so ledger rows and Asset Register updates are identical.
Writes are retry-safe (`externalRef`), and a key can be limited to certain event types and certain companies.

## 1. Create a service account (one per calling system)
Run on the server (needs `DATABASE_URL` in `server/.env`):
```
npm run service-account -- create erp --events addition,adjustment --companies 5B,2D --expires 2027-12-31
```
- The API key is printed **once** — copy it and hand it to the calling system securely. Only a hash is stored.
- `--events` limits which event types the key may post: `addition, adjustment, transfer, retirement, reinstatement, reclassification`
  (or `all` / leave out = everything). `--expires` is optional.
- `--companies` limits the key to those company codes (`all` / leave out = every company). It applies to **posting and reading** (see section 3).
- The name (`erp`) is shown in the ledger as **Posted By = `svc:erp`**.

Other commands:
```
npm run service-account -- list                      # accounts, allowed events, enabled/expiry, last used
npm run service-account -- disable erp               # cut a key off instantly (no restart)   |  enable erp
npm run service-account -- rotate erp                # new key; the old one stops working at once
npm run service-account -- set-events erp addition   # change allowed events  (or: all)
npm run service-account -- set-companies erp 5B,2D   # change allowed companies (or: all)
npm run service-account -- set-expiry erp 2027-12-31 # or: none
```
Why a command and not an HTTP endpoint or screen: the app's login is checked once at sign-in but the API has no
session token, so an HTTP "create key" endpoint would let anyone mint keys. Account management stays on the command line.

*Optional legacy setup:* `SERVICE_API_KEYS=erp:<key>` in `server/.env` still works (those keys may post every event type).
If there are no service accounts and no `SERVICE_API_KEYS`, every call returns **503** (the API is never open).

## 2. Calling it
Header `x-api-key: <key>` on every request. Missing / invalid / disabled / expired key -> **401**.
`postedBy` in the body is ignored; Posted By always comes from the account name.

### POST /api/service/lifecycle/events — one event
```json
{ "eventType": "Adjustment", "assetNumber": "FA-1001", "fields": { } }
```
**201** posted · **422** rejected (reason in `error`) · **403** key not allowed this event type · **400** bad request.

### POST /api/service/lifecycle/bulk-import — many rows, one event type
```json
{ "eventType": "Addition",
  "rows": [ { "assetNumber": "FA-1001", "fields": { "placedInService": "2026-03-15", "quarter": "Q1 (Jan–Mar)" } } ] }
```
**403** if the key may not post that event type.

### POST /api/service/lifecycle/bulk-post — many rows, mixed event types
```json
{ "rows": [ { "eventType": "Addition",   "assetNumber": "FA-1001", "fields": { } },
            { "eventType": "Adjustment", "assetNumber": "FA-1001", "fields": { } } ] }
```
Additions are processed first; results come back in the original row order. A row whose event type the key may not post
(or that is unknown) fails on its own — the other rows are still posted.

`eventType` is case-insensitive. `fields` keys are the same ones the UI forms use (see `client/src/data/lifecycleFormSchemas.js`).

### Retry safety: `externalRef`
Put your own document / line id in `externalRef` on every event (single event: the body field **or** an
`Idempotency-Key` header; bulk: one per row). The first time a ref is seen the event is posted; sending the **same
ref again** (timeout retry, batch re-sent) does **not** post a second ledger row - you get the original outcome back
with `"duplicate": true` (single event: **200** instead of 201).
- Refs are per key (erp's `INV-1` and billing's `INV-1` do not collide), max 200 characters.
- A ref reused for a **different** event (other asset / event type) is refused: **409**, `code: "ref_conflict"`.
- A ref whose first attempt is still running answers **409**, `code: "ref_in_progress"` - retry in a moment.
- A **failed** event does not keep its ref: fix the data and re-send with the same ref.
- The same ref twice inside one request fails the second row.
- Not sending a ref still works (no protection - Adjustment/Transfer/etc. rows would re-post on a retry; Additions are
  always protected by the one-Addition-per-asset rule).

### GET /api/service/lifecycle/events/by-ref/:ref - did it go through?
Answer to a timed-out POST. **200** `{ externalRef, state: "posted"|"pending", eventType, assetNumber, receivedAt, postedAt }`,
**404** = never received, or it failed (safe to re-send).

## 3. Reading data back (same `x-api-key`)
All reads are limited to the key's companies; an asset outside them is simply **404** / left out (existence is not revealed).
Lists take `limit` (1-500, default 100) and `offset`; a bad value is **400**.

| Endpoint | What |
|---|---|
| `GET /api/service/me` | who the key is, its allowed events and companies (connection test) |
| `GET /api/service/assets?book=&company=&status=&assetClass=&method=&q=&limit=&offset=` | assets in the register, sorted by number; `book` as in the UI (default Federal Tax) |
| `GET /api/service/assets/:assetNumber?book=` | one asset + timeline + depreciation schedule for that book |
| `GET /api/service/lifecycle/transactions?assetNumber=&eventType=&since=&until=&mine=true&limit=&offset=` | posted ledger rows, newest first, with the full calculation. `since`/`until`: `YYYY-MM-DD` or ISO time. `mine=true`: only rows this key posted. Response `{ total, limit, offset, items }` |

### Company limits (`--companies`)
- **Addition**: the row's `company` (blank = `5B`, as in the register) must be allowed.
- **Other events**: the asset's current company must be allowed. An asset that does not exist is refused (a limited key
  cannot create placeholder assets). An asset added earlier in the *same* batch counts.
- **Transfer**: the destination company (`destCompany`) must be allowed too.
- Refused rows fail with the reason in `error` (422 single event); the rest of a bulk request is still posted.
## Response (bulk endpoints, 200)
```json
{ "summary": { "total": 3, "posted": 2, "failed": 1 },
  "results": [ { "assetNumber": "FA-1001", "eventType": "Addition", "status": "posted", "externalRef": "R1" },
               { "assetNumber": "FA-1001", "eventType": "Addition", "status": "posted", "externalRef": "R1", "duplicate": true },
               { "assetNumber": "FA-1002", "eventType": "Addition", "status": "failed", "error": "..." } ] }
```
One failing row never stops the others — check each row's `status`. `duplicate: true` = already posted earlier, nothing new written.

## Errors
| Status | Meaning |
|---|---|
| 400 | `eventType` / `rows` / `assetNumber` missing or invalid; bad `limit` / `offset` / date / `eventType` filter on a read |
| 401 | missing, invalid, disabled or expired `x-api-key` |
| 403 | the key is not allowed to post that event type |
| 404 | (reads) asset unknown or outside the key's companies; `by-ref` ref not found |
| 409 | (single event) `externalRef` reused for a different event, or still being processed |
| 413 | more than `SERVICE_MAX_ROWS` rows (default 500), or body larger than `SERVICE_BODY_LIMIT` (default 10mb) |
| 422 | (single event) the event was rejected (validation, one-Addition rule, company limit) — see `error` |
| 503 | no service account / `SERVICE_API_KEYS` configured |

## Testing from the UI
Sign in -> Bulk Import -> "Test Service API" (`/lifecycle/service-api`). Paste a key, pick an event type, upload a CSV, send.
It also has a "send without key" checkbox (expect 401) and a 501-dummy-row button (expect 413; nothing is posted).

## Not covered (by design / future)
- A UI or HTTP endpoint for managing accounts - needs a real server-side session first; use the CLI.
- Rate limiting per key (only the per-request row / size caps exist).
- Webhooks (pushing results to the caller) - callers poll the read endpoints instead.
- The "Test Service API" UI page still only sends `bulk-import` without `externalRef`; use curl / Postman for the new fields.
