// ======================================================
// File Name : integrations.api.js
// Purpose   : API client for the Integrations pages (SAP pull import)
// ======================================================

import { api } from './client';

export const integrationsApi = {
    sapStatus: () => api.get('/integrations/sap/status'),
    // { from?, to? } (YYYY-MM-DD) -> { mode, records: [{..., status: 'new'|'imported'|'invalid', error?}] }
    sapFetch: (range) => api.post('/integrations/sap/fetch', range),
    // { documentIds, user } -> { summary: {total, posted, failed, skipped}, results: [...] }
    sapImport: (input) => api.post('/integrations/sap/import', input)
};
