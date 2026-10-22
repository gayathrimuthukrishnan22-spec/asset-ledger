// ======================================================
// File Name : formatDate.js
// Purpose   : Utility helper functions for formatDate
// ======================================================


// ======================================================
// START: Utility Functions
// ======================================================

/** Format an ISO date string as e.g. "Apr 15, 2026". */
// ======================================================
// Function : formatDate
// Purpose  : Formats a value using 'formatDate'
// ======================================================

export function formatDate(iso) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

// ======================================================
// END: formatDate
// ======================================================

/** Format an ISO timestamp as e.g. "Sep 19, 2026, 3:30 PM GMT+5:30" in the
 *  VIEWER's own timezone. The server sends real UTC ISO strings
 *  (…Z) for posted_at, so this is always the correct local time. */
// ======================================================
// Function : formatDateTime
// Purpose  : Formats a full date + time for audit / ledger displays
// ======================================================

export function formatDateTime(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()))
        return '—';
    return d.toLocaleString('en-US', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZoneName: 'short'
    });
}

// ======================================================
// END: formatDateTime
// ======================================================

// ======================================================
// END: Utility Functions
// ======================================================

// ======================================================
// END OF FILE : formatDate.js
// ======================================================
