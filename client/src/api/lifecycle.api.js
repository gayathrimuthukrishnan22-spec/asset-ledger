// ======================================================
// File Name : lifecycle.api.js
// Purpose   : API client functions for lifecycle.api
// ======================================================

import { api, API_BASE } from './client';

// ======================================================
// START: API Client Functions
// ======================================================

export const lifecycleApi = {
    getEventTypes: () => api.get('/lifecycle/event-types'),
    preview: (input) => api.post('/lifecycle/preview', input),
    post: (input) => api.post('/lifecycle/post', input),
    // Bulk Import page — posts every parsed CSV row for one event type in
    // a single request; server loops the same preview+post logic per row.
    bulkImport: (input) => api.post('/lifecycle/bulk-import', input),
    // Master Data Set page — posts a batch of rows that can each carry
    // their own event type (unlike bulkImport, which shares one event
    // type across the whole batch). Covers both "same transaction to many
    // assets" and "multiple transactions on one asset".
    bulkPost: (input) => api.post('/lifecycle/bulk-post', input),
    // Posted transactions for one asset, read back from Postgres —
    // powers the Asset Detail → "Transactions" tab.
    getTransactions: (assetNumber) => api.get(`/lifecycle/transactions/${assetNumber}`),
    // Posted transactions for EVERY asset, newest first — powers the
    // Asset Register page's "Posted Lifecycle Events" table.
    getAllTransactions: (limit = 200) => api.get(`/lifecycle/transactions?limit=${limit}`),
    // Service API test page — calls the machine-to-machine endpoint with an
    // x-api-key header. Returns { status, ok, body } instead of throwing, so
    // the page can show 401 / 413 / 503 responses as they really come back.
    serviceBulkImport: async (apiKey, input) => {
        const headers = { 'Content-Type': 'application/json' };
        if (apiKey) headers['x-api-key'] = apiKey;
        const res = await fetch(`${API_BASE}/service/lifecycle/bulk-import`, { method: 'POST', headers, body: JSON.stringify(input) });
        let body = null;
        try { body = await res.json(); } catch { /* non-JSON body */ }
        return { status: res.status, ok: res.ok, body };
    }
};

// ======================================================
// END: API Client Functions
// ======================================================

// ======================================================
// END OF FILE : lifecycle.api.js
// ======================================================
