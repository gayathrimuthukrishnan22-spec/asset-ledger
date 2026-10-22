// ======================================================
// File Name : nav.js
// Purpose   : Implements nav
// ======================================================


// ======================================================
// START: Layout Component
// ======================================================

// Each item's `capability` names the Permission Matrix key (see
// pages/Administration/Users.jsx: CAPABILITIES) that a signed-in user's
// role needs in order to see that item in the Sidebar. An item with no
// `capability` (e.g. Dashboard) is always shown to anyone signed in.
export const NAV = [
    { group: 'Overview', items: [{ id: 'dashboard', icon: '▤', label: 'Dashboard', href: '/' }] },
    {
        group: 'Asset Management',
        items: [
            { id: 'assets', icon: '▦', label: 'Asset Register', href: '/assets', capability: 'viewAssets' },
            { id: 'detail', icon: '▣', label: 'Asset Detail', href: '/assets/845862189', capability: 'viewAssets' },
            { id: 'lifecycle', icon: '⟳', label: 'Lifecycle Events', href: '/lifecycle', capability: 'postEvents' },
            { id: 'bulk-import', icon: '⇪', label: 'Bulk Import', href: '/lifecycle/bulk-import', capability: 'postEvents' }
        ]
    },
    {
        group: 'Planning',
        items: [
            { id: 'modeling', icon: '◈', label: 'Modeling', href: '/modeling', capability: 'runReports' },
            { id: 'forecasting', icon: '📈', label: 'Forecasting', href: '/forecasting', capability: 'runReports' }
        ]
    },
    { group: 'Compliance', items: [{ id: 'reporting', icon: '▧', label: 'Reporting', href: '/reporting', capability: 'runReports' }] },
    {
        group: 'Configuration',
        items: [
            { id: 'pub946', icon: '📋', label: 'Pub 946 Tables', href: '/configuration/pub946', capability: 'editConfig' },
            { id: 'bonus', icon: '％', label: 'Bonus Depreciation', href: '/configuration/bonus-depreciation', capability: 'editConfig' },
            { id: 'assetClasses', icon: '🏷️', label: 'Asset Classes', href: '/configuration/asset-classes', capability: 'editConfig' },
            { id: 'books', icon: '📚', label: 'Books List', href: '/configuration/books', capability: 'editConfig' }
        ]
    },
    {
        group: 'Integrations',
        items: [{ id: 'sap', icon: '⇄', label: 'SAP', href: '/integrations/sap', capability: 'postEvents' }]
    },
    { group: 'Administration', items: [{ id: 'users', icon: '◍', label: 'User Management', href: '/users', capability: 'manageUsers' }] }
];

// Flattened list of every nav item that can be individually granted in
// the Edit User modal's Page Access matrix (see pages/Administration/
// Users.jsx). Dashboard is left out on purpose — it has no `capability`
// and is always shown to any signed-in user.
export const MENU_ITEMS = NAV.flatMap((g) => g.items).filter((it) => it.capability);

// ======================================================
// END: Layout Component
// ======================================================

// ======================================================
// END OF FILE : nav.js
// ======================================================
