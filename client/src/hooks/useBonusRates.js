// ======================================================
// File Name : useBonusRates.js
// Purpose   : Bonus-depreciation reference data from the database
//             (GET /api/config/bonus-rates), fetched once per page load.
//             Replaces the hard-coded BONUS_DATA table and bonusPctForDate()
//             if/else chain.
//               useBonusRates() -> { ready, rates, rules, reference, pctForDate }
// ======================================================

import { useEffect, useState } from 'react';
import { configApi } from '../api/config.api';

let cache = null;
let inflight = null;

function loadBonusRates() {
    if (cache) return Promise.resolve(cache);
    if (!inflight) {
        inflight = configApi.getBonusRates()
            .then((res) => { cache = res; return res; })
            .finally(() => { inflight = null; });
    }
    return inflight;
}

// ======================================================
// Function : pctFromRules
// Purpose  : Bonus % for a placed-in-service date 'YYYY-MM-DD' (first matching
//            date-range rule wins). null when the date is blank / incomplete.
// ======================================================

function pctFromRules(rules, iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return null;
    const hit = (rules ?? []).find((r) => (!r.effectiveFrom || r.effectiveFrom <= iso) && (!r.effectiveTo || iso <= r.effectiveTo));
    return hit ? hit.pct : null;
}

// ======================================================
// Function : useBonusRates
// Purpose  : React hook - re-renders the caller once the data has loaded.
// ======================================================

export function useBonusRates() {
    const [data, setData] = useState(cache);
    useEffect(() => {
        let alive = true;
        loadBonusRates()
            .then((res) => { if (alive) setData(res); })
            .catch((err) => console.error('Failed to load bonus rates:', err));
        return () => { alive = false; };
    }, []);
    const rules = data?.rules ?? [];
    return {
        ready: !!data,
        rates: data?.rates ?? [],
        rules,
        reference: data?.reference ?? { qualifyingRules: [], excludedProperty: [], vehicleLimits: [] },
        pctForDate: (iso) => pctFromRules(rules, iso)
    };
}

// ======================================================
// END OF FILE : useBonusRates.js
// ======================================================
