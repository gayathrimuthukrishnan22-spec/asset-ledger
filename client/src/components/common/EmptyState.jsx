// ======================================================
// File Name : EmptyState.jsx
// Purpose   : Reusable UI component: EmptyState
// ======================================================


// ======================================================
// START: Component Functions
// ======================================================

// ======================================================
// Function : EmptyState
// Purpose  : React component that renders the 'EmptyState' UI
// ======================================================

export function EmptyState({ title, description, action }) {
    return (<div className="card-pad" style={{ textAlign: 'center', padding: '40px 20px' }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{title}</div>
      {description && <p className="text-muted text-sm mb-4">{description}</p>}
      {action}
    </div>);
}

// ======================================================
// END: EmptyState
// ======================================================

// ======================================================
// END: Component Functions
// ======================================================

// ======================================================
// END OF FILE : EmptyState.jsx
// ======================================================
