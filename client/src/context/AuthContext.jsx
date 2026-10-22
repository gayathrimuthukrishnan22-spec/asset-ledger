// ======================================================
// File Name : AuthContext.jsx
// Purpose   : Implements AuthContext
// ======================================================

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usersApi } from '../api/users.api';
import { authApi } from '../api/auth.api';
import { MENU_ITEMS } from '../layout/nav';

// ======================================================
// START: Context
// ======================================================

// login() now calls the real POST /api/auth/login (see server/src/routes/
// auth.ts) — email + password are checked against the stored user row,
// so a wrong password is actually rejected instead of the old "any
// password works" mock. The session itself is still kept in
// sessionStorage only (no server session/token yet), so it survives a
// refresh but clears when the tab closes.
//
// There's no signed-in-by-default guest anymore: with nothing in
// sessionStorage, `user` is null and <ProtectedRoute> (wired into every
// route in App.jsx except /login) sends you straight to the login page
// instead of quietly showing the app as some default user.
const STORAGE_KEY = 'al_auth_user';

// ======================================================
// Function : readStoredUser
// Purpose  : Reads the signed-in user from sessionStorage; returns null when nothing is stored or it cannot be parsed.
// ======================================================
function readStoredUser() {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    }
    catch {
        return null;
    }
}

// ======================================================
// Function : initialsFor
// Purpose  : Builds up to two upper-case initials from a full name (used for the avatar).
// ======================================================
function initialsFor(name) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

const AuthContext = createContext(null);

/** Wraps the app; holds the signed-in user and exposes login/logout to everything below it. */
// ======================================================
// Function : AuthProvider
// Purpose  : React component that renders the 'AuthProvider' UI
// ======================================================

export function AuthProvider({ children }) {
    const [user, setUser] = useState(readStoredUser);

    // Permission Matrix (role -> { capabilityKey: boolean }), used as the
    // fallback for any menu a signed-in user has no Page Access override
    // for. Loaded once; Users.jsx keeps its own copy for editing the
    // matrix itself, this one just backs hasView/hasEdit below.
    const [rolePermissions, setRolePermissions] = useState({});
    useEffect(() => {
        let cancelled = false;
        usersApi.getRoles().then((roles) => {
            if (cancelled) return;
            const byName = {};
            for (const r of roles) byName[r.name] = r.permissions || {};
            setRolePermissions(byName);
        }).catch(() => { /* fall through to the empty map — see hasView/hasEdit below */ });
        return () => { cancelled = true; };
    }, []);

    // Keeps a signed-in user's Page Access / role in sync with whatever an
    // Administrator has since saved in User Management. Without this, a
    // tab that's been open since before the edit would keep using the
    // menuAccess snapshot from login until the person manually signs out
    // and back in — so an admin flipping someone to read-only wouldn't
    // actually take effect for them until their next login. Re-fetches
    // this user's row and merges in role/menuAccess/name/email if
    // anything changed; silently does nothing if it can't reach the
    // server, the row no longer exists, or nobody is signed in.
    const userRef = useRef(user);
    userRef.current = user;
    const refreshSession = useCallback(async () => {
        const current = userRef.current;
        if (!current?.id) return;
        try {
            const list = await usersApi.getUsers();
            const fresh = list.find((u) => u.id === current.id);
            // Re-check userRef in case of a logout/switch while this was in flight.
            if (!fresh || userRef.current?.id !== current.id) return;
            const merged = {
                ...userRef.current,
                name: fresh.name,
                email: fresh.email,
                role: fresh.role,
                initials: initialsFor(fresh.name),
                menuAccess: fresh.menuAccess || {}
            };
            setUser(merged);
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        } catch {
            // Best-effort — keep using whatever access we already have.
        }
    }, []);

    // Refresh once on load (covers a page refresh long after login), and
    // again whenever the tab regains focus — the common case where an
    // admin edits access in another tab/session while this one sits idle.
    // Also poll periodically in case the tab stays open and visible for a
    // long stretch without ever losing/regaining focus.
    useEffect(() => {
        refreshSession();
        function onVisible() {
            if (document.visibilityState === 'visible') refreshSession();
        }
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('focus', refreshSession);
        const interval = setInterval(refreshSession, 20000);
        return () => {
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('focus', refreshSession);
            clearInterval(interval);
        };
    }, [refreshSession]);

    const login = useCallback(async ({ email, password }) => {
        if (!email.trim() || !password) {
            return { ok: false, error: 'Enter both email and password.' };
        }
        let nextUser;
        try {
            const account = await authApi.login(email.trim(), password);
            nextUser = {
                id: account.id,
                name: account.name,
                email: account.email,
                role: account.role,
                initials: initialsFor(account.name),
                menuAccess: account.menuAccess || {}
            };
        } catch (err) {
            return { ok: false, error: err.message || 'Incorrect email or password.' };
        }
        setUser(nextUser);
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser));
        return { ok: true };
    }, []);

    const logout = useCallback(() => {
        // Fire-and-forget: flip the user's status to "Inactive" on the
        // server (mirrors login flipping it to "Active"). The local
        // session clears immediately regardless of whether this succeeds.
        if (user?.id) {
            authApi.logout(user.id).catch(() => { /* best-effort; user is signed out client-side either way */ });
        }
        setUser(null);
        sessionStorage.removeItem(STORAGE_KEY);
    }, [user]);

    // Can this signed-in user see/work on a given nav.js menu id? An
    // explicit Page Access checkbox for that menu (set in the Edit User
    // modal) always wins; with no override, fall back to whatever their
    // Role grants in the Permission Matrix — same behavior as before
    // per-user overrides existed.
    // User Management ('users') is Administrator-only, full stop — no
    // Page Access override and no Permission Matrix change for another
    // role can grant it. This matches Users.jsx's isAdminOnlyMenu, but
    // has to be re-enforced here too since this is what actually gates
    // the Sidebar item and the /users route for the signed-in user.
    const menuCheck = useCallback((menuId, kind) => {
        if (menuId === 'users') return user?.role === 'Administrator';
        const item = MENU_ITEMS.find((it) => it.id === menuId);
        if (!item?.capability) return true;
        const override = user?.menuAccess?.[menuId];
        if (override && typeof override[kind] === 'boolean') return override[kind];
        return !!rolePermissions[user?.role]?.[item.capability];
    }, [user, rolePermissions]);
    const hasView = useCallback((menuId) => menuCheck(menuId, 'view'), [menuCheck]);
    const hasEdit = useCallback((menuId) => menuCheck(menuId, 'edit'), [menuCheck]);

    const value = useMemo(() => ({ user, isAuthenticated: !!user, login, logout, hasView, hasEdit }), [user, login, logout, hasView, hasEdit]);
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ======================================================
// END: AuthProvider
// ======================================================

// ======================================================
// Function : useAuth
// Purpose  : Custom hook that provides 'useAuth' state/behaviour
// ======================================================

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx)
        throw new Error('useAuth must be used within an AuthProvider');
    return ctx;
}

// ======================================================
// END: useAuth
// ======================================================

// ======================================================
// END: Context
// ======================================================

// ======================================================
// END OF FILE : AuthContext.jsx
// ======================================================
