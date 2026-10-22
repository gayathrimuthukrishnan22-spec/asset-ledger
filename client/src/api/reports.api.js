// ======================================================
// File Name : reports.api.js
// Purpose   : API client functions for reports.api
// ======================================================

import { api } from './client';

// ======================================================
// START: API Client Functions
// ======================================================

export const reportsApi = {
    getCatalog: () => api.get('/reporting/catalog'),
    getRecent: () => api.get('/reporting/recent'),
    // "+ Custom Report" card (Reporting.jsx): persists the run's metadata
    // (name/book/period/who) so it shows up in "Recently Generated
    // Reports". The CSV file itself is built and downloaded client-side.
    generateReport: (payload) => api.post('/reporting/generate', payload),
    // Planning (Modeling + Forecasting) calls live here too, since the target
    // structure only calls out one extra api file per domain group.
    getModelingScenarios: () => api.get('/modeling/scenarios'),
    compareModelingScenarios: (basis, scenarios, baselineAssetNumbers = [], startYear = new Date().getFullYear(), bonusPctByYear = [], book) => api.post('/modeling/compare', { basis, scenarios, baselineAssetNumbers, startYear, bonusPctByYear, book }),
    getForecast: (years = 5, filters = {}) => {
        const params = new URLSearchParams({ years: String(years) });
        // Company / Asset Type are checkbox multi-selects — send whatever's
        // checked as a comma-separated list; an empty/undefined list means
        // "All" and is left off the query entirely.
        if (filters.company?.length) params.set('company', filters.company.join(','));
        if (filters.assetType?.length) params.set('assetType', filters.assetType.join(','));
        if (filters.book) params.set('book', filters.book);
        return api.get(`/forecasting?${params.toString()}`);
    }
};

// ======================================================
// END: API Client Functions
// ======================================================

// ======================================================
// END OF FILE : reports.api.js
// ======================================================
