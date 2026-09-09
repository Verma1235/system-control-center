import { verifyToken } from '../auth/jwt.js';
import { handleDashboardConnection } from './dashboardHandler.js';
import { handleNodeConnection } from './nodeHandler.js';
import { db } from '../database/db.js';
import { logger } from '../utils/logger.js';

const PROVISIONING_SECRET = process.env.PROVISIONING_SECRET || 'setup_secret_key_123';

// Maps Node UUIDs to their current ephemeral Socket.IO ID
const activeNodesMap = new Map();
const activeDashboardsMap = new Map();

export function getActiveNodesMap() {
    return activeNodesMap;
}

export function initSocketManager(io) {

    // Authentication Middleware
    io.use(async (socket, next) => {
        try {
            const clientType = socket.handshake.auth?.clientType;

            if (clientType === 'dashboard') {
                const token = socket.handshake.auth?.token;
                if (!token) return next(new Error('Authentication error: Missing token'));

                const decoded = verifyToken(token);
                if (!decoded) return next(new Error('Authentication error: Invalid or expired token'));

                // Attach user profile to socket
                socket.user = decoded;
                return next();
            }

            if (clientType === 'electron') {
                const nodeId = socket.handshake.auth?.nodeId;
                const provisioningSecret = socket.handshake.auth?.provisioningSecret;

                if (!nodeId) return next(new Error('Node Auth error: Missing nodeId'));

                const [rows] = await db.execute('SELECT * FROM nodes WHERE id = ?', [nodeId]);
                const node = rows[0];

                if (!node) {
                    // Auto-Registration Flow for new devices
                    if (provisioningSecret === PROVISIONING_SECRET) {
                        const hostname = socket.handshake.auth?.hostname || 'Unknown Host';
                        const platform = socket.handshake.auth?.platform || 'Unknown OS';

                        // MySQL JSON types accept valid stringified JSON 
                        const capabilities = JSON.stringify({});

                        await db.execute(`
                            INSERT INTO nodes (id, hostname, platform, is_approved, last_ip, last_seen, capabilities, created_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        `, [nodeId, hostname, platform, 0, socket.handshake.address, Date.now(), capabilities, Date.now()]);

                        logger.audit(`New Node auto-registered. Pending approval.`, { nodeId, hostname });
                        socket.nodeId = nodeId;
                        return next();
                    } else {
                        return next(new Error('Node Auth error: Node not found and provisioning secret invalid'));
                    }
                }

                // Node exists. Check approval state.
                if (node.is_approved === 0) {
                    logger.warn(`Rejected connection from unapproved node: ${nodeId}`);
                    return next(new Error('Node Auth error: Node is pending administrator approval.'));
                }

                socket.nodeId = nodeId;
                return next();
            }

            return next(new Error('Authentication error: Invalid clientType'));

        } catch (error) {
            logger.error("Socket authentication error", { error: error.message });
            return next(new Error('Internal server error during socket authentication'));
        }
    });

    // Connection Handler
    io.on('connection', (socket) => {
        const clientType = socket.handshake.auth?.clientType;

        if (clientType === 'dashboard') {
            activeDashboardsMap.set(socket.id, socket.user.sub);
            handleDashboardConnection(io, socket, activeNodesMap);

            socket.on('disconnect', () => {
                activeDashboardsMap.delete(socket.id);
            });
        } else if (clientType === 'electron') {
            const nodeId = socket.nodeId;

            // Clean up stale connections for this node if they exist
            for (let [existingSocketId, existingNodeId] of activeNodesMap.entries()) {
                if (existingNodeId === nodeId && existingSocketId !== socket.id) {
                    const oldSocket = io.sockets.sockets.get(existingSocketId);
                    if (oldSocket) oldSocket.disconnect(true);
                    activeNodesMap.delete(existingSocketId);
                }
            }

            activeNodesMap.set(nodeId, socket.id);

            // handleNodeConnection is now async, so we catch potential init errors
            handleNodeConnection(io, socket, activeDashboardsMap).catch(err => {
                logger.error("Error initializing node connection", { error: err.message });
            });

            socket.on('disconnect', () => {
                if (activeNodesMap.get(nodeId) === socket.id) {
                    activeNodesMap.delete(nodeId);
                }
            });
        }
    });
}