import { state } from './state.js';

const API_BASE = '/api';

async function fetchWithAuth(endpoint, options = {}) {
    const token = state.get('token');

    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers
    });

    const data = await response.json();

    if (response.status === 401) {
        // Token expired or invalid, force logout
        state.set('token', null);
        // ✨ FIXED: Redirect to main index (where the auth modal is) instead of reloading node.html
        window.location.href = '/index.html';
        return; // Prevent any further execution
    }

    if (!response.ok) {
        throw new Error(data.message || 'API Request Failed');
    }

    return data;
}

export const api = {
    // 1. MODIFIED FOR DB COMPATIBILITY: Expects 'email' instead of 'username'
    login: async (email, password) => {
        return await fetchWithAuth('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
    },

    // 2. NEW FEATURE: Backend Registration Route integration
    register: async (registrationPayload) => {
        return await fetchWithAuth('/auth/register', {
            method: 'POST',
            body: JSON.stringify(registrationPayload)
        });
    },

    verifySession: async () => {
        return await fetchWithAuth('/auth/verify', { method: 'GET' });
    },

    getNodes: async () => {
        return await fetchWithAuth('/nodes', { method: 'GET' });
    },

    // 3. PRESERVED FEATURE: Required for loading individual node management screens
    getNodeById: async (nodeId) => {
        return await fetchWithAuth(`/nodes/${nodeId}`, { method: 'GET' });
    },

    toggleNodeApproval: async (nodeId, approved, password = "") => {
        return await fetchWithAuth(`/nodes/${nodeId}/approval`, {
            method: 'POST',
            body: JSON.stringify({ approved, password })
        });
    },

    deleteNode: async (nodeId) => {
        return await fetchWithAuth(`/nodes/${nodeId}`, { method: 'DELETE' });
    }
};