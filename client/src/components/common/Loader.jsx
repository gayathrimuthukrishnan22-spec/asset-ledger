// ======================================================
// File Name : Loader.jsx
// Purpose   : Reusable UI component: Loader
// ======================================================


// ======================================================
// START: Component Functions
// ======================================================

/** Small inline loading indicator used while a page's data is still being fetched. */
// ======================================================
// Function : Loader
// Purpose  : React component that renders the 'Loader' UI
// ======================================================

export function Loader({ label = 'Loading…' }) {
    return (<div className="flex items-center gap-2 text-muted text-sm" style={{ padding: '24px 0' }}>
      <span style={{
            width: 14,
            height: 14,
            borderRadius: '50%',
            border: '2px solid var(--border)',
            borderTopColor: 'var(--accent)',
            display: 'inline-block',
            animation: 'spin 0.7s linear infinite'
        }}/>
      {label}
      <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
    </div>);
}

// ======================================================
// END: Loader
// ======================================================

// ======================================================
// END: Component Functions
// ======================================================

// ======================================================
// END OF FILE : Loader.jsx
// ======================================================
