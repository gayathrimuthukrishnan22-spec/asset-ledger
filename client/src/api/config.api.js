// ======================================================
// File Name : config.api.js
// Purpose   : API client for Configuration pages. Asset Classes now
//             come out of Postgres (asset_classes table) instead of a
//             hardcoded array in the client bundle.
// ======================================================

import { api } from './client';

// ======================================================
// START: API Functions
// ======================================================

export const configApi = {
    getAssetClasses: () => api.get('/config/asset-classes'),
    lookupAssetClass: (q) => api.get(`/config/asset-class-lookup?q=${encodeURIComponent(q)}`),
    updateAssetClass: (id, body) => api.put(`/config/asset-classes/${id}`, body),
    deleteAssetClass: (id) => api.del(`/config/asset-classes/${id}`),
    getCustomAssetClasses: () => api.get('/config/asset-classes/custom'),
    updateCustomAssetClass: (id, body) => api.put(`/config/asset-classes/custom/${id}`, body),
    createCustomAssetClass: (body) => api.post('/config/asset-classes/custom', body),
    deleteCustomAssetClass: (id) => api.del(`/config/asset-classes/custom/${id}`),
    getClassHistory: (scope, id) => api.get(`/config/asset-classes/history?scope=${scope}&id=${id}`),
    getAllClassHistory: () => api.get('/config/asset-classes/history'),
    getFormOptions: () => api.get('/config/form-options'),
    getBonusRates: () => api.get('/config/bonus-rates'),
    resolveBonusPct: (p) => api.get(`/config/bonus-rates/resolve?${new URLSearchParams(p).toString()}`),
    getCustomBonusRules: () => api.get('/config/bonus-rates/custom'),
    createCustomBonusRule: (body) => api.post('/config/bonus-rates/custom', body),
    updateCustomBonusRule: (id, body) => api.put(`/config/bonus-rates/custom/${id}`, body),
    deleteCustomBonusRule: (id) => api.del(`/config/bonus-rates/custom/${id}`),
    getCompanies: () => api.get('/config/companies'),
    getPub946Tables: () => api.get('/config/pub946-tables'),
};

// ======================================================
// END: API Functions
// ======================================================

// ======================================================
// END OF FILE : config.api.js
// ======================================================
