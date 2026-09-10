import { state } from './core/state.js';
import { api } from './core/api.js';
import { SocketManager } from './socket/socketClient.js';
import { encryptPayload, decryptPayload } from './core/crypto.js';
import { LogsUI } from './ui/logs.js';
import { runWebRtcConnection } from "./webrtc/rtcDomManager.js";
const PROVISIONING_KEY = '3JyX_DVhwCTQXPas2rReblx2oOzxSFRQwSBxdvqOIjY';

// ==========================================
// PROGRESS BAR HELPERS
// ==========================================
function showProgress() {
    const bar = document.getElementById('globalProgressBar');
    if (bar) bar.classList.remove('hidden');
}

function hideProgress() {
    const bar = document.getElementById('globalProgressBar');
    if (bar) bar.classList.add('hidden');
}

document.addEventListener("DOMContentLoaded", async () => {

    // ==========================================
    // PROMISE-BASED MODALS (Preserved exactly as requested)
    // ==========================================
    window.customConfirm = function (message, title = "Confirm Action") {
        return new Promise((resolve) => {
            const modal = document.getElementById('confirmModal');
            document.getElementById('confirmTitle').textContent = title;
            document.getElementById('confirmMessage').textContent = message;
            modal.classList.remove('hidden');

            document.getElementById('btnConfirmYes').onclick = () => { modal.classList.add('hidden'); resolve(true); };
            document.getElementById('btnConfirmCancel').onclick = () => { modal.classList.add('hidden'); resolve(false); };
        });
    };

    window.customAlert = function (message, title = "Information") {
        return new Promise((resolve) => {
            const modal = document.getElementById('alertModal');
            document.getElementById('alertTitle').textContent = title;
            document.getElementById('alertMessage').textContent = message;
            modal.classList.remove('hidden');

            document.getElementById('btnAlertOk').onclick = () => { modal.classList.add('hidden'); resolve(); };
        });
    };

    window.customPrompt = function (message, title = "Input Required", defaultValue = "") {
        return new Promise((resolve) => {
            const modal = document.getElementById('promptModal');
            const inputEl = document.getElementById('promptInput');

            document.getElementById('promptTitle').textContent = title;
            document.getElementById('promptMessage').textContent = message;
            inputEl.value = defaultValue;
            modal.classList.remove('hidden');

            setTimeout(() => inputEl.focus(), 100);

            const closeAndResolve = (value) => {
                modal.classList.add('hidden');
                inputEl.onkeydown = null;
                resolve(value);
            };

            document.getElementById('btnPromptSubmit').onclick = () => closeAndResolve(inputEl.value);
            document.getElementById('btnPromptCancel').onclick = () => closeAndResolve(null);

            inputEl.onkeydown = (e) => {
                if (e.key === 'Enter') closeAndResolve(inputEl.value);
                if (e.key === 'Escape') closeAndResolve(null);
            };
        });
    };

    window.isEmpty = async function (data) {
        try {
            if (data === null || data === undefined) return true;
            if (typeof data === "string" || Array.isArray(data)) return data.length === 0;
            if (typeof data === "object") return Object.keys(data).length === 0;
            return false;
        } catch (error) {
            if (typeof window.customAlert === "function") window.customAlert("Error occurs on processing data");
            return true;
        }
    };

    window.showToast = function (message, type = "info") {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        let bgClass = "bg-slate-800 border-slate-700 text-slate-200";
        let icon = '<i class="fa-solid fa-circle-info text-sky-400"></i>';

        if (type === "success") {
            bgClass = "bg-emerald-900/90 border-emerald-700 text-emerald-100";
            icon = '<i class="fa-solid fa-circle-check text-emerald-400"></i>';
        } else if (type === "error") {
            bgClass = "bg-rose-900/90 border-rose-700 text-rose-100";
            icon = '<i class="fa-solid fa-triangle-exclamation text-rose-400"></i>';
        }

        toast.className = `flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border backdrop-blur-md transition-all duration-300 transform translate-y-4 opacity-0 pointer-events-auto ${bgClass}`;
        toast.innerHTML = `${icon} <span class="text-xs font-bold font-mono tracking-wide">${message}</span>`;

        container.appendChild(toast);
        requestAnimationFrame(() => toast.classList.remove('translate-y-4', 'opacity-0'));

        setTimeout(() => {
            toast.classList.add('opacity-0', 'translate-y-2');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    };

    LogsUI.init();

    // ==========================================
    // INITIALIZATION & AUTHENTICATION
    // ==========================================
    const urlParams = new URLSearchParams(window.location.search);
    const targetNodeId = urlParams.get('id');

    if (!targetNodeId) {
        customAlert("No Node ID specified.");
        window.location.href = '/index.html';
        return;
    }

    try {
        const res = await api.getNodeById(targetNodeId);
        document.getElementById('nodeHostname').textContent = `${res.node.hostname} (${res.node.platform})`;

        const caps = res.node.capabilities || {};
        document.querySelectorAll('[data-capability]').forEach(el => {
            const reqCap = el.getAttribute('data-capability');
            if (caps[reqCap] === false) el.classList.add('hidden');
        });
    } catch (e) {
        await customAlert("Failed to load node: " + e.message);
        window.location.href = '/index.html';
        return;
    }

    SocketManager.connect();
    const socket = SocketManager.get();

    const encoder = new TextEncoder();
    const keyData = encoder.encode(PROVISIONING_KEY);
    const sessionKeyBuffer = await window.crypto.subtle.digest('SHA-256', keyData);

    // ==========================================
    // E2E COMMAND DISPATCHER & CANCEL LOGIC
    // ==========================================
    const btnCancelCommand = document.getElementById('btnCancelCommand');
    if (btnCancelCommand) {
        btnCancelCommand.addEventListener('click', () => {
            hideProgress();
            window.showToast("Command aborted by user.", "error");
            if (socket && socket.connected) {
                socket.emit('cancel-command', { targetNodeId: targetNodeId });
            }
        });
    }

    window.dispatchE2ECommand = async function (type, payloadData = {}, auth = { isAuthRequired: false }) {
        if (!socket || !socket.connected) {
            await customAlert("Socket is disconnected. Cannot dispatch command.");
            return;
        }

        // Silent execution for media streams (no blocking progress UI)
        const silentCommands = ['start_screen', 'stop_screen', 'start_camera', 'stop_camera', 'start_audio'];
        if (!silentCommands.includes(type)) {
            showProgress();
        }

        const payloadString = JSON.stringify({ commandId: crypto.randomUUID(), type: type, payload: payloadData });

        try {
            const encryptedEnvelope = await encryptPayload(payloadString, sessionKeyBuffer, "dashboard-admin");
            socket.emit('dispatch-command', { targetNodeId, encryptedEnvelope, auth });
            LogsUI.add({ message: `Dispatched encrypted command: ${type}`, type: "info", source: "COMMAND" });
        } catch (err) {
            LogsUI.add({ message: `Encryption failed: ${err.message}`, type: "error", source: "CRYPTO" });
            hideProgress();
        }
    };

    // ==========================================
    // SYSTEM & ACTION CONTROLS BINDINGS
    // ==========================================
    const bindClick = (id, handler) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', handler);
    };

    bindClick('btnLock', async () => { if (await customConfirm("Lock remote OS?")) window.dispatchE2ECommand('lock_screen'); });
    bindClick('btnRestart', async () => { if (await customConfirm("Restart remote OS?")) window.dispatchE2ECommand('restart'); });
    bindClick('btnShutdown', async () => { if (await customConfirm("Shutdown remote OS?")) window.dispatchE2ECommand('shutdown'); });

    bindClick('btnSetBrightness', async () => {
        if (await customConfirm("Change Brightness?")) {
            let val = document.querySelector('#brightnessSlider').value;
            let range = (val >= 0 && val <= 100) ? val : 50;
            window.dispatchE2ECommand('control_brightness', { range });
        }
    });

    bindClick('btnSpeak', async () => {
        let textToSpeak = document.getElementById('ttsInput')?.value;
        if (await window.isEmpty(textToSpeak)) return customAlert(`Enter text to speak at node.`);
        window.dispatchE2ECommand('text-to-speak', { textToSpeak });
    });

    // ==========================================
    // FILE EXPLORER, EDITORS & MEDIA LOGIC
    // ==========================================
    let currentRemotePath = 'root';
    window.activeEditingPath = null;

    window.navigateToDir = (path) => window.dispatchE2ECommand('get_dir_tree', { path });

    window.deleteRemoteItem = async (event, path) => {
        if (event) { event.preventDefault(); event.stopPropagation(); }
        let authPass = await window.customPrompt("Enter File security key", "Authentication Needed !!");
        if ((await window.isEmpty(authPass))) return await customAlert("Authorization required to delete files/folders");

        if (await customConfirm(`Delete ${path}?`)) {
            window.dispatchE2ECommand('delete_item', { path }, { isAuthRequired: true, authPass });
            setTimeout(() => window.navigateToDir(currentRemotePath), 800);
        }
    };

    bindClick('btnRefreshFiles', () => window.navigateToDir(currentRemotePath));

    bindClick('btnNewFolder', async () => {
        const folderName = await customPrompt("Enter new folder name:");
        if (folderName && currentRemotePath !== 'root') {
            const newPath = currentRemotePath.endsWith('/') || currentRemotePath.endsWith('\\') ? currentRemotePath + folderName : currentRemotePath + '/' + folderName;
            window.dispatchE2ECommand('create_folder', { path: newPath });
            setTimeout(() => window.navigateToDir(currentRemotePath), 800);
        } else {
            customAlert("Please navigate inside a valid drive/folder first.");
        }
    });

    bindClick('btnNewFile', async () => {
        const fileName = await customPrompt("Enter new file name (e.g. note.txt):");
        if (fileName && currentRemotePath !== 'root') {
            const newPath = currentRemotePath.endsWith('/') || currentRemotePath.endsWith('\\') ? currentRemotePath + fileName : currentRemotePath + '/' + fileName;
            window.activeEditingPath = newPath;
            openFileEditor(newPath, "");
        } else {
            await customAlert("Please navigate inside a valid drive/folder first.");
        }
    });

    // Native Browser Download via Hidden iframe (Preserved logic)
    window.triggerNativeDownload = function (event, path, isDir) {
        if (event) { event.preventDefault(); event.stopPropagation(); }
        const token = state.get('token') || '';
        if (!token) return window.showToast("Authentication token missing from state!", "error");

        const action = isDir ? 'zip' : 'download';
        const url = `/api/nodes/${targetNodeId}/stream?token=${encodeURIComponent(token)}&path=${encodeURIComponent(path)}&action=${action}`;

        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = url;
        document.body.appendChild(iframe);

        setTimeout(() => { if (document.body.contains(iframe)) document.body.removeChild(iframe); }, 5000);
        window.showToast(isDir ? "Starting 7-Zip live stream..." : "Starting native download...", "info");
    };

    // Smart File Opener
    window.openFile = (path) => {
        const ext = path.split('.').pop().toLowerCase();
        const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'];
        const streamMediaExts = ['mp4', 'webm', 'mkv', 'mp3', 'wav', 'ogg'];
        window.activeEditingPath = path;

        if (imageExts.includes(ext)) {
            LogsUI.add({ message: `Fetching image file: ${path}`, type: "info" });
            window.dispatchE2ECommand('read_binary_file', { path });
        } else if (streamMediaExts.includes(ext)) {
            LogsUI.add({ message: `Streaming media file: ${path}`, type: "info" });
            renderMediaPreview(path, null, true);
        } else {
            window.dispatchE2ECommand('read_file', { path });
        }
    };

    // File Editor Modal
    const modal = document.getElementById('fileEditorModal');
    const textarea = document.getElementById('fileContentInput');

    function openFileEditor(filePath, content) {
        document.getElementById('editingFileName').textContent = filePath;
        textarea.value = content;
        modal.classList.remove('hidden');
    }

    bindClick('btnCloseModal', () => modal.classList.add('hidden'));
    bindClick('btnCancelEdit', () => modal.classList.add('hidden'));
    bindClick('btnSaveFile', () => {
        if (window.activeEditingPath) {
            window.dispatchE2ECommand('save_file', { path: window.activeEditingPath, content: textarea.value });
            modal.classList.add('hidden');
            LogsUI.add({ message: `Saved file: ${window.activeEditingPath}`, type: "success" });
        }
    });

    // Media Preview UI Logic
    let currentMediaBlobUrl = null;
    function base64ToBlob(base64, mimeType) {
        const byteCharacters = atob(base64);
        const byteArrays = [];
        for (let offset = 0; offset < byteCharacters.length; offset += 512) {
            const slice = byteCharacters.slice(offset, offset + 512);
            const byteNumbers = new Array(slice.length);
            for (let i = 0; i < slice.length; i++) byteNumbers[i] = slice.charCodeAt(i);
            byteArrays.push(new Uint8Array(byteNumbers));
        }
        return new Blob(byteArrays, { type: mimeType });
    }

    function renderMediaPreview(filePath, mediaObj, useStream = false) {
        document.getElementById('mediaTitle').textContent = filePath;
        const mediaContainer = document.getElementById('mediaContainer');
        mediaContainer.innerHTML = '';

        const btnDownloadMedia = document.getElementById('btnDownloadMedia');
        if (btnDownloadMedia) {
            btnDownloadMedia.onclick = (e) => { e.preventDefault(); window.triggerNativeDownload(e, filePath, false); };
        }

        if (currentMediaBlobUrl) { URL.revokeObjectURL(currentMediaBlobUrl); currentMediaBlobUrl = null; }

        if (useStream) {
            const token = state.get('token') || '';
            if (!token) return window.showToast("Auth token missing for streaming!", "error");
            const streamUrl = `/api/nodes/${targetNodeId}/stream?token=${encodeURIComponent(token)}&path=${encodeURIComponent(filePath)}&action=stream`;
            const ext = filePath.split('.').pop().toLowerCase();

            if (['mp3', 'wav', 'ogg'].includes(ext)) mediaContainer.innerHTML = `<audio src="${streamUrl}" controls autoplay class="w-full"></audio>`;
            else mediaContainer.innerHTML = `<video src="${streamUrl}" controls autoplay class="max-h-[70vh] max-w-full rounded"></video>`;
        } else if (mediaObj) {
            const blob = base64ToBlob(mediaObj.data, mediaObj.mimeType);
            currentMediaBlobUrl = URL.createObjectURL(blob);
            if (mediaObj.mimeType.startsWith('image/')) mediaContainer.innerHTML = `<img src="${currentMediaBlobUrl}" class="max-h-[70vh] max-w-full object-contain rounded" />`;
            else if (mediaObj.mimeType.startsWith('video/')) mediaContainer.innerHTML = `<video src="${currentMediaBlobUrl}" controls autoplay class="max-h-[70vh] max-w-full rounded"></video>`;
            else if (mediaObj.mimeType.startsWith('audio/')) mediaContainer.innerHTML = `<audio src="${currentMediaBlobUrl}" controls autoplay class="w-full"></audio>`;
        }
        document.getElementById('mediaModal').classList.remove('hidden');
    }

    bindClick('btnCloseMediaModal', () => {
        document.getElementById('mediaModal').classList.add('hidden');
        document.getElementById('mediaContainer').innerHTML = '';
        if (currentMediaBlobUrl) { URL.revokeObjectURL(currentMediaBlobUrl); currentMediaBlobUrl = null; }
    });

    // File Tree Renderer (Preserved exactly with specific icons & download actions)
    function renderFileTree(data) {
        currentRemotePath = data.currentPath;
        const pathText = document.getElementById('currentPathText');
        if (pathText) pathText.textContent = data.currentPath;

        const container = document.getElementById('filesContainer');
        if (!container) return;
        container.innerHTML = '';

        if (data.currentPath !== 'root') {
            const parentDir = data.currentPath.substring(0, data.currentPath.lastIndexOf('\\')) || data.currentPath.substring(0, data.currentPath.lastIndexOf('/')) || 'root';
            const upDiv = document.createElement('div');
            upDiv.className = "flex items-center gap-2 p-2 hover:bg-slate-800/50 rounded cursor-pointer transition text-slate-300";
            upDiv.onclick = () => window.navigateToDir(parentDir);
            upDiv.innerHTML = `<i class="fa-solid fa-level-up-alt text-indigo-400 w-4"></i><span class="text-[10px] font-bold">.. (Up)</span>`;
            container.appendChild(upDiv);
        }

        data.items.forEach(item => {
            const icon = item.isDirectory ? '<i class="fa-solid fa-folder text-amber-400"></i>' : '<i class="fa-solid fa-file text-slate-400"></i>';
            const itemDiv = document.createElement('div');
            itemDiv.className = "flex items-center justify-between p-2 hover:bg-slate-800/50 rounded transition group";

            const clickArea = document.createElement('div');
            clickArea.className = "flex items-center gap-2 flex-1 min-w-0 cursor-pointer text-slate-300";
            clickArea.onclick = () => item.isDirectory ? window.navigateToDir(item.path) : window.openFile(item.path);
            clickArea.innerHTML = `<div class="w-4 text-center">${icon}</div><span class="text-[10px] font-medium truncate group-hover:text-white" title="${item.name}">${item.name}</span>`;

            const actionsDiv = document.createElement('div');
            actionsDiv.className = "opacity-0 group-hover:opacity-100 transition flex items-center gap-2";

            if (!item.isDirectory) {
                const btnDownload = document.createElement('button');
                btnDownload.className = "h-5 w-5 rounded bg-indigo-900/30 text-indigo-400 hover:bg-indigo-900 hover:text-white flex items-center justify-center transition";
                btnDownload.title = "Download";
                btnDownload.innerHTML = `<i class="fa-solid fa-download text-[8px]"></i>`;
                btnDownload.onclick = (e) => window.triggerNativeDownload(e, item.path, false);
                actionsDiv.appendChild(btnDownload);
            }

            const btnDelete = document.createElement('button');
            btnDelete.className = "h-5 w-5 rounded bg-rose-900/30 text-rose-400 hover:bg-rose-900 hover:text-white flex items-center justify-center transition";
            btnDelete.title = "Delete";
            btnDelete.innerHTML = `<i class="fa-solid fa-trash text-[8px]"></i>`;
            btnDelete.onclick = (e) => window.deleteRemoteItem(e, item.path);
            actionsDiv.appendChild(btnDelete);

            itemDiv.appendChild(clickArea);
            itemDiv.appendChild(actionsDiv);
            container.appendChild(itemDiv);
        });
    }

    // ==========================================
    // SOCKET LISTENERS FOR DASHBOARD
    // ==========================================
    socket.on('command-response-relay', async (data) => {
        if (data.nodeId !== targetNodeId) return;
        hideProgress();

        try {
            const decryptedString = await decryptPayload(data.envelope, sessionKeyBuffer);
            const response = JSON.parse(decryptedString);

            if (response.success) {
                if (!['start_screen', 'stop_screen', 'start_camera', 'stop_camera', 'start_audio'].includes(response.type)) {
                    window.showToast(`Success: ${response.status}`, "success");
                    LogsUI.add({ message: `Success: ${response.status}`, type: "success", source: "NODE" });
                }

                if (response.data && typeof response.data.items !== 'undefined') renderFileTree(response.data);
                else if (response.data && response.data.data && response.data.mimeType) renderMediaPreview(window.activeEditingPath, response.data, false);
                else if (response.data && typeof response.data.content !== 'undefined') openFileEditor(window.activeEditingPath, response.data.content);
            } else {
                if (response.error && (response.error.includes("30MB") || response.error.includes("too large"))) {
                    window.showToast("File is very large, switching to native stream...", "info");
                    renderMediaPreview(window.activeEditingPath, null, true);
                } else {
                    window.showToast(`Failed: ${response.error}`, "error");
                    LogsUI.add({ message: `Failed: ${response.error}`, type: "error", source: "NODE" });
                    await customAlert(`Operation Failed: ${response.error}`);
                }
            }
        } catch (err) {
            window.showToast("Decryption failed!", "error");
            LogsUI.add({ message: `Decryption failed: ${err.message}`, type: "error", source: "SECURITY" });
        }
    });

    socket.on('node-status-changed', (data) => {
        if (data.nodeId === targetNodeId) {
            const badge = document.getElementById('nodeStatusBadge');
            if (!badge) return;

            if (data.isOnline) {
                window.showToast("Node is Online", "success");
                badge.className = "inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
                badge.innerHTML = `<i class="fa-solid fa-wifi"></i> Online`;
            } else {
                window.showToast("Node went Offline", "error");
                badge.className = "inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/20";
                badge.innerHTML = `<i class="fa-solid fa-link-slash"></i> Offline`;
            }
        }
    });

    socket.on('command-error', async (data) => {
        hideProgress();
        window.showToast(`Error: ${data.message}`, "error");
    });

    // Initialize the updated WebRTC stream module
    runWebRtcConnection(window.showToast);

    // Boot into default directory state
    setTimeout(() => window.navigateToDir('root'), 1000);
});