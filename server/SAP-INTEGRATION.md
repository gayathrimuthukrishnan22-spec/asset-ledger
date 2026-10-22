# SAP Integration (pull)

Menu: **Integrations -> SAP** (`/integrations/sap`). Click **Fetch from SAP**, review, **Import selected**.
Imports are posted as **Addition** lifecycle events through the same code as Bulk Import
(`posted_by = sap-sync:<user name>`).

## Modes
- **Mock** (default): built-in sample records, no setup. One sample has an unknown asset class to show an "invalid" row.
- **Live**: set in `server/.env` and restart:
  `SAP_BASE_URL=https://...`, optional `SAP_ASSETS_PATH` (default `/assets`), `SAP_API_TOKEN` (Bearer), `SAP_DEFAULT_BOOK` (default GAAP).
  The server calls `GET <SAP_BASE_URL><SAP_ASSETS_PATH>?from=&to=` and expects a JSON list (or `{ "records": [...] }`).

## Record format (SAMPLE - replace with the client's real SAP format)
`documentId, assetNumber, companyCode, assetClass, description, acquisitionCost, capitalizationDate (YYYY-MM-DD)`

Only `server/src/services/integrations/sapAdapter.ts` knows this format. When the real SAP response is known,
change `fetchSapRecords` / `mapToAddition` there — the page, duplicate check and posting stay the same.

## Duplicate protection
Imported SAP document ids are stored in `integration_imports` (created automatically). A document already
imported shows "Already imported" and is skipped. Failed rows are not recorded, so they can be retried.

## Current limits
- Acquisitions -> Addition only (Retirement / Transfer / Adjustment not mapped yet).
- Sample mapper handles personal-property classes with MACRS 200% DB half-year (3/5/7/10/15/20 yr).
  Other classes show "Needs attention" with the reason.
