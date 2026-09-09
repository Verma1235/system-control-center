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
        // Token expired or invalid
        state.set('token', null);
        window.location.reload();
    }

    if (!response.ok) {
        throw new Error(data.message || 'API Request Failed');
    }

    return data;
}

export const api = {
    login: async (username, password) => {
        return await fetchWithAuth('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
    },

    verifySession: async () => {
        return await fetchWithAuth('/auth/verify', { method: 'GET' });
    },

    getNodes: async () => {
        return await fetchWithAuth('/nodes', { method: 'GET' });
    },

    // 🔴 NAYA FUNCTION YAHAN ADD KAREIN:
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