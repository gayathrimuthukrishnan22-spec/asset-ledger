// ======================================================
// File Name : useAutoSelectAll.js
// Purpose   : Shared hook used by the Reporting, Modeling and Forecasting
//             filter bars to default a MultiSelect to "everything selected".
// ======================================================

import { useEffect } from 'react';

// ======================================================
// START: Hook Functions
// ======================================================

// ======================================================
// Function : useAutoSelectAll
// Purpose  : Defaults a checkbox MultiSelect to "everything selected"
//            once its option list is actually known (the list is empty
//            on first render, before the asset list has loaded).
// ======================================================

export function useAutoSelectAll(options, selected, setSelected) {
    useEffect(() => {
        if (options.length && selected.length === 0) setSelected(options.map((o) => o.value));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [options]);
}

// ======================================================
// END: useAutoSelectAll
// ======================================================

// ======================================================
// END: Hook Functions
// ======================================================

// ======================================================
// END OF FILE : useAutoSelectAll.js
// ======================================================
