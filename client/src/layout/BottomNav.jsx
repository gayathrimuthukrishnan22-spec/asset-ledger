// ======================================================
// File Name : BottomNav.jsx
// Purpose   : Implements BottomNav
// ======================================================

import { NavLink } from 'react-router-dom';

// ======================================================
// START: Layout Component
// ======================================================

// Curated subset of NAV — a bottom bar can only fit a handful of
// items before it gets cramped, so this picks the most-used
// destinations. Everything else (Forecasting, Reporting,
// Configuration, Users, ...) is one tap away via "More".
const BOTTOM_NAV_ITEMS = [
    { id: 'dashboard', icon: '▤', label: 'Home', href: '/' },
    { id: 'assets', icon: '▦', label: 'Assets', href: '/assets' },
    { id: 'lifecycle', icon: '⟳', label: 'Lifecycle', href: '/lifecycle' },
    { id: 'modeling', icon: '◈', label: 'Modeling', href: '/modeling' }
];

/** Fixed bottom tab bar shown only on mobile/tablet (<1001px). "More" opens the same off-canvas Sidebar used elsewhere. */
// ======================================================
// Function : BottomNav
// Purpose  : React component that renders the 'BottomNav' UI
// ======================================================

export function BottomNav({ active, moreOpen, onMoreClick }) {
    return (<nav className="bottom-nav" aria-label="Primary">
      {BOTTOM_NAV_ITEMS.map((it) => (<NavLink key={it.id} to={it.href} end className={`bottom-nav-item ${it.id === active ? 'active' : ''}`}>
          <span className="ico">{it.icon}</span>
          <span className="txt">{it.label}</span>
        </NavLink>))}
      <button type="button" className={`bottom-nav-item bottom-nav-more ${moreOpen ? 'active' : ''}`} aria-expanded={moreOpen} aria-label="More" onClick={onMoreClick}>
        <span className="ico">☰</span>
        <span className="txt">More</span>
      </button>
    </nav>);
}

// ======================================================
// END: BottomNav
// ======================================================

// ======================================================
// END: Layout Component
// ======================================================

// ======================================================
// END OF FILE : BottomNav.jsx
// ======================================================
