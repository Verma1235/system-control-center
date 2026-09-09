import { state } from './core/state.js';
import { api } from './core/api.js';
import { LogsUI } from './ui/logs.js';
import { DashboardUI } from './ui/dashboard.js';
import { SocketManager } from './socket/socketClient.js';

document.addEventListener("DOMContentLoaded", () => {

    // UI Elements
    const authModal = document.getElementById("authModal");
    const authForm = document.getElementById("authForm");
    const authError = document.getElementById("authError");
    const usernameInput = document.getElementById("adminUsernameInput");
    const passwordInput = document.getElementById("adminPasswordInput");
    const lockSessionBtn = document.getElementById("lockSessionBtn");

    // ==========================================
    // CUSTOM CONFIRM MODAL (Promise Based)
    // ==========================================
    window.customConfirm = function (message, title = "Confirm Action") {
        return new Promise((resolve) => {
            const modal = document.getElementById('confirmModal');
            const titleEl = document.getElementById('confirmTitle');
            const messageEl = document.getElementById('confirmMessage');
            const btnYes = document.getElementById('btnConfirmYes');
            const btnCancel = document.getElementById('btnConfirmCancel');

            titleEl.textContent = title;
            messageEl.textContent = message;
            modal.classList.remove('hidden');

            // We use onclick to automatically overwrite previous listeners 
            // so we don't get multiple resolutions if called multiple times.
            btnYes.onclick = () => {
                modal.classList.add('hidden');
                resolve(true);
            };

            btnCancel.onclick = () => {
                modal.classList.add('hidden');
                resolve(false);
            };
        });
    };

    // ==========================================
    // CUSTOM ALERT & PROMPT (Promise Based)
    // ==========================================
    window.customAlert = function (message, title = "Information") {
        return new Promise((resolve) => {
            const modal = document.getElementById('alertModal');
            const titleEl = document.getElementById('alertTitle');
            const messageEl = document.getElementById('alertMessage');
            const btnOk = document.getElementById('btnAlertOk');

            titleEl.textContent = title;
            messageEl.textContent = message;
            modal.classList.remove('hidden');

            btnOk.onclick = () => {
                modal.classList.add('hidden');
                resolve();
            };
        });
    };

    window.customPrompt = function (message, title = "Input Required", defaultValue = "") {
        return new Promise((resolve) => {
            const modal = document.getElementById('promptModal');
            const titleEl = document.getElementById('promptTitle');
            const messageEl = document.getElementById('promptMessage');
            const inputEl = document.getElementById('promptInput');
            const btnSubmit = document.getElementById('btnPromptSubmit');
            const btnCancel = document.getElementById('btnPromptCancel');

            titleEl.textContent = title;
            messageEl.textContent = message;
            inputEl.value = defaultValue;
            modal.classList.remove('hidden');

            // Focus automatically for better UX
            setTimeout(() => inputEl.focus(), 100);

            const closeAndResolve = (value) => {
                modal.classList.add('hidden');
                inputEl.onkeydown = null; // Clean up listener
                resolve(value);
            };

            btnSubmit.onclick = () => closeAndResolve(inputEl.value);
            btnCancel.onclick = () => closeAndResolve(null);

            // Allow "Enter" to submit and "Escape" to cancel
            inputEl.onkeydown = (e) => {
                if (e.key === 'Enter') closeAndResolve(inputEl.value);
                if (e.key === 'Escape') closeAndResolve(null);
            };
        });
    };

    window.isEmpty = async function (data) {
        try {
            if (data === null || data === undefined) return true;

            if (typeof data === "string" || Array.isArray(data)) {
                return data.length === 0;
            }

            if (typeof data === "object") {
                return Object.keys(data).length === 0;
            }

            return false;

        } catch (error) {
            if (typeof window.customAlert === "function") {
                window.customAlert("Error occurs on processing data");
            }
            console.error(`ERROR: ${error.message}`);
            return true; // Resolves as true by default on error
        }
    };

    // Initialize modules
    LogsUI.init();
    DashboardUI.init();

    const bootApplication = async () => {
        try {
            // Verify token is still valid on backend
            await api.verifySession();

            // Hide modal
            authModal.classList.add("hidden");

            // Log success
            LogsUI.add({ message: "Dashboard unlocked and authenticated.", type: "success", source: "AUTH" });

            // Load initial data
            const data = await api.getNodes();
            DashboardUI.render(data.nodes);

            // Connect Real-Time Socket
            SocketManager.connect();

        } catch (error) {
            // Token invalid or expired
            state.set('token', null);
            authModal.classList.remove("hidden");
        }
    };

    // Form Submission
    authForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();
        authError.classList.add("hidden");

        try {
            const res = await api.login(username, password);
            if (res.success) {
                state.set('token', res.token);
                state.set('user', res.user);

                // Clear inputs
                passwordInput.value = "";

                await bootApplication();
            }
        } catch (err) {
            authError.textContent = err.message || "Authentication failed.";
            authError.classList.remove("hidden");
        }
    });

    // Lock Session
    lockSessionBtn?.addEventListener("click", () => {
        state.set('token', null);
        SocketManager.disconnect();
        window.location.reload();
    });

    // Startup Logic
    if (state.get('token')) {
        bootApplication();
    } else {
        authModal.classList.remove("hidden");
    }
});