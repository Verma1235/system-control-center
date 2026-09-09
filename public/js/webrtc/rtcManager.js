export class WebRTCManager {
    constructor(socketManager, targetNodeId) {
        this.socketManager = socketManager;
        this.targetNodeId = targetNodeId;
        this.pc = null;

        // DOM Elements
        this.screenVideo = document.getElementById('screenVideo');
        this.cameraVideo = document.getElementById('cameraVideo');

        this.setupSignalingListener();
    }

    setupSignalingListener() {
        const socket = this.socketManager.get();

        socket.on('webrtc-signal', async (payload) => {
            const { signalData } = payload;
            if (!this.pc) return;

            try {
                if (signalData.type === 'answer') {
                    await this.pc.setRemoteDescription(new RTCSessionDescription(signalData.answer));
                } else if (signalData.type === 'ice-candidate') {
                    await this.pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
                }
            } catch (error) {
                console.error("Error processing incoming WebRTC signal:", error);
            }
        });
    }

    async createPeerConnection() {
        if (this.pc) {
            this.pc.close();
        }

        this.pc = new RTCPeerConnection({
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
        });

        // Prepare to receive video tracks
        this.pc.addTransceiver('video', { direction: 'recvonly' }); // Transceiver 0 (Screen)
        this.pc.addTransceiver('video', { direction: 'recvonly' }); // Transceiver 1 (Camera)

        // Handle incoming tracks
        this.pc.ontrack = (event) => {
            const stream = event.streams[0];

            // Heuristic: Route stream based on which button was clicked recently or track order.
            // For robustness, WebRTC often fires ontrack for each transceiver.
            // We will assign it to the first available non-playing video element.
            if (!this.screenVideo.srcObject) {
                this.screenVideo.srcObject = stream;
            } else if (!this.cameraVideo.srcObject && stream.id !== this.screenVideo.srcObject.id) {
                this.cameraVideo.srcObject = stream;
            }
        };

        // Send local ICE candidates to the Electron Node
        this.pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.socketManager.get().emit('webrtc-signal', {
                    targetSocketId: this.targetNodeId, // In our architecture, Dashboard sends to Node ID via server routing
                    signalData: { type: 'ice-candidate', candidate: event.candidate }
                });
            }
        };

        // Create the Offer
        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);

        // Send Offer to the Electron Node
        this.socketManager.get().emit('webrtc-signal', {
            targetSocketId: this.targetNodeId,
            signalData: { type: 'offer', offer: offer }
        });
    }

    close() {
        if (this.pc) {
            this.pc.close();
            this.pc = null;
        }
        if (this.screenVideo) this.screenVideo.srcObject = null;
        if (this.cameraVideo) this.cameraVideo.srcObject = null;
    }
}