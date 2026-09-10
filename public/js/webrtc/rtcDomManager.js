import { SocketManager } from "../socket/socketClient.js";
import { WebRTCManager } from "./rtcManager.js";

export const runWebRtcConnection = (showToast) => {
    const urlParams = new URLSearchParams(window.location.search);
    const targetNodeId = urlParams.get('id');
    if (!targetNodeId) return;

    // Grab all UI elements
    const ui = {
        connectBtn: document.getElementById('btnConnectWebRTC'),
        disconnectBtn: document.getElementById('btnCloseWebRTC'),
        startScreen: document.getElementById('btnStartScreen'),
        stopScreen: document.getElementById('btnStopScreen'),
        startCamera: document.getElementById('btnStartCamera'),
        stopCamera: document.getElementById('btnStopCamera'),
        startAudio: document.getElementById('btnStartAudio'),
        statusDot: document.getElementById('rtcStatusDot'),

        // 🔥 Naye 2-Way Audio (Admin Mic) Elements
        startMyMic: document.getElementById('btnStartMyMic'),
        stopMyMic: document.getElementById('btnStopMyMic'),

        // 🔥 Naye Fullscreen aur Video Elements
        fullscreenScreenBtn: document.getElementById('btnFullscreenScreen'),
        fullscreenCameraBtn: document.getElementById('btnFullscreenCamera'),
        screenVideo: document.getElementById('screenVideo'),
        cameraVideo: document.getElementById('cameraVideo')
    };

    // State Toggler
    const toggleMediaControls = (isConnected) => {
        if (ui.connectBtn) ui.connectBtn.disabled = isConnected;

        if (ui.disconnectBtn) ui.disconnectBtn.disabled = !isConnected;
        if (ui.startScreen) ui.startScreen.disabled = !isConnected;
        if (ui.stopScreen) ui.stopScreen.disabled = !isConnected;
        if (ui.startCamera) ui.startCamera.disabled = !isConnected;
        if (ui.stopCamera) ui.stopCamera.disabled = !isConnected;
        if (ui.startAudio) ui.startAudio.disabled = !isConnected;

        // 🔥 2-Way Audio buttons ko bhi disable/enable karein
        if (ui.startMyMic) ui.startMyMic.disabled = !isConnected;
        if (ui.stopMyMic) ui.stopMyMic.disabled = !isConnected;

        // 🔥 Fullscreen buttons ko bhi disable/enable karein
        if (ui.fullscreenScreenBtn) ui.fullscreenScreenBtn.disabled = !isConnected;
        if (ui.fullscreenCameraBtn) ui.fullscreenCameraBtn.disabled = !isConnected;

        // Visual Indicator
        if (ui.statusDot) {
            if (isConnected) {
                ui.statusDot.classList.replace('bg-rose-500', 'bg-emerald-500');
                ui.statusDot.classList.replace('shadow-[0_0_8px_rgba(244,63,94,0.8)]', 'shadow-[0_0_8px_rgba(16,185,129,0.8)]');
            } else {
                ui.statusDot.classList.replace('bg-emerald-500', 'bg-rose-500');
                ui.statusDot.classList.replace('shadow-[0_0_8px_rgba(16,185,129,0.8)]', 'shadow-[0_0_8px_rgba(244,63,94,0.8)]');
            }
        }
    };

    const webRtc = new WebRTCManager(SocketManager, targetNodeId, showToast, toggleMediaControls);
    toggleMediaControls(false);

    const dispatchE2E = (cmd) => {
        if (typeof window.dispatchE2ECommand === 'function') window.dispatchE2ECommand(cmd);
    };

    ui.connectBtn?.addEventListener('click', async () => {
        await webRtc.connect();
        if (ui.connectBtn) ui.connectBtn.disabled = true;
    });

    ui.disconnectBtn?.addEventListener('click', () => {
        dispatchE2E('stop_screen');
        dispatchE2E('stop_camera');
        dispatchE2E('stop_audio');

        webRtc.close();
        if (showToast) showToast("Connection & Hardware disconnected.", "info");
    });

    // --- SCREEN CONTROLS ---
    ui.startScreen?.addEventListener('click', () => {
        dispatchE2E('start_screen');
        if (ui.startScreen) ui.startScreen.disabled = true;
        if (ui.stopScreen) ui.stopScreen.disabled = false;
    });
    ui.stopScreen?.addEventListener('click', () => {
        dispatchE2E('stop_screen');
        if (ui.startScreen) ui.startScreen.disabled = false;
        if (ui.stopScreen) ui.stopScreen.disabled = true;
    });

    // --- CAMERA CONTROLS ---
    ui.startCamera?.addEventListener('click', () => {
        dispatchE2E('start_camera');
        if (ui.startCamera) ui.startCamera.disabled = true;
        if (ui.stopCamera) ui.stopCamera.disabled = false;
    });
    ui.stopCamera?.addEventListener('click', () => {
        dispatchE2E('stop_camera');
        if (ui.startCamera) ui.startCamera.disabled = false;
        if (ui.stopCamera) ui.stopCamera.disabled = true;
    });

    // --- AUDIO CONTROLS ---
    ui.startAudio?.addEventListener('click', () => {
        dispatchE2E('start_audio');
        if (ui.startAudio) ui.startAudio.disabled = true;
    });

    // 🔥 2-WAY AUDIO LOGIC (Admin Mic)
    ui.startMyMic?.addEventListener('click', () => {
        if (webRtc.startMyMic) webRtc.startMyMic();
    });

    ui.stopMyMic?.addEventListener('click', () => {
        if (webRtc.stopMyMic) webRtc.stopMyMic();
    });

    // 🔥 FULLSCREEN LOGIC FOR SCREEN VIDEO
    ui.fullscreenScreenBtn?.addEventListener('click', () => {
        if (!ui.screenVideo) return;
        if (ui.screenVideo.requestFullscreen) {
            ui.screenVideo.requestFullscreen();
        } else if (ui.screenVideo.webkitRequestFullscreen) { /* Safari */
            ui.screenVideo.webkitRequestFullscreen();
        } else if (ui.screenVideo.msRequestFullscreen) { /* IE11 */
            ui.screenVideo.msRequestFullscreen();
        }
    });

    // 🔥 FULLSCREEN LOGIC FOR CAMERA VIDEO
    ui.fullscreenCameraBtn?.addEventListener('click', () => {
        if (!ui.cameraVideo) return;
        if (ui.cameraVideo.requestFullscreen) {
            ui.cameraVideo.requestFullscreen();
        } else if (ui.cameraVideo.webkitRequestFullscreen) { /* Safari */
            ui.cameraVideo.webkitRequestFullscreen();
        } else if (ui.cameraVideo.msRequestFullscreen) { /* IE11 */
            ui.cameraVideo.msRequestFullscreen();
        }
    });
};