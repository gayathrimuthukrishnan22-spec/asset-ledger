// ======================================================
// File Name : AssetTransactionsPanel.jsx
// Purpose   : Asset Detail → "Transactions" tab. Lists every lifecycle
//             event that has been "Confirm & Post"-ed for this asset
//             (read back from the Postgres asset_transactions ledger).
//             Clicking a row expands it in place to show the full
//             calculation exactly as it looked at the moment it was
//             posted — badge, summary rows, formula note, and the
//             step-by-step sections breakdown.
// ======================================================

import { useEffect, useState } from 'react';
import { lifecycleApi } from '../../api/lifecycle.api';
import { Loader } from '../common/Loader';
import { ErrorMessage } from '../common/ErrorMessage';
import { LifecycleTransactionsTable } from './LifecycleTransactionsTable';

// ======================================================
// START: Component Functions
// ======================================================

// ======================================================
// Function : AssetTransactionsPanel
// Purpose  : React component that renders the 'AssetTransactionsPanel' UI
// ======================================================

export function AssetTransactionsPanel({ assetNumber }) {
    const [items, setItems] = useState(null);
    const [error, setError] = useState(null);

    // ======================================================
    // Function : load
    // Purpose  : Fetches posted transactions for this asset from
    //            GET /api/lifecycle/transactions/:assetNumber
    // ======================================================

    function load() {
        setItems(null);
        setError(null);
        lifecycleApi
            .getTransactions(assetNumber)
            .then((data) => setItems(data.items))
            .catch((err) => setError(err.message));
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [assetNumber]);

    if (error) {
        return <ErrorMessage message={error} onRetry={load} />;
    }

    if (!items) {
        return <Loader label="Loading posted transactions…" />;
    }

    return (<LifecycleTransactionsTable
      items={items}
      showAssetColumn={false}
      emptyTitle="No transactions posted yet"
      emptyDescription="Events posted for this asset from the Lifecycle page will show up here, pulled from the Postgres ledger."
    />);
}

// ======================================================
// END: AssetTransactionsPanel
// ======================================================

// ======================================================
// END: Component Functions
// ======================================================

// ======================================================
// END OF FILE : AssetTransactionsPanel.jsx
// ======================================================
