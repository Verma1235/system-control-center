import { db } from '../database/db.js';
import { logger } from '../utils/logger.js';
import { registerSignalingHandlers } from '../webrtc/signalingHandler.js';

export async function handleNodeConnection(io, socket, activeDashboards) {
    try {
        const nodeId = socket.nodeId;

        const [rows] = await db.execute('SELECT * FROM nodes WHERE id = ?', [nodeId]);
        const nodeData = rows[0];

        if (!nodeData) {
            logger.warn(`Orphaned node connection attempted: ${nodeId}`);
            return socket.disconnect(true);
        }

        logger.info(`Node Connected: ${nodeData.hostname} (ID: ${nodeId})`);

        // Join the secure nodes room
        socket.join('electron-nodes');

        // Update DB status
        await db.execute('UPDATE nodes SET last_seen = ?, last_ip = ? WHERE id = ?', [Date.now(), socket.handshake.address, nodeId]);

        // Notify connected dashboards that a node came online
        io.to('dashboards').emit('node-status-changed', {
            nodeId,
            isOnline: true,
            lastSeen: Date.now()
        });

        // 1. WebRTC Signaling
        registerSignalingHandlers(socket, io);

        // 2. Encrypted Command Responses from Node -> Dashboard
        socket.on('command-response', (encryptedEnvelope) => {
            io.to('dashboards').emit('command-response-relay', {
                nodeId,
                nodeSocketId: socket.id,
                envelope: encryptedEnvelope
            });
        });

        // 3. Telemetry / Health Updates (Unencrypted, non-sensitive metadata)
        socket.on('node-telemetry', (telemetryData) => {
            io.to('dashboards').emit('node-telemetry-update', {
                nodeId,
                telemetry: telemetryData
            });
        });


        // ==============================================
        // WEBRTC SIGNALING RELAY (Node -> Dashboard)
        // ==============================================
        // nodeHandler.js ke andar:
        socket.on("webrtc:signal", (payload) => {
            try {
                const { targetSocketId, signalData } = payload;
                if (targetSocketId) {
                    io.to(targetSocketId).emit("webrtc:signal", {
                        fromNodeId: socket.nodeId,
                        signalData
                    });
                }
            } catch (error) {
                logger.error("Node signaling error:", { error: error.message });
            }
        });


        // Disconnect Handler
        socket.on('disconnect', async (reason) => {
            logger.info(`Node Disconnected: ${nodeData.hostname} (ID: ${nodeId}) - Reason: ${reason}`);

            try {
                await db.execute('UPDATE nodes SET last_seen = ? WHERE id = ?', [Date.now(), nodeId]);
            } catch (err) {
                logger.error("Failed to update node last_seen on disconnect", { error: err.message });
            }

            io.to('dashboards').emit('node-status-changed', {
                nodeId,
                isOnline: false,
                lastSeen: Date.now()
            });
        });
    } catch (error) {
        logger.error("Node connection handling error", { error: error.message });
    }
}