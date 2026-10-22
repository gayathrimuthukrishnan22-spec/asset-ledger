// ======================================================
// File Name : client.js
// Purpose   : API client functions for client
// ======================================================


// ======================================================
// START: API Client Functions
// ======================================================

const BASE = import.meta.env.VITE_API_URL || '/api';
export const API_BASE = BASE;
// ======================================================
// Function : request
// Purpose  : Implements logic for 'request'
// ======================================================

async function request(path, init) {
    const res = await fetch(`${BASE}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...init
    });
    if (!res.ok) {
        const body = await res.text();
        // The server answers errors as { "error": "message" } — show just the
        // message (e.g. "Asset 123 already has an Addition posted…") instead
        // of "409 Conflict: {"error":"…"}".
        let message = body;
        try {
            const parsed = JSON.parse(body);
            if (parsed && typeof parsed.error === 'string')
                message = parsed.error;
        }
        catch { /* not JSON — keep the raw text */ }
        throw new Error(message || `${res.status} ${res.statusText}`);
    }
    return res.json();
}

// ======================================================
// END: request
// ======================================================
export const api = {
    get: (path) => request(path),
    post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
    put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
    del: (path) => request(path, { method: 'DELETE' })
};

// ======================================================
// END: API Client Functions
// ======================================================

// ======================================================
// END OF FILE : client.js
// ======================================================
