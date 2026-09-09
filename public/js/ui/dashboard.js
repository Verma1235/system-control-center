import { api } from '../core/api.js';
import { LogsUI } from './logs.js';
import { state } from '../core/state.js';

export const DashboardUI = (() => {
    let container = null;

    const createCapabilityBadges = (capabilities) => {
        if (!capabilities || Object.keys(capabilities).length === 0) {
            return `<span class="text-[10px] text-slate-500 italic">No capabilities reported</span>`;
        }

        const icons = {
            camera: '<i class="fa-solid fa-video"></i>',
            screenCapture: '<i class="fa-solid fa-desktop"></i>',
            fileManager: '<i class="fa-solid fa-folder"></i>',
            lock: '<i class="fa-solid fa-lock"></i>',
            shutdown: '<i class="fa-solid fa-power-off"></i>'
        };

        let html = '';
        for (const [key, enabled] of Object.entries(capabilities)) {
            if (enabled && icons[key]) {
                html += `<span class="inline-flex items-center justify-center h-6 w-6 rounded bg-slate-800 text-slate-400 border border-slate-700 tooltip" title="${key}">${icons[key]}</span>`;
            }
        }
        return html;
    };

    const handleApprovalToggle = async (nodeId, currentlyApproved) => {
        try {
            const password = await window.customPrompt("Enter Security Password", "Authorization Required");
            if ((await window.isEmpty(password))) return await window.customAlert("You need security key to approve/invoke Node Permission", "Warnning");
            const result = await api.toggleNodeApproval(nodeId, !currentlyApproved, password);
            if (result.success) {
                LogsUI.add({
                    message: `Node ${nodeId} is ${!currentlyApproved ? "Allowed" : "Denied"} to manage system controls.`,
                    type: "success",
                    source: "SECURITY"
                });
                // Refresh list
                const nodesData = await api.getNodes();
                DashboardUI.render(nodesData.nodes);
            } else {
                LogsUI.add({
                    message: `Node ${nodeId} authorization faild. Securty key InValid`,
                    type: "warning",
                    source: "SECURITY"
                });
                window.customAlert(`Node ${nodeId} authorization faild. Securty key InValid`, "SECURITY WARNING!!")
            }
        } catch (error) {
            console.error(error?.message);
            LogsUI.add({ message: error.message, type: "error", source: "API" });
        }
    };

    return {
        init: () => {
            container = document.getElementById("clientsContainer");

            const refreshBtn = document.getElementById("refreshNodesBtn");
            if (refreshBtn) {
                refreshBtn.addEventListener("click", async () => {
                    refreshBtn.classList.add("animate-spin");
                    try {
                        const data = await api.getNodes();
                        DashboardUI.render(data.nodes);
                    } catch (err) {
                        LogsUI.add({ message: "Failed to refresh nodes", type: "error" });
                    } finally {
                        setTimeout(() => refreshBtn.classList.remove("animate-spin"), 500);
                    }
                });
            }

            // Expose globally for inline onclick handlers in the generated HTML
            window.toggleApproval = handleApprovalToggle;
        },

        render: (nodes) => {
            if (!container) return;

            state.set('nodes', nodes);

            if (!nodes || nodes.length === 0) {
                container.innerHTML = `
                    <div class="flex flex-col items-center justify-center py-10 text-center border border-dashed border-slate-800 rounded-xl bg-slate-900/20">
                        <i class="fa-solid fa-network-wired text-2xl text-slate-600 mb-3"></i>
                        <p class="text-xs font-semibold text-slate-400">No nodes registered.</p>
                        <p class="text-[10px] text-slate-500 mt-1">Connect an Electron agent using the provisioning secret.</p>
                    </div>`;
                return;
            }

            container.innerHTML = nodes.map(node => `
                <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-xl border ${node.is_approved ? 'border-slate-800 bg-slate-900/40' : 'border-amber-900/30 bg-amber-950/10'} hover:border-slate-700 transition">
                    
                    <div class="flex items-center gap-4 mb-3 sm:mb-0">
                        <!-- Status Indicator -->
                        <div class="relative flex h-3 w-3">
                          ${node.isOnline
                    ? `<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span class="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>`
                    : `<span class="relative inline-flex rounded-full h-3 w-3 bg-slate-600"></span>`}
                        </div>
                        
                        <div>
                            <div class="flex items-center gap-2">
                                <h3 class="text-sm font-bold text-slate-200">${node.hostname}</h3>
                                ${!node.is_approved ? `<span class="px-1.5 py-0.5 rounded text-[8px] font-bold bg-amber-500/20 text-amber-400 uppercase border border-amber-500/20">Pending Approval</span>` : ''}
                            </div>
                            <p class="text-[10px] font-mono text-slate-500 mt-0.5">ID: ${node.id} | Platform: ${node.platform}</p>
                        </div>
                    </div>

                    <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full sm:w-auto">
                        <!-- Capabilities Grid -->
                        <div class="flex flex-wrap gap-1">
                            ${createCapabilityBadges(node.capabilities)}
                        </div>
                        
                        <div class="h-px w-full sm:h-8 sm:w-px bg-slate-800"></div>
                        
              <!-- Actions -->
                        <div class="flex gap-2 w-full sm:w-auto">
                            ${node.is_approved
                    // FIX: Merged the classes cleanly and kept the onclick handler safe
                    ? `<button class="flex-1 sm:flex-none px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold rounded shadow transition ${!node.isOnline ? 'opacity-50 cursor-not-allowed' : ''}" onclick="window.location.href='/node.html?id=${node.id}'" ${!node.isOnline ? 'disabled' : ''}>Manage</button>`
                    : ''}
                            <button class="flex-1 sm:flex-none px-3 py-1.5 ${node.is_approved ? 'bg-rose-900/30 text-rose-400 hover:bg-rose-900/50 border border-rose-900/50' : 'bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/50 border border-emerald-900/50'} text-[10px] font-bold rounded transition" onclick="window.toggleApproval('${node.id}', ${node.is_approved})">
                                ${node.is_approved ? 'Revoke' : 'Approve'}
                            </button>
                        </div>
                    </div>
                </div>
            `).join('');
        }
    };
})();