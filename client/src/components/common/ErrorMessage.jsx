// ======================================================
// File Name : ErrorMessage.jsx
// Purpose   : Reusable UI component: ErrorMessage
// ======================================================


// ======================================================
// START: Component Functions
// ======================================================

// ======================================================
// Function : ErrorMessage
// Purpose  : React component that renders the 'ErrorMessage' UI
// ======================================================

export function ErrorMessage({ message, onRetry }) {
    return (<div className="card card-pad" style={{ borderColor: 'var(--red)' }}>
      <div className="flex items-center justify-between">
        <span style={{ color: 'var(--red)', fontSize: 13, fontWeight: 600 }}>{message}</span>
        {onRetry && (<button className="btn btn-ghost btn-sm" onClick={onRetry}>
            Retry
          </button>)}
      </div>
    </div>);
}

// ======================================================
// END: ErrorMessage
// ======================================================

// ======================================================
// END: Component Functions
// ======================================================

// ======================================================
// END OF FILE : ErrorMessage.jsx
// ======================================================
