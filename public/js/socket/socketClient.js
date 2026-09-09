import { state } from '../core/state.js';
import { LogsUI } from '../ui/logs.js';
import { DashboardUI } from '../ui/dashboard.js';
import { api } from '../core/api.js';

export const SocketManager = (() => {
    let socket = null;

    return {
        connect: () => {
            const token = state.get('token');
            if (!token) return;

            if (socket && socket.connected) return;

            // ✨ FIXED: Auth ko function callback banaya hai taaki reconnection ke waqt fresh token mile
            socket = window.io({
                auth: (cb) => {
                    cb({
                        clientType: 'dashboard',
                        token: state.get('token')
                    });
                },
                transports: ["websocket", "polling"],
                reconnection: true,
                reconnectionAttempts: Infinity, // Hamesha try karta rahega
                reconnectionDelay: 3000,        // Har 3 seconds me retry
                reconnectionDelayMax: 10000
            });

            socket.on("connect", () => {
                state.set('isSocketConnected', true);
                const badge = document.getElementById("socketStatusBadge");
                if (badge) {
                    badge.className = "inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
                    badge.innerHTML = `<span class="h-2 w-2 rounded-full bg-emerald-400"></span> <span>Secured</span>`;
                }
                LogsUI.add({ message: "Real-time socket connection established.", type: "success", source: "NETWORK" });
            });
            socket.on()

            socket.on("connect_error", (error) => {
                LogsUI.add({ message: `Socket Error: ${error.message}`, type: "error", source: "NETWORK" });
                if (error.message.includes("Authentication error")) {
                    state.set('token', null);
                    window.location.reload();
                }
            });

            socket.on("disconnect", (reason) => {
                state.set('isSocketConnected', false);
                const badge = document.getElementById("socketStatusBadge");
                if (badge) {
                    badge.className = "inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/20";
                    badge.innerHTML = `<span class="h-2 w-2 rounded-full bg-rose-400 animate-pulse"></span> <span>Disconnected (Retrying...)</span>`;
                }
                LogsUI.add({ message: `Socket connection lost (${reason}). Retrying automatically...`, type: "warning", source: "NETWORK" });
            });

            // ==========================================
            // BUSINESS LOGIC EVENTS
            // ==========================================
            socket.on("node-status-changed", async (data) => {
                LogsUI.add({
                    message: `Node ${data.nodeId} is now ${data.isOnline ? 'ONLINE' : 'OFFLINE'}`,
                    type: data.isOnline ? "success" : "warning",
                    source: "NODE"
                });

                try {
                    const res = await api.getNodes();
                    DashboardUI.render(res.nodes);
                } catch (e) {
                    console.error("Failed to refresh nodes", e);
                }
            });

            socket.on("command-error", (data) => {
                LogsUI.add({
                    message: `Command failed for ${data.targetNodeId}: ${data.message}`,
                    type: "error",
                    source: "COMMAND"
                });
            });
        },

        get: () => socket,

        disconnect: () => {
            if (socket) {
                socket.disconnect();
                socket = null;
            }
        }
    };
})(); 




