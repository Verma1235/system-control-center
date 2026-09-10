export class WebRTCManager {
    constructor(socketManager, targetNodeId, showToast, onStateChange) {
        this.socket = socketManager.get();
        this.targetNodeId = targetNodeId;
        this.showToast = showToast || console.log;
        this.onStateChange = onStateChange;

        this.pc = null;
        this.screenVideo = document.getElementById("screenVideo");
        this.cameraVideo = document.getElementById("cameraVideo");
        this.remoteAudio = document.getElementById("remoteAudio");

        // Naya variable local mic ke liye
        this.localAudioStream = null;

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
        this.close();
        this.pc = new RTCPeerConnection({
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
        });

        // 4 STRICT SLOTS LOCK KARNA ZAROORI HAI:
        this.pc.addTransceiver("video", { direction: "recvonly" }); // Index 0: Node ki Screen
        this.pc.addTransceiver("video", { direction: "recvonly" }); // Index 1: Node ka Camera
        this.pc.addTransceiver("audio", { direction: "recvonly" }); // Index 2: Node ka Mic

        // 🔥 NAYA SLOT (Index 3): Dashboard ka Mic (Send Only to Node)
        this.pc.addTransceiver("audio", { direction: "sendonly" });

        this.pc.ontrack = (event) => {
            const stream = event.streams[0] || new MediaStream([event.track]);
            const transceivers = this.pc.getTransceivers();

            if (event.transceiver === transceivers[0]) {
                this.screenVideo.srcObject = stream;
            } else if (event.transceiver === transceivers[1]) {
                this.cameraVideo.srcObject = stream;
            } else if (event.transceiver === transceivers[2] || event.track.kind === "audio") {
                if (this.remoteAudio) this.remoteAudio.srcObject = stream;
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
            if (["disconnected", "failed", "closed"].includes(this.pc?.connectionState)) this.close();
        };

        try {
            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);
            this.socket.emit("webrtc:signal", {
                targetNodeId: this.targetNodeId,
                signalData: { type: "offer", sdp: offer }
            });
        } catch (error) {
            this.showToast("Failed to initialize WebRTC", "error");
        }
    }

    // 🔥 DASHBOARD KA MIC START KARNE KA FUNCTION
    async startMyMic() {
        try {
            this.localAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            if (this.pc && this.pc.getTransceivers()[3]) {
                const track = this.localAudioStream.getAudioTracks()[0];
                this.pc.getTransceivers()[3].sender.replaceTrack(track);
                this.showToast("Your mic is LIVE. Node can hear you.", "success");
            }
        } catch (e) {
            this.showToast("Mic permission denied on Dashboard", "error");
        }
    }

    // 🔥 DASHBOARD KA MIC STOP KARNE KA FUNCTION
    stopMyMic() {
        if (this.localAudioStream) {
            this.localAudioStream.getTracks().forEach(t => t.stop());
            this.localAudioStream = null;
            if (this.pc && this.pc.getTransceivers()[3]) {
                this.pc.getTransceivers()[3].sender.replaceTrack(null);
            }
            this.showToast("Your mic is muted.", "info");
        }
    }

    close() {
        if (this.pc) { this.pc.close(); this.pc = null; }
        this.stopMyMic(); // Apne mic ko bhi band karein disconnect hone par
        [this.screenVideo, this.cameraVideo].forEach(video => {
            if (video && video.srcObject) { video.srcObject.getTracks().forEach(t => t.stop()); video.srcObject = null; }
        });
        if (this.remoteAudio && this.remoteAudio.srcObject) {
            this.remoteAudio.srcObject.getTracks().forEach(t => t.stop()); this.remoteAudio.srcObject = null;
        }
        if (this.onStateChange) this.onStateChange(false);
    }
}