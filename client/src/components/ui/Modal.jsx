// ======================================================
// File Name : Modal.jsx
// Purpose   : Reusable UI component: Modal
// ======================================================


// ======================================================
// START: Component Functions
// ======================================================

/** Simple centered modal dialog, styled with the app's card/shadow tokens. */
// ======================================================
// Function : Modal
// Purpose  : React component that renders the 'Modal' UI
// ======================================================

export function Modal({ open, title, onClose, children, footer, width = 420 }) {
    if (!open)
        return null;
    return (<div onClick={onClose} style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 37, 64, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100
        }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width, maxWidth: '92vw', maxHeight: '85vh', boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column' }}>
        <div className="card-head" style={{ flexShrink: 0 }}>
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="card-pad" style={{ overflowY: 'auto', minHeight: 0 }}>{children}</div>
        {footer && (<div className="card-pad" style={{ borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            {footer}
          </div>)}
      </div>
    </div>);
}

// ======================================================
// END: Modal
// ======================================================

// ======================================================
// END: Component Functions
// ======================================================

// ======================================================
// END OF FILE : Modal.jsx
// ======================================================
