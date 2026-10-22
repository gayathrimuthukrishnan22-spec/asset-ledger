// ======================================================
// File Name : Users.jsx
// Purpose   : Page-level component for Users
// ======================================================

import { useEffect, useState } from 'react';
import { usersApi } from '../../api/users.api';
import { AppLayout } from '../../layout/AppLayout';
import { Pill } from '../../components/ui/ui';
import { Button } from '../../components/ui/Button';
import { Table } from '../../components/ui/Table';
import { Input, Select } from '../../components/ui/Input';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { generateStrongPassword, passwordStrengthIssues } from '../../utils/password';
import { Modal } from '../../components/ui/Modal';
import { useAuth } from '../../context/AuthContext';
import { MENU_ITEMS } from '../../layout/nav';

// ======================================================
// START: Page Component
// ======================================================

const ROLE_TONE = {
    Administrator: 'purple',
    'Tax Analyst': 'blue',
    Reviewer: 'teal',
    'Read-Only': 'gray'
};
const AVATAR_GRADIENTS = [
    'linear-gradient(135deg,#7c3aed,#2563eb)',
    'linear-gradient(135deg,#0d9488,#2563eb)',
    'linear-gradient(135deg,#d97706,#dc2626)',
    'linear-gradient(135deg,#64748b,#94a3b8)'
];
// ======================================================
// Function : initials
// Purpose  : Implements logic for 'initials'
// ======================================================

