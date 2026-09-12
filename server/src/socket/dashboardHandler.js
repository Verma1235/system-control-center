import { logger } from '../utils/logger.js';
import { registerSignalingHandlers } from '../webrtc/signalingHandler.js';
import { db } from '../database/db.js';

export function handleDashboardConnection(io, socket, activeNodesMap) {
    // Changed socket.user.username to socket.user.email
    logger.info(`Dashboard Connected: Admin User ${socket.user.email} (Socket: ${socket.id})`);

    socket.join('dashboards');
    registerSignalingHandlers(socket, io);

    socket.on('dispatch-command', async (data) => {
        try {
            const { targetNodeId, encryptedEnvelope, auth = {} } = data;
            const AuthPass = (process.env.DASHBOARD_CONTROLS_AUTH || "").trim();

            if (auth.isAuthRequired) {
                const incomingPass = (auth.authPass || "").trim();
                if (AuthPass !== incomingPass) {
                    return socket.emit("command-error", { targetNodeId, error: 'NODE_UNAUTHORIZED', message: 'Incorrect Password.' });
                }
            }

            const [rows] = await db.execute('SELECT is_approved, is_blocked FROM nodes WHERE id = ?', [targetNodeId]);
            const node = rows[0];

            if (!node || node.is_approved === 0 || node.is_blocked === 1) {
                return socket.emit('command-error', { targetNodeId, error: 'NODE_UNAUTHORIZED', message: 'Target node is not approved or blocked.' });
            }

            const nodeSocketId = activeNodesMap.get(targetNodeId);

            if (nodeSocketId) {
                io.to(nodeSocketId).emit('command-request', encryptedEnvelope);
                logger.audit(`Command dispatched to node ${targetNodeId}`, { admin: socket.user.email });
            } else {
                socket.emit('command-error', { targetNodeId, error: 'NODE_OFFLINE', message: 'Target node offline.' });
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
    // TOGGLE NODE WINDOW RELAY (Dashboard -> Node)
    // ==============================================
    socket.on('toggle-node-window', async (data) => {
        try {
            const { targetNodeId, show } = data;

            if (!targetNodeId) return;

            // Find the target node's socket ID
            const nodeSocketId = activeNodesMap.get(targetNodeId);

            if (nodeSocketId) {
                // Get the actual socket instance directly instead of using io.to()
                const nodeSocket = io.sockets.sockets.get(nodeSocketId);

                if (nodeSocket) {
                    // Now you can safely use a callback!
                    nodeSocket.emit('toggle-window', { show: show }, (res) => {
                        console.log(res);
                        // Pass the response back to the dashboard
                        socket.emit("logs", { data: res, targetNodeId });
                    });

                    logger.info(`Window toggle (show: ${show}) sent to node ${targetNodeId}`, { admin: socket.user.email });
                } else {
                    // Socket ID exists in map, but instance dropped
                    socket.emit('command-error', {
                        targetNodeId,
                        error: 'NODE_OFFLINE',
                        message: 'Target node socket instance dropped.'
                    });
                }
            } else {
                socket.emit('command-error', {
                    targetNodeId,
                    error: 'NODE_OFFLINE',
                    message: 'Target node is currently offline. Cannot toggle window.'
                });
            }
        } catch (error) {
            logger.error("Toggle window relay error:", { error: error.message });
        }
    });

    // ==============================================
    // WEBRTC SIGNALING RELAY (Dashboard -> Node)
    // ==============================================
    socket.on("webrtc:signal", (payload, callback) => {
        try {
            const { targetNodeId, signalData } = payload;
            const targetSocketId = activeNodesMap.get(targetNodeId);

            if (!targetSocketId) {
                if (typeof callback === "function") {
                    callback({ success: false, message: "Target node is offline." });
                }
                return socket.emit("command-error", {
                    targetNodeId,
                    error: "NODE_OFFLINE",
                    message: "Target node is offline."
                });
            }

            io.to(targetSocketId).emit("webrtc:signal", {
                fromSocketId: socket.id,
                signalData
            });

            if (typeof callback === "function") {
                callback({ success: true, message: "Signal forwarded to node." });
            }
        } catch (error) {
            logger.error("Dashboard signaling error:", { error: error.message });
        }
    });



    socket.on('disconnect', () => {
        logger.info(`Dashboard Disconnected: ${socket.user.username}`);
    });
}