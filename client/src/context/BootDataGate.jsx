// ======================================================
// File Name : BootDataGate.jsx
// Purpose   : Loads the database-backed reference data (books + default
//             book, company names) once, before any page renders, so pages
//             can read them synchronously. Shows a retry on failure.
// ======================================================

import { useCallback, useEffect, useState } from 'react';
import { loadBooks } from '../hooks/useBooks';
import { loadCompanies } from '../utils/companies';

export function BootDataGate({ children }) {
    const [state, setState] = useState({ ready: false, error: '' });

    const load = useCallback(() => {
        setState({ ready: false, error: '' });
        Promise.all([loadBooks(), loadCompanies()])
            .then(() => setState({ ready: true, error: '' }))
            .catch((err) => setState({ ready: false, error: err instanceof Error ? err.message : 'Could not reach the server' }));
    }, []);

    useEffect(() => { load(); }, [load]);

    if (state.ready) return children;
    return (<div style={{ padding: 40, textAlign: 'center' }}>
      {state.error
        ? (<><p>Could not load configuration from the database: {state.error}</p><button type="button" onClick={load}>Retry</button></>)
        : <p>Loading…</p>}
    </div>);
}

// ======================================================
// END OF FILE : BootDataGate.jsx
// ======================================================
