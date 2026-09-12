import { verifyToken } from '../auth/jwt.js';
import { handleDashboardConnection } from './dashboardHandler.js';
import { handleNodeConnection } from './nodeHandler.js';
import { db } from '../database/db.js';
import { logger } from '../utils/logger.js';

const PROVISIONING_SECRET = process.env.PROVISIONING_SECRET || 'setup_secret_key_123';

const activeNodesMap = new Map();
const activeDashboardsMap = new Map();

export function getActiveNodesMap() {
    return activeNodesMap;
}

export function initSocketManager(io) {
    io.use(async (socket, next) => {
        try {
            const clientType = socket.handshake.auth?.clientType;

            if (clientType === 'dashboard') {
                const token = socket.handshake.auth?.token;
                if (!token) return next(new Error('Authentication error: Missing token'));

                const decoded = verifyToken(token);
                if (!decoded) return next(new Error('Authentication error: Invalid or expired token'));

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
                    if (provisioningSecret === PROVISIONING_SECRET) {
                        const hostname = socket.handshake.auth?.hostname || 'Unknown Host';
                        const platform = socket.handshake.auth?.platform || 'Unknown OS';

                        // REMOVED CAPABILITIES. ADDED NEW FLAGS.
                        await db.execute(`
                            INSERT INTO nodes (id, hostname, platform, is_registered, is_approved, is_blocked, last_ip, last_seen, created_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `, [nodeId, hostname, platform, 0, 0, 0, socket.handshake.address, Date.now(), Date.now()]);

                        logger.audit(`New Node auto-registered. Pending approval.`, { nodeId, hostname });
                        socket.nodeId = nodeId;
                        return next();
                    } else {
                        return next(new Error('Node Auth error: Node not found and provisioning secret invalid'));
                    }
                }

                if (node.is_approved === 0) {
                    logger.warn(`Rejected connection from unapproved node: ${nodeId}`);
                    return next(new Error('Node Auth error: Node is pending administrator approval.'));
                }
                if (node.is_blocked === 1) {
                    return next(new Error('Node Auth error: Node is blocked by administrator.'));
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

            for (let [existingSocketId, existingNodeId] of activeNodesMap.entries()) {
                if (existingNodeId === nodeId && existingSocketId !== socket.id) {
                    const oldSocket = io.sockets.sockets.get(existingSocketId);
                    if (oldSocket) oldSocket.disconnect(true);
                    activeNodesMap.delete(existingSocketId);
                }
            }

            activeNodesMap.set(nodeId, socket.id);

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