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
        this.localAudioStream = null;

        this.setupSignaling();
    }

    setupSignaling() {
        this.socket.off("webrtc:signal");
        // setupSignaling() ke andar:
        this.socket.on("webrtc:signal", async ({ signalData }) => {
            if (!this.pc) return;

            try {
                if (signalData.type === "answer") {
                    await this.pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
                    this.showToast("P2P Handshake established!", "success");
                    if (this.onStateChange) this.onStateChange(true);
                }
                // 🔥 FIX: Candidate ka null check aur valid candidate string check
                else if (signalData.type === "ice-candidate") {
                    const cand = signalData.candidate;

                    // Sirf tab add karein jab candidate exist karta ho aur usme valid candidate string ho
                    if (cand && cand.candidate && (cand.sdpMid !== null || cand.sdpMLineIndex !== null)) {
                        await this.pc.addIceCandidate(new RTCIceCandidate(cand));
                    }
                }
            } catch (error) {
                console.error("WebRTC Signaling Error:", error);
            }
        });
    }

    async getIceServers() {
        try {
            // 🔥 Relative path use karein taaki ye hamesha sahi domain hit kare
            const res = await fetch('/api/webrtc/ice-servers');
            const data = await res.json();
            return data.iceServers || [{ urls: "stun:stun.l.google.com:19302" }];
        } catch {
            return [{ urls: "stun:stun.l.google.com:19302" }];
        }
    }
    async connect() {
        this.close();

        const iceServers = await this.getIceServers();
        this.pc = new RTCPeerConnection({
            iceServers,
            iceCandidatePoolSize: 10
        });

        // 4 Fixed slots setup
        this.pc.addTransceiver("video", { direction: "recvonly" }); // 0: Screen
        this.pc.addTransceiver("video", { direction: "recvonly" }); // 1: Camera
        this.pc.addTransceiver("audio", { direction: "recvonly" }); // 2: Mic
        this.pc.addTransceiver("audio", { direction: "sendonly" }); // 3: Talkback

        // Track receiver
        this.pc.ontrack = (event) => {
            console.log("Track received:", event.track.kind, "MID:", event.transceiver.mid);
            const stream = event.streams[0] || new MediaStream([event.track]);
            const transceivers = this.pc.getTransceivers();

            const screenLoader = document.getElementById("screenLoader");
            const cameraLoader = document.getElementById("cameraLoader");

            if (event.transceiver === transceivers[0]) {
                this.screenVideo.srcObject = stream;

                // Jab frame actual me flow hona shuru ho
                event.track.onunmute = () => {
                    console.log("🎬 Screen video frames rendering...");
                    if (screenLoader) screenLoader.classList.add("hidden");
                    this.screenVideo.play().catch(e => console.warn("Screen autoplay:", e));
                };

                this.screenVideo.play().catch(e => console.warn("Screen initial play:", e));

            } else if (event.transceiver === transceivers[1]) {
                this.cameraVideo.srcObject = stream;

                event.track.onunmute = () => {
                    console.log("📷 Camera video frames rendering...");
                    if (cameraLoader) cameraLoader.classList.add("hidden");
                    this.cameraVideo.play().catch(e => console.warn("Camera autoplay:", e));
                };

                this.cameraVideo.play().catch(e => console.warn("Camera initial play:", e));

            } else if (event.transceiver === transceivers[2] || event.track.kind === "audio") {
                if (this.remoteAudio) {
                    this.remoteAudio.srcObject = stream;
                    this.remoteAudio.play().catch(e => console.warn("Audio play:", e));
                }
            }
        };

        this.pc.onicecandidate = (event) => {
            if (!event.candidate || !event.candidate.candidate) return;
            this.socket.emit("webrtc:signal", {
                targetNodeId: this.targetNodeId,
                signalData: {
                    type: "ice-candidate",
                    candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate
                }
            });
        };

        this.pc.onconnectionstatechange = () => {
            console.log("Connection State:", this.pc.connectionState);
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
            console.error("Offer error:", error);
            this.showToast("Failed to initialize WebRTC", "error");
            if (this.onStateChange) this.onStateChange(false);
        }
    }

    async startMyMic() {
        try {
            this.localAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            if (this.pc && this.pc.getTransceivers()[3]) {
                const track = this.localAudioStream.getAudioTracks()[0];
                this.pc.getTransceivers()[3].sender.replaceTrack(track);
                this.showToast("Microphone feed live to remote node", "success");
            }
        } catch {
            this.showToast("Mic permission denied", "error");
        }
    }

    stopMyMic() {
        if (this.localAudioStream) {
            this.localAudioStream.getTracks().forEach(t => t.stop());
            this.localAudioStream = null;
            if (this.pc && this.pc.getTransceivers()[3]) {
                this.pc.getTransceivers()[3].sender.replaceTrack(null);
            }
            this.showToast("Microphone muted", "info");
        }
    }

    close() {
        if (this.pc) {
            this.pc.close();
            this.pc = null;
        }

        this.stopMyMic();

        // Video tracks stop aur clear karein
        [this.screenVideo, this.cameraVideo].forEach(el => {
            if (el && el.srcObject) {
                el.srcObject.getTracks().forEach(t => t.stop());
                el.srcObject = null;
            }
        });

        if (this.remoteAudio && this.remoteAudio.srcObject) {
            this.remoteAudio.srcObject.getTracks().forEach(t => t.stop());
            this.remoteAudio.srcObject = null;
        }

        // 🔥 YAHAN LIKHNA HAI: Inactive wale loader wapas show karne ke liye
        const screenLoader = document.getElementById("screenLoader");
        const cameraLoader = document.getElementById("cameraLoader");
        if (screenLoader) screenLoader.classList.remove("hidden");
        if (cameraLoader) cameraLoader.classList.remove("hidden");

        if (this.onStateChange) this.onStateChange(false);
    }
}