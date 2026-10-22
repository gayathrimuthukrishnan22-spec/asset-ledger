// ======================================================
// File Name : RequireView.jsx
// Purpose   : Implements RequireView
// ======================================================

import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

// ======================================================
// START: Context
// ======================================================

/** Wrap a <Route element> with this and pass the nav.js menu `id` it
 *  corresponds to. If the signed-in user's Page Access (per-user
 *  override, else their Role's Permission Matrix default) has View off
 *  for that menu, they're bounced to the Dashboard instead of landing on
 *  a page the Sidebar wouldn't have shown them a link to anyway. This is
 *  what makes hiding a menu in Edit User actually keep the page out of
 *  reach, not just out of the Sidebar.
 *
 *  Pass require="edit" for a route that only makes sense when the user
 *  can post/save (e.g. the "new asset" form) — someone with View-only on
 *  that menu is bounced the same way. */
// ======================================================
// Function : RequireView
// Purpose  : React component that renders the 'RequireView' UI
// ======================================================

export function RequireView({ menuId, require = 'view', children }) {
    const { hasView, hasEdit } = useAuth();
    const allowed = require === 'edit' ? hasEdit(menuId) : hasView(menuId);
    if (!allowed) {
        return <Navigate to="/" replace/>;
    }
    return children;
}

// ======================================================
// END: RequireView
// ======================================================

// ======================================================
// END: Context
// ======================================================

// ======================================================
// END OF FILE : RequireView.jsx
// ======================================================
