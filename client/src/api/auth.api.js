// ======================================================
// File Name : auth.api.js
// Purpose   : API client functions for auth.api
// ======================================================

import { api } from './client';

// ======================================================
// START: API Client Functions
// ======================================================

export const authApi = {
    login: (email, password) => api.post('/auth/login', { email, password }),
    logout: (id) => api.post('/auth/logout', { id }),
    register: (name, email, password) => api.post('/auth/register', { name, email, password }),
    getLoginNotifications: () => api.get('/auth/notifications'),
    deleteNotification: (seq) => api.del(`/auth/notifications/${seq}`)
};

// ======================================================
// END: API Client Functions
// ======================================================

// ======================================================
// END OF FILE : auth.api.js
// ======================================================
