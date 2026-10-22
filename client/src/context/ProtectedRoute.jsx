// ======================================================
// File Name : ProtectedRoute.jsx
// Purpose   : Implements ProtectedRoute
// ======================================================

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

// ======================================================
// START: Context
// ======================================================

/** Redirects to /login (remembering where you were headed) when not signed in. */
// ======================================================
// Function : ProtectedRoute
// Purpose  : React component that renders the 'ProtectedRoute' UI
// ======================================================

export function ProtectedRoute({ children }) {
    const { isAuthenticated } = useAuth();
    const location = useLocation();

    if (!isAuthenticated) {
        return <Navigate to="/login" replace state={{ from: location }}/>;
    }
    return children;
}

// ======================================================
// END: ProtectedRoute
// ======================================================

// ======================================================
// END: Context
// ======================================================

// ======================================================
// END OF FILE : ProtectedRoute.jsx
// ======================================================
