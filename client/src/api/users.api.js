// ======================================================
// File Name : users.api.js
// Purpose   : API client functions for users.api
// ======================================================

import { api } from './client';

// ======================================================
// START: API Client Functions
// ======================================================

export const usersApi = {
    getRoles: () => api.get('/users/roles'),
    getUsers: () => api.get('/users'),
    createUser: (input) => api.post('/users', input),
    updateUser: (id, input) => api.put(`/users/${id}`, input),
    deleteUser: (id) => api.del(`/users/${id}`),
    updateRolePermission: (roleName, capabilityKey, value) =>
        api.put(`/users/roles/${encodeURIComponent(roleName)}`, { capabilityKey, value })
};

// ======================================================
// END: API Client Functions
// ======================================================

// ======================================================
// END OF FILE : users.api.js
// ======================================================
