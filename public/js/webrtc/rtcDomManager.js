import { SocketManager } from "../socket/socketClient.js";
import { WebRTCManager } from "./rtcManager.js";

export const runWebRtcConnection = (showToast) => {
    const urlParams = new URLSearchParams(window.location.search);
    const targetNodeId = urlParams.get("id");
    if (!targetNodeId) return;

    // Grab all UI elements
    const ui = {
        connectBtn: document.getElementById("btnConnectWebRTC"),
        disconnectBtn: document.getElementById("btnCloseWebRTC"),
        startScreen: document.getElementById("btnStartScreen"),
        stopScreen: document.getElementById("btnStopScreen"),
        startCamera: document.getElementById("btnStartCamera"),
        stopCamera: document.getElementById("btnStopCamera"),
        startAudio: document.getElementById("btnStartAudio"),
        statusDot: document.getElementById("rtcStatusDot"),

        // Naye 2-Way Audio (Admin Mic) Elements
        startMyMic: document.getElementById("btnStartMyMic"),
        stopMyMic: document.getElementById("btnStopMyMic"),

        // Naye Fullscreen aur Video Elements
        fullscreenScreenBtn: document.getElementById("btnFullscreenScreen"),
        fullscreenCameraBtn: document.getElementById("btnFullscreenCamera"),
        screenVideo: document.getElementById("screenVideo"),
        cameraVideo: document.getElementById("cameraVideo"),

        // 🔥 Naya Wrapper for Screen Fullscreen
        videoContainer: document.getElementById("videoContainer"),
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

        // 2-Way Audio buttons ko bhi disable/enable karein
        if (ui.startMyMic) ui.startMyMic.disabled = !isConnected;
        if (ui.stopMyMic) ui.stopMyMic.disabled = !isConnected;

        // Fullscreen buttons ko bhi disable/enable karein
        if (ui.fullscreenScreenBtn) ui.fullscreenScreenBtn.disabled = !isConnected;
        if (ui.fullscreenCameraBtn) ui.fullscreenCameraBtn.disabled = !isConnected;

        // Visual Indicator
        if (ui.statusDot) {
            if (isConnected) {
                ui.statusDot.classList.replace("bg-rose-500", "bg-emerald-500");
                ui.statusDot.classList.replace(
                    "shadow-[0_0_8px_rgba(244,63,94,0.8)]",
                    "shadow-[0_0_8px_rgba(16,185,129,0.8)]",
                );
            } else {
                ui.statusDot.classList.replace("bg-emerald-500", "bg-rose-500");
                ui.statusDot.classList.replace(
                    "shadow-[0_0_8px_rgba(16,185,129,0.8)]",
                    "shadow-[0_0_8px_rgba(244,63,94,0.8)]",
                );
            }
        }
    };
    const socket = SocketManager.get();

    const webRtc = new WebRTCManager(
        SocketManager,
        targetNodeId,
        showToast,
        toggleMediaControls,
    );
    toggleMediaControls(false);

    const dispatchE2E = (cmd) => {
        if (typeof window.dispatchE2ECommand === "function")
            window.dispatchE2ECommand(cmd);
    };

    ui.connectBtn?.addEventListener("click", async () => {
        await webRtc.connect();
        if (ui.connectBtn) ui.connectBtn.disabled = true;
    });

    ui.disconnectBtn?.addEventListener("click", () => {
        dispatchE2E("stop_screen");
        dispatchE2E("stop_camera");
        dispatchE2E("stop_audio");

        webRtc.close();
        if (showToast) showToast("Connection & Hardware disconnected.", "info");
    });

    // --- SCREEN CONTROLS ---
    ui.startScreen?.addEventListener("click", () => {
        dispatchE2E("start_screen");
        if (ui.startScreen) ui.startScreen.disabled = true;
        if (ui.stopScreen) ui.stopScreen.disabled = false;
    });
    ui.stopScreen?.addEventListener("click", () => {
        dispatchE2E("stop_screen");
        if (ui.startScreen) ui.startScreen.disabled = false;
        if (ui.stopScreen) ui.stopScreen.disabled = true;
    });

    // --- CAMERA CONTROLS ---
    ui.startCamera?.addEventListener("click", () => {
        dispatchE2E("start_camera");
        if (ui.startCamera) ui.startCamera.disabled = true;
        if (ui.stopCamera) ui.stopCamera.disabled = false;
    });
    ui.stopCamera?.addEventListener("click", () => {
        dispatchE2E("stop_camera");
        if (ui.startCamera) ui.startCamera.disabled = false;
        if (ui.stopCamera) ui.stopCamera.disabled = true;
    });

    // --- AUDIO CONTROLS ---
    ui.startAudio?.addEventListener("click", () => {
        dispatchE2E("start_audio");
        if (ui.startAudio) ui.startAudio.disabled = true;
    });

    // 2-WAY AUDIO LOGIC (Admin Mic)
    ui.startMyMic?.addEventListener("click", () => {
        if (webRtc.startMyMic) webRtc.startMyMic();
    });

    ui.stopMyMic?.addEventListener("click", () => {
        if (webRtc.stopMyMic) webRtc.stopMyMic();
    });

    const video = document.getElementById("screenVideo");

    // ###########################################
    // Remote screen controllers (start)
    // ###########################################
    const throttle = (func, limit) => {
        let lastFunc;
        let lastRan;
        return function (...args) {
            if (!lastRan) {
                func.apply(this, args);
                lastRan = Date.now();
            } else {
                clearTimeout(lastFunc);
                lastFunc = setTimeout(function () {
                    if (Date.now() - lastRan >= limit) {
                        func.apply(this, args);
                        lastRan = Date.now();
                    }
                }, limit - (Date.now() - lastRan));
            }
        };
    };

    const emitCursorPosition = throttle((x, y) => {
        socket.emit("setCursorPosition", { x, y, targetNodeId }, (res) => {
            // Silent ACK to avoid console flooding
        });
    }, 15);
    if (ui.screenVideo) {
        ui.screenVideo.style.cursor = "none";



        ui.screenVideo.addEventListener('mousemove', (e) => {
            if (!video || !video.videoWidth || !video.videoHeight) return;

            const rect = video.getBoundingClientRect();
            const scale = Math.min(rect.width / video.videoWidth, rect.height / video.videoHeight);

            const renderedWidth = video.videoWidth * scale;
            const renderedHeight = video.videoHeight * scale;

            const offsetX = (rect.width - renderedWidth) / 2;
            const offsetY = (rect.height - renderedHeight) / 2;

            const x = Math.round((e.clientX - rect.left - offsetX) / scale);
            const y = Math.round((e.clientY - rect.top - offsetY) / scale);

            // Blank space ke bahar ignore karein
            if (
                e.clientX < rect.left + offsetX ||
                e.clientX > rect.left + offsetX + renderedWidth ||
                e.clientY < rect.top + offsetY ||
                e.clientY > rect.top + offsetY + renderedHeight
            ) {
                return;
            }

            // Direct emit karne ki jagah Throttled function call karein
            emitCursorPosition(x, y);
        });

        // 🔥 FIXED: 'clcik' typo fixed to 'click'
        ui.screenVideo.addEventListener("click", (event) => {
            console.log("Left click triggered");
            socket.emit("trigger:mouse:click", { targetNodeId, button: "left" });
        });

        ui.screenVideo.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            console.log("Right click triggered");
            socket.emit("trigger:mouse:click", { targetNodeId, button: "right" });
        });

        ui.screenVideo.addEventListener("dblclick", (e) => {
            console.log("Double click triggered");
            socket.emit("trigger:mouse:click", { targetNodeId, button: "double" });
        });
    }

    // ==========================================
    // SCROLL EVENT LISTENER
    // ==========================================
    if (ui.screenVideo) {
        ui.screenVideo.addEventListener(
            "wheel",
            (event) => {
                // Local browser page ko scroll hone se rokein
                event.preventDefault();

                socket.emit("trigger:mouse:scroll", {
                    targetNodeId,
                    deltaX: event.deltaX,
                    deltaY: event.deltaY,
                });
            },
            { passive: false },
        ); // passive: false zaroori hai preventDefault() ke liye
    }

    // ==========================================
    // KEYBOARD SHORTCUTS & TYPING LISTENER
    // ==========================================

    // Flag check karega ki remote screen pe hover hai ya nahi
    let isMouseOverVideo = false;

    // Fallback to wrapper if it exists, otherwise video tag
    const targetCaptureElement = ui.videoContainer || ui.screenVideo;

    if (targetCaptureElement) {
        targetCaptureElement.addEventListener(
            "mouseenter",
            () => (isMouseOverVideo = true),
        );
        targetCaptureElement.addEventListener(
            "mouseleave",
            () => (isMouseOverVideo = false),
        );
    }

    // Keydown event (Key dabane par)
    window.addEventListener("keydown", (event) => {
        // Agar cursor video par nahi hai aur video fullscreen me nahi hai, toh local events chhod dein
        if (!isMouseOverVideo && !document.fullscreenElement) return;

        // Browser ke default shortcuts (Ctrl+S, Ctrl+P, Alt, etc.) block karein taki remote me jayen
        if (
            event.ctrlKey ||
            event.altKey ||
            event.metaKey ||
            event.key === "Tab" ||
            event.key === "Escape"
        ) {
            event.preventDefault();
        }

        socket.emit("trigger:keyboard:event", {
            targetNodeId,
            action: "down",
            key: event.key,
        });
    });

    // Keyup event (Key chhodne par)
    window.addEventListener("keyup", (event) => {
        if (!isMouseOverVideo && !document.fullscreenElement) return;

        if (
            event.ctrlKey ||
            event.altKey ||
            event.metaKey ||
            event.key === "Tab" ||
            event.key === "Escape"
        ) {
            event.preventDefault();
        }

        socket.emit("trigger:keyboard:event", {
            targetNodeId,
            action: "up",
            key: event.key,
        });
    });
    // ###########################################
    // Remote screen controllers (end)
    // ###########################################

    // 🔥 FULLSCREEN LOGIC FOR SCREEN VIDEO (Now targets container)
    ui.fullscreenScreenBtn?.addEventListener("click", () => {
        // Fallback to video if container is not found, but prefer container for correct scaling
        const targetElement = ui.videoContainer || ui.screenVideo;

        if (!targetElement) return;

        if (!document.fullscreenElement) {
            if (targetElement.requestFullscreen) {
                targetElement.requestFullscreen();
            } else if (targetElement.webkitRequestFullscreen) {
                /* Safari */
                targetElement.webkitRequestFullscreen();
            } else if (targetElement.msRequestFullscreen) {
                /* IE11 */
                targetElement.msRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                /* Safari */
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) {
                /* IE11 */
                document.msExitFullscreen();
            }
        }
    });

    // FULLSCREEN LOGIC FOR CAMERA VIDEO
    ui.fullscreenCameraBtn?.addEventListener("click", () => {
        if (!ui.cameraVideo) return;

        if (!document.fullscreenElement) {
            if (ui.cameraVideo.requestFullscreen) {
                ui.cameraVideo.requestFullscreen();
            } else if (ui.cameraVideo.webkitRequestFullscreen) {
                /* Safari */
                ui.cameraVideo.webkitRequestFullscreen();
            } else if (ui.cameraVideo.msRequestFullscreen) {
                /* IE11 */
                ui.cameraVideo.msRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                /* Safari */
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) {
                /* IE11 */
                document.msExitFullscreen();
            }
        }
    });
};
