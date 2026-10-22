// ======================================================
// File Name : integrations.ts
// Purpose   : "Pull" integrations — the app fetches data from an external
//             system (SAP) on a button click, shows a preview, and posts the
//             selected records as lifecycle events. Mounted at
//             /api/integrations.
//               GET  /sap/status   -> { mode: 'mock' | 'live' }
//               POST /sap/fetch    -> records + status (new/imported/invalid)
//               POST /sap/import   -> posts the chosen records as Additions
//             Already-imported records are skipped via integration_imports,
//             and posting reuses runBulkImport — the same code as Bulk Import.
// ======================================================

import { Router } from 'express';
import { runBulkImport } from './lifecycle.js';
import { buildMapper, fetchSapRecords, sapMode } from '../services/integrations/sapAdapter.js';
import { findImported, recordImported } from '../services/integrations/importLog.js';

export const integrationsRouter = Router();

const SOURCE = 'sap';
const MAX_IMPORT = 500;
const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

integrationsRouter.get('/sap/status', (_req, res) => {
  res.json({ mode: sapMode() });
});

integrationsRouter.post('/sap/fetch', async (req, res) => {
  const { from, to } = (req.body ?? {}) as { from?: string; to?: string };
  if ((from && !isDate(from)) || (to && !isDate(to))) {
    res.status(400).json({ error: 'from / to must be YYYY-MM-DD' });
    return;
  }

  try {
    const records = await fetchSapRecords({ from: from || undefined, to: to || undefined });
    const imported = await findImported(SOURCE, records.map((r) => r.documentId));
    const map = await buildMapper();

    res.json({
      mode: sapMode(),
      records: records.map((rec) => {
        if (imported.has(rec.documentId)) return { ...rec, status: 'imported' };
        const m = map(rec);
        return m.ok ? { ...rec, status: 'new' } : { ...rec, status: 'invalid', error: m.error };
      })
    });
  } catch (err) {
    console.error('SAP fetch failed:', err);
    res.status(502).json({ error: `Could not fetch from SAP: ${err instanceof Error ? err.message : 'unknown error'}` });
  }
});

integrationsRouter.post('/sap/import', async (req, res) => {
  const { documentIds, user } = (req.body ?? {}) as { documentIds?: string[]; user?: string };
  if (!Array.isArray(documentIds) || documentIds.length === 0) {
    res.status(400).json({ error: 'documentIds must be a non-empty array' });
    return;
  }
  if (documentIds.length > MAX_IMPORT) {
    res.status(413).json({ error: `Too many records (${documentIds.length}). Maximum per import is ${MAX_IMPORT}.` });
    return;
  }

  try {
    // Re-fetch on the server and look the chosen ids up — never trust amounts
    // or asset data sent back from the browser.
    const wanted = new Set(documentIds);
    const records = (await fetchSapRecords({})).filter((r) => wanted.has(r.documentId));
    const already = await findImported(SOURCE, records.map((r) => r.documentId));
    const map = await buildMapper();

    const results: Array<{ documentId: string; assetNumber: string; status: 'posted' | 'failed' | 'skipped'; error?: string }> = [];
    const toPost: Array<{ rec: (typeof records)[number]; assetNumber: string; fields: Record<string, unknown> }> = [];

    for (const id of documentIds) {
      const rec = records.find((r) => r.documentId === id);
      if (!rec) { results.push({ documentId: id, assetNumber: '', status: 'failed', error: 'Record not found in SAP' }); continue; }
      if (already.has(id)) { results.push({ documentId: id, assetNumber: rec.assetNumber, status: 'skipped', error: 'Already imported' }); continue; }
      const m = map(rec);
      if (!m.ok) { results.push({ documentId: id, assetNumber: rec.assetNumber, status: 'failed', error: m.error }); continue; }
      toPost.push({ rec, assetNumber: m.assetNumber, fields: m.fields });
    }

    const importedBy = `sap-sync:${(user ?? '').trim() || 'user'}`;
    if (toPost.length > 0) {
      const posted = await runBulkImport('Addition', toPost.map((t) => ({ assetNumber: t.assetNumber, fields: t.fields })), importedBy);
      const okEntries: Array<{ ref: string; assetNumber: string }> = [];
      posted.forEach((p, i) => {
        const t = toPost[i];
        results.push({ documentId: t.rec.documentId, assetNumber: t.assetNumber, status: p.status, error: p.error });
        if (p.status === 'posted') okEntries.push({ ref: t.rec.documentId, assetNumber: t.assetNumber });
      });
      await recordImported(SOURCE, okEntries, importedBy);
    }

    const count = (s: string) => results.filter((r) => r.status === s).length;
    res.json({ summary: { total: results.length, posted: count('posted'), failed: count('failed'), skipped: count('skipped') }, results });
  } catch (err) {
    console.error('SAP import failed:', err);
    res.status(502).json({ error: `SAP import failed: ${err instanceof Error ? err.message : 'unknown error'}` });
  }
});

// ======================================================
// END OF FILE : integrations.ts
// ======================================================
