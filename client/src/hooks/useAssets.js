// ======================================================
// File Name : useAssets.js
// Purpose   : Custom React hook: useAssets
// ======================================================

import { useEffect, useState } from 'react';
import { assetsApi } from '../api/assets.api';

// ======================================================
// START: Hook Functions
// ======================================================

/** Loads the filtered asset list, exposing loading/error state for the Asset Register page. */
// ======================================================
// Function : useAssets
// Purpose  : Custom hook that provides 'useAssets' state/behaviour
// ======================================================

export function useAssets(filters) {
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [reloadToken, setReloadToken] = useState(0);
    useEffect(() => {
        setLoading(true);
        setError(null);
        assetsApi
            .list(filters)
            .then((res) => {
            setItems(res.items);
            setTotal(res.total);
        })
            .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load assets'))
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters.assetClass, filters.company, filters.status, filters.method, filters.q, filters.book, reloadToken]);
    return { items, total, loading, error, reload: () => setReloadToken((t) => t + 1) };
}

// ======================================================
// END: useAssets
// ======================================================

// ======================================================
// END: Hook Functions
// ======================================================

// ======================================================
// END OF FILE : useAssets.js
// ======================================================
