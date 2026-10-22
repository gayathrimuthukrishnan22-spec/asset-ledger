import { beforeAll, describe, expect, it } from 'vitest';
import { API_KEY, additionFields, assetNo, call, refNo, serverIsUp } from './helpers.js';

// Needs: server running (npm run dev) + TEST_SERVICE_API_KEY in server/.env
const up = await serverIsUp();
const runnable = up && !!API_KEY;
const d = describe.skipIf(!runnable);

if (!up) console.warn('\n[tests] Server is not reachable - service API tests skipped. Start it with: npm run dev\n');
else if (!API_KEY) console.warn('\n[tests] TEST_SERVICE_API_KEY not set in server/.env - service API tests skipped.\n');

d('Service API (x-api-key)', () => {
  const A = assetNo('S1');
  const REF = refNo('S1');

  it('rejects a call without a key (401)', async () => {
    const r = await call('GET', '/api/service/me', { key: null });
    expect(r.status).toBe(401);
  });

  it('rejects a wrong key (401)', async () => {
    const r = await call('GET', '/api/service/me', { key: 'definitely-wrong' });
    expect(r.status).toBe(401);
  });

  it('GET /me works with the key (200)', async () => {
    const r = await call('GET', '/api/service/me');
    expect(r.status).toBe(200);
  });

  it('posts a single Addition (201)', async () => {
    const r = await call('POST', '/api/service/lifecycle/events', {
      body: { eventType: 'Addition', assetNumber: A, externalRef: REF, fields: additionFields() }
    });
    expect(r.status).toBe(201);
    expect(r.json.status).toBe('posted');
  });

  it('same externalRef + same event again -> 200 duplicate:true', async () => {
    const r = await call('POST', '/api/service/lifecycle/events', {
      body: { eventType: 'Addition', assetNumber: A, externalRef: REF, fields: additionFields() }
    });
    expect(r.status).toBe(200);
    expect(r.json.duplicate).toBe(true);
  });

  it('same externalRef for a DIFFERENT asset -> 409 ref_conflict', async () => {
    const r = await call('POST', '/api/service/lifecycle/events', {
      body: { eventType: 'Addition', assetNumber: assetNo('S1-OTHER'), externalRef: REF, fields: additionFields() }
    });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe('ref_conflict');
  });

  it('by-ref shows the event as posted; unknown ref is 404', async () => {
    const ok = await call('GET', `/api/service/lifecycle/events/by-ref/${REF}`);
    expect(ok.status).toBe(200);
    expect(ok.json.state).toBe('posted');
    expect(ok.json.assetNumber).toBe(A);

    const missing = await call('GET', `/api/service/lifecycle/events/by-ref/${refNo('NEVER')}`);
    expect(missing.status).toBe(404);
  });

  it('second Addition for the same asset (new ref) is refused', async () => {
    const r = await call('POST', '/api/service/lifecycle/events', {
      body: { eventType: 'Addition', assetNumber: A, externalRef: refNo('S1-AGAIN'), fields: additionFields() }
    });
    expect(r.status).toBe(422);
  });

  it('unknown event type is rejected (400/403/422)', async () => {
    const r = await call('POST', '/api/service/lifecycle/events', {
      body: { eventType: 'Nonsense', assetNumber: assetNo('S1-X'), fields: {} }
    });
    expect([400, 403, 422]).toContain(r.status);
  });

  it('read-back: asset and its ledger rows are visible', async () => {
    const asset = await call('GET', `/api/service/assets/${A}`);
    expect(asset.status).toBe(200);

    const tx = await call('GET', `/api/service/lifecycle/transactions?assetNumber=${A}&limit=20`);
    expect(tx.status).toBe(200);
    expect(tx.json.total).toBeGreaterThanOrEqual(1);
    expect(tx.json.items.length).toBeGreaterThanOrEqual(1);
  });

  it('read-back: unknown asset is 404', async () => {
    const r = await call('GET', `/api/service/assets/${assetNo('NOPE')}`);
    expect(r.status).toBe(404);
  });

  it('bad limit on a read is 400', async () => {
    const r = await call('GET', '/api/service/assets?limit=99999');
    expect(r.status).toBe(400);
  });
});

d('Service API - bulk', () => {
  it('bulk-import: 2 good rows + 1 duplicate Addition -> posted 2, failed 1', async () => {
    const a1 = assetNo('B1');
    const a2 = assetNo('B2');
    const r = await call('POST', '/api/service/lifecycle/bulk-import', {
      body: {
        eventType: 'Addition',
        rows: [
          { assetNumber: a1, externalRef: refNo('B1'), fields: additionFields() },
          { assetNumber: a2, externalRef: refNo('B2'), fields: additionFields() },
          // same asset as row 1 with a new ref -> breaks the one-Addition-per-asset rule
          { assetNumber: a1, externalRef: refNo('B3'), fields: additionFields() }
        ]
      }
    });
    expect(r.status).toBe(200);
    expect(r.json.summary).toMatchObject({ total: 3, posted: 2, failed: 1 });
    expect(r.json.results.map((x: any) => x.status)).toEqual(['posted', 'posted', 'failed']);
  });

  it('re-sending the same bulk (same refs) writes nothing new: duplicate:true', async () => {
    const a = assetNo('B4');
    const body = {
      eventType: 'Addition',
      rows: [{ assetNumber: a, externalRef: refNo('B4'), fields: additionFields() }]
    };
    const first = await call('POST', '/api/service/lifecycle/bulk-import', { body });
    expect(first.json.summary.posted).toBe(1);

    const again = await call('POST', '/api/service/lifecycle/bulk-import', { body });
    expect(again.status).toBe(200);
    expect(again.json.results[0].duplicate).toBe(true);

    const tx = await call('GET', `/api/service/lifecycle/transactions?assetNumber=${a}`);
    expect(tx.json.total).toBe(1); // still exactly one ledger row
  });

  it('bulk-post (mixed) with a bad row: other rows still post', async () => {
    const a = assetNo('M1');
    const r = await call('POST', '/api/service/lifecycle/bulk-post', {
      body: {
        rows: [
          { eventType: 'Addition', assetNumber: a, externalRef: refNo('M1'), fields: additionFields() },
          { eventType: 'Nonsense', assetNumber: assetNo('M2'), externalRef: refNo('M2'), fields: {} }
        ]
      }
    });
    expect(r.status).toBe(200);
    expect(r.json.results[0].status).toBe('posted');
    expect(r.json.results[1].status).toBe('failed');
  });

  it('more than SERVICE_MAX_ROWS rows is rejected (413)', async () => {
    const max = Number(process.env.SERVICE_MAX_ROWS ?? 500);
    const rows = Array.from({ length: max + 1 }, (_, i) => ({
      assetNumber: assetNo(`X${i}`),
      fields: additionFields()
    }));
    const r = await call('POST', '/api/service/lifecycle/bulk-import', { body: { eventType: 'Addition', rows } });
    expect(r.status).toBe(413);
  });
});
