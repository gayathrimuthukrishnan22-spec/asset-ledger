// ======================================================
// File Name : useFormOptions.js
// Purpose   : Loads the dropdown choices for the Lifecycle forms from the
//             database (GET /api/config/form-options) once per page load and
//             pours them into the shared option arrays in
//             data/lifecycleFormSchemas.js (hydrateFormOptions), so
//             FIELD_SCHEMAS and utils/csv.js see them too.
//               useFormOptions() -> { ready, lists }
// ======================================================

import { useEffect, useState } from 'react';
import { configApi } from '../api/config.api';
import { hydrateFormOptions } from '../data/lifecycleFormSchemas';

let cache = null;
let inflight = null;

// ======================================================
// Function : loadFormOptions
// Purpose  : Fetches + hydrates once and remembers it. A failure is not
//            cached, so the next mount simply tries again.
// ======================================================

function loadFormOptions() {
    if (cache) return Promise.resolve(cache);
    if (!inflight) {
        inflight = configApi.getFormOptions()
            .then((lists) => {
                hydrateFormOptions(lists);
                cache = lists;
                return lists;
            })
            .finally(() => { inflight = null; });
    }
    return inflight;
}

// ======================================================
// Function : useFormOptions
// Purpose  : React hook - re-renders the caller once the options have loaded.
// ======================================================

export function useFormOptions() {
    const [lists, setLists] = useState(cache);
    useEffect(() => {
        let alive = true;
        loadFormOptions()
            .then((l) => { if (alive) setLists(l); })
            .catch((err) => console.error('Failed to load form options:', err));
        return () => { alive = false; };
    }, []);
    return { ready: !!lists, lists: lists ?? {} };
}

// ======================================================
// END OF FILE : useFormOptions.js
// ======================================================
