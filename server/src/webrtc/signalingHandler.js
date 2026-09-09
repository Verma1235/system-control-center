import { logger } from '../utils/logger.js';

/**
 * Handles WebRTC peer-to-peer signaling between Dashboards and Electron Nodes.
 * The server acts only as a secure relay (signaling server); media flows P2P where possible.
 */
export function registerSignalingHandlers(socket, io) {
    // Relay signaling payloads (Offer, Answer, ICE candidates)
    socket.on('webrtc-signal', (payload) => {
        const { targetSocketId, signalData } = payload;
        
        // Verify target exists and is connected
        const targetSocket = io.sockets.sockets.get(targetSocketId);
        
        if (targetSocket) {
            targetSocket.emit('webrtc-signal', {
                senderSocketId: socket.id,
                signalData
            });
        } else {
            logger.debug(`WebRTC Signal failed: Target socket ${targetSocketId} not found.`);
            // Optionally notify sender that target is unavailable
            socket.emit('webrtc-error', { 
                targetSocketId, 
                error: 'Target device offline or unreachable.' 
            });
        }
    });
}