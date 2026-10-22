// ======================================================
// File Name : formatCurrency.js
// Purpose   : Utility helper functions for formatCurrency
// ======================================================


// ======================================================
// START: Utility Functions
// ======================================================

/** Format a number as USD currency. Pass { compact: true } for K/M/B suffixes (e.g. $1.2M). */
// ======================================================
// Function : formatCurrency
// Purpose  : Formats a value using 'formatCurrency'
// ======================================================

export function formatCurrency(n, opts = {}) {
    if (opts.compact) {
        const abs = Math.abs(n);
        if (abs >= 1e9)
            return `${n < 0 ? '-' : ''}$${(abs / 1e9).toFixed(2)}B`;
        if (abs >= 1e6)
            return `${n < 0 ? '-' : ''}$${(abs / 1e6).toFixed(1)}M`;
        if (abs >= 1e3)
            return `${n < 0 ? '-' : ''}$${(abs / 1e3).toFixed(1)}K`;
    }
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

// ======================================================
// END: formatCurrency
// ======================================================
// Backwards-compatible short alias used across older page code.
export const money = formatCurrency;

// ======================================================
// END: Utility Functions
// ======================================================

// ======================================================
// END OF FILE : formatCurrency.js
// ======================================================
