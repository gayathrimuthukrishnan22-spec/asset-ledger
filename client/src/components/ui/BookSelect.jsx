// ======================================================
// File Name : BookSelect.jsx
// Purpose   : The Book dropdown that sits on every table. Picking a
//             book re-loads that table with that book's data (the page
//             owns the `book` state and passes it to its API calls).
// Props     : value     — the selected book name
//             onChange  — (bookName) => void
//             disabled  — greys it out while a load is in flight
// ======================================================

import { useBooks } from '../../hooks/useBooks';

export function BookSelect({ value, onChange, disabled = false }) {
    const { names } = useBooks();
    // If the current value isn't in the list (list still loading), keep it
    // visible instead of silently jumping to the first option.
    const options = names.includes(value) ? names : [value, ...names];
    return (<label className="book-select">
      <span className="book-select-label">Book</span>
      <select className="fy-select" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} aria-label="Book">
        {options.map((n) => (<option key={n} value={n}>{n}</option>))}
      </select>
    </label>);
}

// ======================================================
// END OF FILE : BookSelect.jsx
// ======================================================