function initials(name) {
    return name
        .split(' ')
        .map((p) => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
}

// ======================================================
// END: initials
// ======================================================
const CAPABILITIES = [
    { key: 'viewAssets', label: 'View Assets' },
    { key: 'postEvents', label: 'Post Events' },
    { key: 'approvePost', label: 'Approve/Post' },
    { key: 'runReports', label: 'Run Reports' },
    { key: 'manageUsers', label: 'Manage Users' },
    { key: 'editConfig', label: 'Edit Config' }
];
// ======================================================
// Function : Users
// Purpose  : Custom hook that provides 'Users' state/behaviour
// ======================================================

export function Users() {
    const { user: authUser, hasEdit } = useAuth();
    const canManage = hasEdit('users');
    const [roles, setRoles] = useState([]);
    const [users, setUsers] = useState([]);
    const [inviteOpen, setInviteOpen] = useState(false);
    const [inviteForm, setInviteForm] = useState({ name: '', email: '', role: 'Read-Only', password: '' });
    const [inviting, setInviting] = useState(false);
    const [inviteError, setInviteError] = useState('');

    const [editUser, setEditUser] = useState(null);
    const [editForm, setEditForm] = useState({ name: '', email: '', role: '', status: 'Active', password: '', menuAccess: {} });
    const [editing, setEditing] = useState(false);
    const [editError, setEditError] = useState('');

    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState('');

    const [savingCap, setSavingCap] = useState(null); // `${roleName}:${capKey}` while a toggle is in flight

    function loadAll() {
        usersApi.getRoles().then(setRoles);
        usersApi.getUsers().then(async (list) => {
            // The person looking at this page is clearly using the app right
            // now, so if their own row is still sitting on "Invited" (e.g.
            // they never went through /login, just landed here directly),
            // that status is stale — correct it instead of leaving it wrong
            // forever. Anyone else's "Invited" row is untouched; it just
            // means they haven't signed in yet, which is accurate.
            const self = authUser?.email && list.find((u) => u.email.toLowerCase() === authUser.email.toLowerCase());
            if (self && self.status === 'Invited') {
                try {
                    await usersApi.updateUser(self.id, { name: self.name, email: self.email, role: self.role, status: 'Active' });
                    list = list.map((u) => (u.id === self.id ? { ...u, status: 'Active', lastActive: 'Just now' } : u));
                } catch {
                    // Non-critical — worst case the row still shows Invited until the next load.
                }
            }
            setUsers(list);
        });
    }
    useEffect(() => { loadAll(); }, [authUser?.email]);

    async function togglePermission(roleName, capKey, nextValue) {
        setSavingCap(`${roleName}:${capKey}`);
        // Optimistic update so the checkbox responds immediately.
        setRoles((prev) => prev.map((r) => (r.name === roleName
            ? { ...r, permissions: { ...r.permissions, [capKey]: nextValue } }
            : r)));
        try {
            await usersApi.updateRolePermission(roleName, capKey, nextValue);
        } catch {
            // Revert on failure.
            setRoles((prev) => prev.map((r) => (r.name === roleName
                ? { ...r, permissions: { ...r.permissions, [capKey]: !nextValue } }
                : r)));
        } finally {
            setSavingCap(null);
        }
    }

    function openInvite() {
        // Password comes pre-filled with an auto-generated strong one so the
        // admin doesn't have to think one up — they can still overwrite it,
        // or hit Generate again for a different one.
        setInviteForm({ name: '', email: '', role: roles[0]?.name || 'Read-Only', password: generateStrongPassword() });
        setInviteError('');
        setInviteOpen(true);
    }

    async function submitInvite() {
        if (!inviteForm.name.trim() || !inviteForm.email.trim() || !inviteForm.password.trim()) {
            setInviteError('Name, email and password are required.');
            return;
        }
        const issues = passwordStrengthIssues(inviteForm.password);
        if (issues.length) {
            setInviteError(`Password needs ${issues.join(', ')}.`);
            return;
        }
        setInviting(true);
        setInviteError('');
        try {
            await usersApi.createUser({
                name: inviteForm.name.trim(),
                email: inviteForm.email.trim(),
                role: inviteForm.role,
                status: 'Invited',
                password: inviteForm.password
            });
            setInviteOpen(false);
            loadAll();
        } catch (err) {
            setInviteError(err.message || 'Could not create user.');
        } finally {
            setInviting(false);
        }
    }

    // A menu the user has no explicit Page Access override for should
    // still show the checkboxes reflecting what they actually get today
    // (their Role's default), so the admin sees real effective access
    // before choosing to override any of it.
    function effectiveAccess(user, menuItem) {
        const override = user?.menuAccess?.[menuItem.id];
        if (override) return override;
        const roleGrant = !!roles.find((r) => r.name === user?.role)?.permissions?.[menuItem.capability];
        return { view: roleGrant, edit: roleGrant };
    }

    // User Management is Administrator-only, always — it's never offered
    // as a per-user override for any other role, no matter what an old
    // override on the record says.
    function isAdminOnlyMenu(menuId) {
        return menuId === 'users';
    }

    // Bulk Import has no real "view-only" mode — there's nothing to look
    // at that isn't also an action. So ticking its View box grants Edit
    // in the same click, and the Edit box just mirrors View instead of
    // being toggled on its own.
    function isViewImpliesEdit(menuId) {
        return menuId === 'bulk-import';
    }

    // Rows actually offered in the Page Access table for the role
    // currently selected in the form — User Management is left out
    // entirely unless that role is Administrator.
    function visibleMenuItems(role) {
        return MENU_ITEMS.filter((item) => !isAdminOnlyMenu(item.id) || role === 'Administrator');
    }

    function openEdit(user) {
        setEditUser(user);
        const menuAccess = {};
        for (const item of MENU_ITEMS) {
            menuAccess[item.id] = isAdminOnlyMenu(item.id) && user.role !== 'Administrator'
                ? { view: false, edit: false }
                : effectiveAccess(user, item);
        }
        setEditForm({ name: user.name, email: user.email, role: user.role, status: user.status, password: '', menuAccess });
        setEditError('');
    }

    function toggleMenuAccess(menuId, kind, checked) {
        setEditForm((prev) => ({
            ...prev,
            menuAccess: {
                ...prev.menuAccess,
                [menuId]: {
                    ...prev.menuAccess[menuId],
                    [kind]: checked,
                    ...(kind === 'view' && !checked ? { edit: false } : {}),
                    ...(kind === 'view' && checked && isViewImpliesEdit(menuId) ? { edit: true } : {})
                }
            }
        }));
    }

    // "Select all" header checkboxes — setting every menu's View or Edit
    // in one click instead of ticking each row by hand, which is exactly
    // where a manual pass tends to miss a row or two. Unticking "all
    // View" also clears every row's Edit, same rule as a single row's
    // own View checkbox, and Bulk Import's Edit still mirrors its View.
    // User Management is skipped entirely unless the form's role is
    // Administrator — "select all" can never be the back door that grants it.
    function setAllMenuAccess(kind, checked) {
        setEditForm((prev) => {
            const menuAccess = { ...prev.menuAccess };
            for (const item of visibleMenuItems(prev.role)) {
                const existing = prev.menuAccess[item.id] || { view: false, edit: false };
                menuAccess[item.id] = {
                    ...existing,
                    [kind]: checked,
                    ...(kind === 'view' && !checked ? { edit: false } : {}),
                    ...(kind === 'view' && checked && isViewImpliesEdit(item.id) ? { edit: true } : {})
                };
            }
            return { ...prev, menuAccess };
        });
    }

    async function submitEdit() {
        if (!editForm.name.trim() || !editForm.email.trim()) {
            setEditError('Name and email are required.');
            return;
        }
        if (editForm.password.trim()) {
            const issues = passwordStrengthIssues(editForm.password.trim());
            if (issues.length) {
                setEditError(`Password needs ${issues.join(', ')}.`);
                return;
            }
        }
        setEditing(true);
        setEditError('');
        // Belt-and-suspenders: whatever the table did or didn't show, never
        // let a save actually persist User Management access for a non-
        // Administrator — this is the last checkpoint before it hits the server.
        const menuAccess = editForm.role === 'Administrator'
            ? editForm.menuAccess
            : { ...editForm.menuAccess, users: { view: false, edit: false } };
        try {
            await usersApi.updateUser(editUser.id, {
                name: editForm.name.trim(),
                email: editForm.email.trim(),
                role: editForm.role,
                status: editForm.status,
                password: editForm.password.trim() || undefined,
                menuAccess
            });
            setEditUser(null);
            loadAll();
        } catch (err) {
            setEditError(err.message || 'Could not update user.');
        } finally {
            setEditing(false);
        }
    }

    async function submitDelete() {
        setDeleting(true);
        setDeleteError('');
        try {
            await usersApi.deleteUser(deleteTarget.id);
            setDeleteTarget(null);
            loadAll();
        } catch (err) {
            setDeleteError(err.message || 'Could not delete user.');
        } finally {
            setDeleting(false);
        }
    }
    const admins = roles.find((r) => r.name === 'Administrator')?.userCount ?? 0;
    const pendingInvites = users.filter((u) => u.status === 'Invited').length;
    const pendingApprovals = users.filter((u) => u.status === 'Pending').length;
    const userColumns = [
        {
            header: 'User',
            render: (u) => (<div className="flex items-center gap-2">
          <span className="uavatar" style={{ background: AVATAR_GRADIENTS[users.indexOf(u) % AVATAR_GRADIENTS.length] }}>
            {initials(u.name)}
          </span>
          {u.name}
        </div>)
        },
        { header: 'Email', render: (u) => <span className="text-muted">{u.email}</span> },
        { header: 'Role', render: (u) => <Pill tone={ROLE_TONE[u.role] ?? 'gray'}>{u.role}</Pill> },
        { header: 'Last Active', render: (u) => u.lastActive },
        { header: 'Status', render: (u) => <Pill tone={u.status === 'Active' ? 'green' : u.status === 'Pending' ? 'red' : u.status === 'Inactive' ? 'gray' : 'amber'}>{u.status}</Pill> },
        {
            header: '',
            render: (u) => (<div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="row-icon-btn" title={canManage ? (u.status === 'Pending' ? 'Review & approve' : u.status === 'Invited' ? 'Resend / Edit' : 'Edit') : 'View only'} disabled={!canManage} onClick={() => openEdit(u)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/>
            </svg>
          </button>
          <button type="button" className="row-icon-btn danger" title="Delete" disabled={!canManage} onClick={() => { setDeleteTarget(u); setDeleteError(''); }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18"/>
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6"/>
              <path d="M14 11v6"/>
            </svg>
          </button>
        </div>)
        }
    ];
    return (<AppLayout active="users" title="User Management" crumb="Home / Administration / User Management">
      <div className="page-header">
        <div>
          <h1>User Management</h1>
          <p>Manage users, roles, and permissions across the fixed-asset platform</p>
        </div>
        <Button variant="primary" onClick={openInvite} disabled={!canManage} title={!canManage ? 'You have view-only access to User Management' : undefined}>+ Invite User</Button>
      </div>

      <div className="grid grid-4 mb-4">
        <div className="card card-pad stat">
          <span className="label">Total Users</span>
          <div className="value" style={{ fontSize: 22 }}>
            {users.length}
          </div>
        </div>
        <div className="card card-pad stat">
          <span className="label">Administrators</span>
          <div className="value" style={{ fontSize: 22 }}>
            {admins}
          </div>
        </div>
        <div className="card card-pad stat">
          <span className="label">Pending Invites</span>
          <div className="value" style={{ fontSize: 22 }}>
            {pendingInvites}
          </div>
        </div>
        <div className="card card-pad stat">
          <span className="label">Pending Approval</span>
          <div className="value" style={{ fontSize: 22, color: pendingApprovals > 0 ? 'var(--danger, #dc2626)' : undefined }}>
            {pendingApprovals}
          </div>
        </div>
      </div>

      <div className="grid grid-2 mb-4">
        <div className="card">
          <div className="card-head">
            <h3>Roles &amp; Permissions</h3>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Users</th>
                  <th>Access</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((r) => (<tr key={r.name}>
                    <td>
                      <Pill tone={ROLE_TONE[r.name] ?? 'gray'}>{r.name}</Pill>
                    </td>
                    <td>{r.userCount}</td>
                    <td className="text-sm text-muted">{r.access}</td>
                  </tr>))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Permission Matrix</h3>
            <span className="text-sm text-muted">Tick to grant — changes apply to that role immediately</span>
          </div>
          <div className="table-wrap">
            <table className="table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>Capability</th>
                  <th>Admin</th>
                  <th>Analyst</th>
                  <th>Reviewer</th>
                  <th>R/O</th>
                </tr>
              </thead>
              <tbody>
                {CAPABILITIES.map((cap) => (<tr key={cap.key}>
                    <td>{cap.label}</td>
                    {['Administrator', 'Tax Analyst', 'Reviewer', 'Read-Only'].map((roleName) => {
                  const role = roles.find((r) => r.name === roleName);
                  // Manage Users can only ever be granted to Administrator —
                  // every other role's checkbox is locked off, permanently.
                  const lockedOut = cap.key === 'manageUsers' && roleName !== 'Administrator';
                  const checked = lockedOut ? false : !!role?.permissions?.[cap.key];
                  const cellKey = `${roleName}:${cap.key}`;
                  return (<td key={roleName} style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!role || !canManage || savingCap === cellKey || lockedOut}
                          onChange={(e) => togglePermission(roleName, cap.key, e.target.checked)}
                          style={{ width: 15, height: 15, cursor: (role && !lockedOut) ? 'pointer' : 'default' }}
                          title={lockedOut ? 'User Management is Administrator-only and can\'t be granted to this role' : `${checked ? 'Revoke' : 'Grant'} "${cap.label}" for ${roleName}`}
                        />
                      </td>);
              })}
                  </tr>))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Users</h3>
          <span className="text-sm text-muted">{users.length} users</span>
        </div>
        <Table columns={userColumns} rows={users} rowKey={(u) => u.id}/>
      </div>

      <Modal open={inviteOpen} title="Invite User" onClose={() => setInviteOpen(false)} footer={<div className="flex gap-2">
            <Button variant="primary" onClick={submitInvite} disabled={inviting}>
              {inviting ? 'Inviting…' : 'Send Invite'}
            </Button>
            <Button variant="ghost" onClick={() => setInviteOpen(false)} disabled={inviting}>
              Cancel
            </Button>
          </div>}>
        <Input
          label="Name"
          value={inviteForm.name}
          placeholder="e.g. Priya N."
          onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
        />
        <Input
          label="Email"
          type="email"
          value={inviteForm.email}
          placeholder="e.g. priya.n@company.com"
          onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
        />
        <Select
          label="Role"
          value={inviteForm.role}
          onChange={(v) => setInviteForm({ ...inviteForm, role: v })}
          options={roles.map((r) => r.name)}
        />
        <PasswordInput
          label="Password"
          value={inviteForm.password}
          placeholder="Set an initial password"
          onChange={(e) => setInviteForm({ ...inviteForm, password: e.target.value })}
          showGenerate
          showStrength
          hint="Pre-filled with an auto-generated strong password — edit it or hit Generate for a new one."
        />
        {inviteError && (<p className="text-sm mt-2" style={{ color: 'var(--danger, #dc2626)', fontWeight: 700 }}>{inviteError}</p>)}
      </Modal>

      <Modal open={!!editUser} title={`Edit User — ${editUser?.name ?? ''}`} onClose={() => setEditUser(null)} footer={<div className="flex gap-2">
            <Button variant="primary" onClick={submitEdit} disabled={editing}>
              {editing ? 'Saving…' : 'Save Changes'}
            </Button>
            <Button variant="ghost" onClick={() => setEditUser(null)} disabled={editing}>
              Cancel
            </Button>
          </div>}>
        <Input
          label="Name"
          value={editForm.name}
          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
        />
        <Input
          label="Email"
          type="email"
          value={editForm.email}
          onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
        />
        <Select
          label="Role"
          value={editForm.role}
          onChange={(v) => setEditForm({ ...editForm, role: v })}
          options={roles.map((r) => r.name)}
        />
        <Select
          label="Status"
          value={editForm.status}
          onChange={(v) => setEditForm({ ...editForm, status: v })}
          options={['Active', 'Inactive', 'Invited', 'Pending']}
        />
        {editForm.status === 'Pending' && (<p className="text-sm mt-2" style={{ color: 'var(--danger, #dc2626)', fontWeight: 600 }}>
            This is a self-registration request. Pick a Role and Page Access below, then set Status to
            <strong> Active</strong> and Save to approve — they'll be able to sign in right after.
          </p>)}
        <PasswordInput
          label="Password"
          value={editForm.password}
          placeholder="Leave blank to keep current password"
          onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
          showGenerate
          showStrength
        />
        {/* Page Access — per-menu View/Edit for THIS user specifically.
            Starts from their Role's default (Permission Matrix above);
            ticking/unticking here overrides that default just for them,
            without changing the Role or anyone else on it.
              - Unticking View also removes Edit, since a menu they can't
                see can't be worked on either. Ticking View grants
                view-only by itself; Edit needs its own separate tick.
              - User Management never appears here unless this user's Role
                (above) is Administrator — it's not something any other
                role can be given, even as a one-off override.
              - Bulk Import has no view-only mode: ticking its View also
                grants Edit in the same click, and its Edit box just
                mirrors View rather than being toggled separately. */}
        <div className="mt-2" style={{ marginTop: 12 }}>
          <div className="text-sm" style={{ fontWeight: 700, marginBottom: 4 }}>Page Access</div>
          <div className="text-sm text-muted" style={{ marginBottom: 6 }}>
            Starts from the <strong>{editForm.role}</strong> role's defaults — tick View to show a menu to this
            user (view-only), tick Edit as well to let them post/save on it. Use the header checkboxes to set
            every menu at once instead of ticking each row by hand.
          </div>
          <div className="table-wrap">
            <table className="table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>Menu</th>
                  <th style={{ textAlign: 'center' }}>View</th>
                  <th style={{ textAlign: 'center' }}>Edit</th>
                </tr>
                <tr style={{ background: 'var(--bg, #f8fafc)' }}>
                  <td style={{ fontWeight: 600, color: 'var(--text-muted, #64748b)' }}>Select all</td>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={visibleMenuItems(editForm.role).every((item) => editForm.menuAccess[item.id]?.view)}
                      onChange={(e) => setAllMenuAccess('view', e.target.checked)}
                      style={{ width: 15, height: 15, cursor: 'pointer' }}
                      title={`${visibleMenuItems(editForm.role).every((item) => editForm.menuAccess[item.id]?.view) ? 'Hide' : 'Show'} every menu for ${editForm.name || 'this user'}`}
                    />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={visibleMenuItems(editForm.role).every((item) => editForm.menuAccess[item.id]?.edit)}
                      onChange={(e) => setAllMenuAccess('edit', e.target.checked)}
                      style={{ width: 15, height: 15, cursor: 'pointer' }}
                      title={`${visibleMenuItems(editForm.role).every((item) => editForm.menuAccess[item.id]?.edit) ? 'Revoke' : 'Grant'} edit on every menu for ${editForm.name || 'this user'}`}
                    />
                  </td>
                </tr>
              </thead>
              <tbody>
                {visibleMenuItems(editForm.role).map((item) => {
                    const access = editForm.menuAccess[item.id] || { view: false, edit: false };
                    const editMirrorsView = isViewImpliesEdit(item.id);
                    return (<tr key={item.id}>
                      <td>{item.label}</td>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={!!access.view}
                          onChange={(e) => toggleMenuAccess(item.id, 'view', e.target.checked)}
                          style={{ width: 15, height: 15, cursor: 'pointer' }}
                          title={`${access.view ? 'Hide' : 'Show'} "${item.label}" for ${editForm.name || 'this user'}`}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={!!access.edit}
                          disabled={!access.view || editMirrorsView}
                          onChange={(e) => toggleMenuAccess(item.id, 'edit', e.target.checked)}
                          style={{ width: 15, height: 15, cursor: (access.view && !editMirrorsView) ? 'pointer' : 'default' }}
                          title={editMirrorsView ? `"${item.label}" has no view-only mode — Edit always matches View` : `${access.edit ? 'Revoke' : 'Grant'} edit on "${item.label}" for ${editForm.name || 'this user'}`}
                        />
                      </td>
                    </tr>);
                })}
              </tbody>
            </table>
          </div>
        </div>
        {editError && (<p className="text-sm mt-2" style={{ color: 'var(--danger, #dc2626)', fontWeight: 700 }}>{editError}</p>)}
      </Modal>

      <Modal open={!!deleteTarget} title="Delete User" onClose={() => setDeleteTarget(null)} footer={<div className="flex gap-2">
            <Button variant="primary" onClick={submitDelete} disabled={deleting} style={{ background: 'var(--danger, #dc2626)', borderColor: 'var(--danger, #dc2626)' }}>
              {deleting ? 'Deleting…' : 'Delete User'}
            </Button>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
          </div>}>
        <p className="text-sm">
          Remove <strong>{deleteTarget?.name}</strong> ({deleteTarget?.email})? This can't be undone — they'll
          lose access immediately and their seat on the <strong>{deleteTarget?.role}</strong> role will free up.
        </p>
        {deleteError && (<p className="text-sm mt-2" style={{ color: 'var(--danger, #dc2626)', fontWeight: 700 }}>{deleteError}</p>)}
      </Modal>
    </AppLayout>);
}

// ======================================================
// END: Users
// ======================================================

// ======================================================
// END: Page Component
// ======================================================

// ======================================================
// END OF FILE : Users.jsx
// ======================================================
