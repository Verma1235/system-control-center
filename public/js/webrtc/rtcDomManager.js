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

        // 🔥 Naye Fullscreen aur Video Elements
        fullscreenScreenBtn: document.getElementById('btnFullscreenScreen'),
        fullscreenCameraBtn: document.getElementById('btnFullscreenCamera'),
        screenVideo: document.getElementById('screenVideo'),
        cameraVideo: document.getElementById('cameraVideo')
    };

    // State Toggler
    const toggleMediaControls = (isConnected) => {
        ui.connectBtn.disabled = isConnected;

        ui.disconnectBtn.disabled = !isConnected;
        ui.startScreen.disabled = !isConnected;
        ui.stopScreen.disabled = !isConnected;
        ui.startCamera.disabled = !isConnected;
        ui.stopCamera.disabled = !isConnected;
        ui.startAudio.disabled = !isConnected;

        // 🔥 Fullscreen buttons ko bhi disable/enable karein
        if (ui.fullscreenScreenBtn) ui.fullscreenScreenBtn.disabled = !isConnected;
        if (ui.fullscreenCameraBtn) ui.fullscreenCameraBtn.disabled = !isConnected;

        // Visual Indicator
        if (isConnected) {
            ui.statusDot.classList.replace('bg-rose-500', 'bg-emerald-500');
            ui.statusDot.classList.replace('shadow-[0_0_8px_rgba(244,63,94,0.8)]', 'shadow-[0_0_8px_rgba(16,185,129,0.8)]');
        } else {
            ui.statusDot.classList.replace('bg-emerald-500', 'bg-rose-500');
            ui.statusDot.classList.replace('shadow-[0_0_8px_rgba(16,185,129,0.8)]', 'shadow-[0_0_8px_rgba(244,63,94,0.8)]');
        }
    };

    const webRtc = new WebRTCManager(SocketManager, targetNodeId, showToast, toggleMediaControls);
    toggleMediaControls(false);

    const dispatchE2E = (cmd) => {
        if (typeof window.dispatchE2ECommand === 'function') window.dispatchE2ECommand(cmd);
    };

    ui.connectBtn?.addEventListener('click', async () => {
        await webRtc.connect();
        ui.connectBtn.disabled = true;
    });

    ui.disconnectBtn?.addEventListener('click', () => {
        dispatchE2E('stop_screen');
        dispatchE2E('stop_camera');
        dispatchE2E('stop_audio');

        webRtc.close();
        if (showToast) showToast("Connection & Hardware disconnected.", "info");
    });

    ui.startScreen?.addEventListener('click', () => dispatchE2E('start_screen'));
    ui.stopScreen?.addEventListener('click', () => dispatchE2E('stop_screen'));
    ui.startCamera?.addEventListener('click', () => dispatchE2E('start_camera'));
    ui.stopCamera?.addEventListener('click', () => dispatchE2E('stop_camera'));
    ui.startAudio?.addEventListener('click', () => dispatchE2E('start_audio'));

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