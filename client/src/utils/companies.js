// ======================================================
// File Name : companies.js
// Purpose   : Company code -> full legal entity name for the Company pickers.
//             The names come from the database (GET /api/config/companies);
//             nothing is hard-coded. Loaded once at start-up (BootDataGate).
//             An unmapped code falls back to itself.
// ======================================================

import { configApi } from '../api/config.api';

let names = null;
let inflight = null;

export function loadCompanies() {
    if (names) return Promise.resolve(names);
    if (!inflight) {
        inflight = configApi.getCompanies()
            .then((res) => { names = res ?? {}; return names; })
            .finally(() => { inflight = null; });
    }
    return inflight;
}

export function companyName(code) {
    return names?.[code] ?? code;
}

// ======================================================
// END OF FILE : companies.js
// ======================================================
