import { describe, expect, it } from 'vitest';
import { additionFields, assetNo, call, serverIsUp } from './helpers.js';

// The browser-side API (no API key) - same endpoints the UI Bulk Import page uses.
const up = await serverIsUp();
if (!up) console.warn('\n[tests] Server is not reachable - lifecycle API tests skipped. Start it with: npm run dev\n');
const d = describe.skipIf(!up);

d('Lifecycle API (/api/lifecycle, no key)', () => {
  const A = assetNo('L1');
  const body = { eventType: 'Addition', assetNumber: A, fields: additionFields() };

  it('health check is OK', async () => {
    const r = await call('GET', '/api/health', { key: null });
    expect(r.status).toBe(200);
  });

  it('lists event types', async () => {
    const r = await call('GET', '/api/lifecycle/event-types', { key: null });
    expect(r.status).toBe(200);
  });

  it('preview does NOT write to the ledger', async () => {
    const p = await call('POST', '/api/lifecycle/preview', { body, key: null });
    expect(p.status).toBe(200);

    const tx = await call('GET', `/api/lifecycle/transactions/${A}`, { key: null });
    expect(tx.status).toBe(200);
    const items = Array.isArray(tx.json) ? tx.json : tx.json?.items ?? [];
    expect(items.length).toBe(0);
  });

  it('bulk-import posts 2 new Additions', async () => {
    const r = await call('POST', '/api/lifecycle/bulk-import', {
      key: null,
      body: {
        eventType: 'Addition',
        rows: [
          { assetNumber: assetNo('L2'), fields: additionFields() },
          { assetNumber: assetNo('L3'), fields: additionFields() }
        ]
      }
    });
    expect(r.status).toBe(200);
    expect(r.json.summary).toMatchObject({ total: 2, posted: 2, failed: 0 });
  });

  it('posted rows appear in the asset transactions', async () => {
    const tx = await call('GET', `/api/lifecycle/transactions/${assetNo('L2')}`, { key: null });
    expect(tx.status).toBe(200);
    const items = Array.isArray(tx.json) ? tx.json : tx.json?.items ?? [];
    expect(items.length).toBeGreaterThanOrEqual(1);
  });
});
