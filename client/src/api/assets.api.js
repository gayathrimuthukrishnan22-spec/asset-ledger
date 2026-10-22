// ======================================================
// File Name : assets.api.js
// Purpose   : API client functions for assets.api
// ======================================================

import { api } from './client';

// ======================================================
// START: API Client Functions
// ======================================================

// ?book=... (or &book=... when the URL already has a query string); empty when no book is given.
function bookQuery(book, joiner = '?') {
    return book ? `${joiner}book=${encodeURIComponent(book)}` : '';
}

export const assetsApi = {
    // Every read below takes an optional book (default: the server's Federal Tax).
    getDashboardSummary: (book) => api.get(`/dashboard/summary${bookQuery(book)}`),
    getDashboardActivity: () => api.get('/dashboard/activity'),
    getMonthlyDepreciation: (fy, book) => api.get(`/dashboard/monthly-depreciation?fy=${fy}${bookQuery(book, '&')}`),
    getAssetMonthlyDepreciation: (assetNumber, year, book) => api.get(`/assets/${assetNumber}/monthly-depreciation?year=${year}${bookQuery(book, '&')}`),
    list: (filters = {}) => {
        const params = new URLSearchParams();
        if (filters.assetClass)
            params.set('assetClass', filters.assetClass);
        if (filters.company)
            params.set('company', filters.company);
        if (filters.status)
            params.set('status', filters.status);
        if (filters.method)
            params.set('method', filters.method);
        if (filters.q)
            params.set('q', filters.q);
        if (filters.book)
            params.set('book', filters.book);
        return api.get(`/assets?${params.toString()}`);
    },
    getByNumber: (assetNumber, book) => api.get(`/assets/${assetNumber}${bookQuery(book)}`),
    create: (asset) => api.post('/assets', asset)
};

// ======================================================
// END: API Client Functions
// ======================================================

// ======================================================
// END OF FILE : assets.api.js
// ======================================================
