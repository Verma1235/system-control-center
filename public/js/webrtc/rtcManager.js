export class WebRTCManager {
    constructor(socketManager, targetNodeId, showToast, onStateChange) {
        this.socket = socketManager.get();
        this.targetNodeId = targetNodeId;
        this.showToast = showToast || console.log;
        this.onStateChange = onStateChange;

        this.pc = null;
        this.screenVideo = document.getElementById("screenVideo");
        this.cameraVideo = document.getElementById("cameraVideo");
        // 🔥 NAYA: Aapka UI wala Audio Player
        this.remoteAudio = document.getElementById("remoteAudio");

        this.setupSignaling();
    }

    setupSignaling() {
        this.socket.off("webrtc:signal");

        this.socket.on("webrtc:signal", async ({ signalData }) => {
            if (!this.pc) return;

            try {
                if (signalData.type === "answer") {
                    await this.pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
                    this.showToast("P2P Handshake established!", "success");
                    if (this.onStateChange) this.onStateChange(true);
                }
                else if (signalData.type === "ice-candidate" && signalData.candidate) {
                    await this.pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
                }
            } catch (error) {
                console.error("WebRTC signaling error:", error);
            }
        });
    }

    async connect() {
        this.close(); // Pura clean karo pehle

        this.pc = new RTCPeerConnection({
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" },
                { urls: "stun:stun1.l.google.com:19302" }
            ]
        });

        // LOCKING SLOTS:
        this.pc.addTransceiver("video", { direction: "recvonly" }); // Index 0: SCREEN
        this.pc.addTransceiver("video", { direction: "recvonly" }); // Index 1: CAMERA
        this.pc.addTransceiver("audio", { direction: "recvonly" }); // Index 2: AUDIO

        this.pc.ontrack = (event) => {
            const stream = event.streams[0] || new MediaStream([event.track]);
            const transceivers = this.pc.getTransceivers();

            if (event.transceiver === transceivers[0]) {
                this.screenVideo.srcObject = stream;
            }
            else if (event.transceiver === transceivers[1]) {
                this.cameraVideo.srcObject = stream;
            }
            // 🔥 NAYA: Multiple audio hatakar sirf single UI player pe set kiya
            else if (event.transceiver === transceivers[2] || event.track.kind === "audio") {
                if (this.remoteAudio) {
                    this.remoteAudio.srcObject = stream;
                    this.remoteAudio.play().catch(e => {
                        console.warn("Autoplay blocked by browser for audio. User must click play.", e);
                        this.showToast("Click PLAY on the audio player to hear sound", "info");
                    });
                }
            }
        };

        this.pc.onicecandidate = (event) => {
            if (!event.candidate) return;
            this.socket.emit("webrtc:signal", {
                targetNodeId: this.targetNodeId,
                signalData: { type: "ice-candidate", candidate: event.candidate }
            });
        };

        this.pc.onconnectionstatechange = () => {
            if (["disconnected", "failed", "closed"].includes(this.pc?.connectionState)) {
                this.close();
            }
        };

        try {
            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);

            this.socket.emit("webrtc:signal", {
                targetNodeId: this.targetNodeId,
                signalData: { type: "offer", sdp: offer }
            }, (res) => {
                if (res && !res.success) this.showToast(res.message, "error");
            });
        } catch (error) {
            this.showToast("Failed to initialize WebRTC", "error");
            if (this.onStateChange) this.onStateChange(false);
        }
    }

    close() {
        if (this.pc) {
            this.pc.close();
            this.pc = null;
        }

        // Clean UI Video
        [this.screenVideo, this.cameraVideo].forEach(video => {
            if (video && video.srcObject) {
                video.srcObject.getTracks().forEach(track => track.stop());
                video.srcObject = null;
            }
        });

        // Clean UI Audio (Single Player)
        if (this.remoteAudio && this.remoteAudio.srcObject) {
            this.remoteAudio.srcObject.getTracks().forEach(track => track.stop());
            this.remoteAudio.srcObject = null;
        }

        if (this.onStateChange) this.onStateChange(false);
    }
}