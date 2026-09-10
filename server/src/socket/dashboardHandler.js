import { logger } from '../utils/logger.js';
import { registerSignalingHandlers } from '../webrtc/signalingHandler.js';
import { db } from '../database/db.js';

export function handleDashboardConnection(io, socket, activeNodesMap) {
    logger.info(`Dashboard Connected: Admin User ${socket.user.username} (Socket: ${socket.id})`);

    // Join secure dashboard room
    socket.join('dashboards');

    // 1. WebRTC Signaling
    registerSignalingHandlers(socket, io);

    // 2. Command Dispatch (Dashboard -> Node)
    socket.on('dispatch-command', async (data) => {
        try {
            const { targetNodeId, encryptedEnvelope, auth = {} } = data;

            console.log("AUTH Payload Received:", auth);

            // Use .trim() to prevent invisible space mismatches from .env files
            const AuthPass = (process.env.DASHBOARD_CONTROLS_AUTH || "").trim();

            if (auth.isAuthRequired) {
                const incomingPass = (auth.authPass || "").trim();

                if (AuthPass !== incomingPass) {
                    console.log(`Auth failed for node ${targetNodeId}. Check password.`); // Log BEFORE return

                    return socket.emit("command-error", {
                        targetNodeId,
                        error: 'NODE_UNAUTHORIZED',
                        message: 'Incorrect Authentication Password.'
                    });
                }
            }

            console.log("Auth passed or not required. Proceeding...");

            // Verify the node is approved before allowing command dispatch
            const [rows] = await db.execute('SELECT is_approved FROM nodes WHERE id = ?', [targetNodeId]);
            const node = rows[0];

            if (!node || node.is_approved === 0) {
                return socket.emit('command-error', {
                    targetNodeId,
                    error: 'NODE_UNAUTHORIZED',
                    message: 'Target node is not approved or does not exist.'
                });
            }

            // Find the active socket ID for this node
            const nodeSocketId = activeNodesMap.get(targetNodeId);

            if (nodeSocketId) {
                // Relay the encrypted envelope to the target node
                io.to(nodeSocketId).emit('command-request', encryptedEnvelope);
                logger.audit(`Command dispatched to node ${targetNodeId}`, { admin: socket.user.username });
            } else {
                socket.emit('command-error', {
                    targetNodeId,
                    error: 'NODE_OFFLINE',
                    message: 'Target node is currently offline.'
                });
            }
        } catch (error) {
            logger.error("Command dispatch error", { error: error.message });
        }
    });

    // 3. Cancel Command Relay (Dashboard -> Node)
    socket.on('cancel-command', (data) => {
        try {
            const { targetNodeId } = data;

            if (!targetNodeId) return;

            const nodeSocketId = activeNodesMap.get(targetNodeId);

            if (nodeSocketId) {
                // Emit an abort signal directly to the Electron node
                io.to(nodeSocketId).emit('abort-active-task', {
                    reason: 'Admin cancelled the action via dashboard'
                });

                logger.audit(`Cancellation signal dispatched to node ${targetNodeId}`, { admin: socket.user.username });
            } else {
                logger.warn(`Could not send cancel signal: Node ${targetNodeId} is offline.`);
            }
        } catch (error) {
            logger.error("Cancel command relay error", { error: error.message });
        }
    });


    // ==============================================
    // WEBRTC SIGNALING RELAY (Dashboard -> Node)
    // ==============================================
    socket.on("webrtc:signal", (payload, callback) => {
        try {
            const { targetNodeId, signalData } = payload;

            // Resolve active socket ID from nodeId
            const targetSocketId = activeNodesMap.get(targetNodeId);

            if (!targetSocketId) {
                if (typeof callback === "function") {
                    callback({ success: false, message: "Target node is offline." });
                }
                return socket.emit("command-error", {
                    targetNodeId,
                    error: "NODE_OFFLINE",
                    message: "Target node is offline. Cannot initialize WebRTC."
                });
            }

            // Forward signal with sender's dashboard socket ID
            io.to(targetSocketId).emit("webrtc:signal", {
                fromSocketId: socket.id,
                signalData
            });

            if (typeof callback === "function") {
                callback({ success: true, message: "Signal forwarded to node." });
            }
        } catch (error) {
            logger.error("WebRTC Dashboard relay error:", { error: error.message });
        }
    });




    socket.on('disconnect', () => {
        logger.info(`Dashboard Disconnected: ${socket.user.username}`);
    });
}