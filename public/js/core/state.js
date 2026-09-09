/**
 * Vanilla JS Central State Management
 */
class StateManager {
    constructor() {
        this.state = {
            token: sessionStorage.getItem('admin_token') || null,
            user: null,
            nodes: [],
            isSocketConnected: false
        };
        this.listeners = new Map();
    }

    get(key) {
        return this.state[key];
    }

    set(key, value) {
        this.state[key] = value;
        if (key === 'token') {
            if (value) sessionStorage.setItem('admin_token', value);
            else sessionStorage.removeItem('admin_token');
        }
        this.emit(key, value);
    }

    subscribe(key, callback) {
        if (!this.listeners.has(key)) {
            this.listeners.set(key, []);
        }
        this.listeners.get(key).push(callback);
    }

    emit(key, value) {
        if (this.listeners.has(key)) {
            this.listeners.get(key).forEach(callback => callback(value));
        }
    }
}

export const state = new StateManager();