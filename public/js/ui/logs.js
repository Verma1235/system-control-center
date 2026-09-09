/**
 * UI Controller for the Event Feed (Logs)
 */
const LogsUI = (() => {
    let container = null;
    let counts = { total: 0, success: 0, error: 0 };

    const updateStats = () => {
        const totalEl = document.getElementById("totalLogsCount");
        const successEl = document.getElementById("successLogsCount");
        const errorEl = document.getElementById("errorLogsCount");

        if (totalEl) totalEl.textContent = counts.total;
        if (successEl) successEl.textContent = counts.success;
        if (errorEl) errorEl.textContent = counts.error;
    };

    return {
        init: () => {
            container = document.getElementById("logsContainer");
            const clearBtn = document.getElementById("clearLogsBtn");
            if (clearBtn) {
                clearBtn.addEventListener("click", () => {
                    if (container) {
                        container.innerHTML = `<div class="flex flex-col items-center justify-center py-10 text-center border border-dashed border-slate-800 rounded-xl bg-slate-900/20"><p class="text-xs font-semibold text-slate-500">Logs cleared.</p></div>`;
                    }
                });
            }
        },

        add: ({ message, type = "info", source = "SYSTEM" }) => {
            if (!container) return;

            counts.total++;
            if (type === "success") counts.success++;
            if (type === "error" || type === "warning") counts.error++;
            updateStats();

            let bg = "bg-slate-900/40 border-slate-800 text-slate-300";
            let iconColor = "text-sky-400";

            if (type === "success") {
                bg = "bg-emerald-950/30 border-emerald-900/50 text-emerald-300";
                iconColor = "text-emerald-400";
            }
            if (type === "error") {
                bg = "bg-rose-950/30 border-rose-900/50 text-rose-300";
                iconColor = "text-rose-400";
            }
            if (type === "warning") {
                bg = "bg-amber-950/30 border-amber-900/50 text-amber-300";
                iconColor = "text-amber-400";
            }

            const time = new Date().toLocaleTimeString();
            const el = document.createElement("div");
            el.className = `p-3 rounded-lg border ${bg} transition-colors flex items-start gap-3`;
            el.innerHTML = `
                <div class="mt-0.5 ${iconColor}"><i class="fa-solid fa-circle text-[8px]"></i></div>
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-center mb-1">
                        <span class="text-[9px] font-bold uppercase tracking-wider">${source}</span>
                        <span class="text-[9px] text-slate-500">${time}</span>
                    </div>
                    <p class="break-words leading-relaxed">${message}</p>
                </div>
            `;

            if (container.firstElementChild?.classList.contains("border-dashed")) {
                container.innerHTML = "";
            }

            container.prepend(el);

            // Keep DOM light: limit to 100 logs
            if (container.children.length > 100) {
                container.removeChild(container.lastElementChild);
            }
        }
    };
})();

export { LogsUI };