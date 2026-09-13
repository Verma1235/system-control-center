import { db } from '../database/db.js';
import { logger } from '../utils/logger.js';
import { registerSignalingHandlers } from '../webrtc/signalingHandler.js';
import crypto from 'crypto';
import { hashPassword } from '../auth/jwt.js';
// (Keep your existing imports for db and logger)
const adminAuth = process.env.ADMIN_AUTH;
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




        // #######################################################
        // Registraion and token verification
        // ####################################################


        socket.on("verify:authToken", (data, callback) => {
            console.log("DATA: ", data);

            if (data?.token === adminAuth) {
                callback({ success: true, message: "Token verified successfully." });
            } else {
                callback({ success: false, message: "Token is not valid, Authentication failed." });
            }
        });

        // #######################################################
        // Registration via Socket
        // #######################################################

        socket.on("new-account-registraion", async (payload, callback) => {
            try {
                const { nodeId, formData } = payload;

                if (!nodeId || !formData) {
                    return callback({ success: false, message: "Invalid payload format." });
                }

                const { fullName, email, role, passwordLogin, passwordManage, adminAuth } = formData;

                // 1. Check if email already exists
                const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
                if (existing.length > 0) {
                    return callback({ success: false, message: "Email is already registered." });
                }

                // 1. Check if node already registered with another email
                // const [existing2] = await db.execute("SELECT `users`.`email` AS `user_email` FROM `nodes`  JOIN `audit_logs` ON `audit_logs`.`node_id` = `nodes`.`id` JOIN `users` ON `users`.`id` = `audit_logs`.`user_id` WHERE `nodes`.`id` = ? ;", [nodeId]);
                const [existing2] = await db.execute(`SELECT user_email FROM nodes WHERE id = ? `, [nodeId]);
                if (existing2.length > 0 && !(existing2[0].user_email === null || existing2[0].user_email === undefined || existing2[0].user_email === '')) {
                    return callback({ success: false, message: "This system is already registered with another email. " });
                }

                const userId = crypto.randomUUID();

                // 2. Hash all secure fields
                const hashedLogin = await hashPassword(passwordLogin);
                const hashedManage = await hashPassword(passwordManage);
                const hashedAuth = await hashPassword(adminAuth);

                // 3. Insert into modified users table
                await db.execute(`
                    INSERT INTO users 
                    (id, node_id, full_name, email, role, password_login, password_manage, admin_auth, is_blocked, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [userId, nodeId, fullName, email, role, hashedLogin, hashedManage, hashedAuth, 0, Date.now()]);

                // 4. Mark node as registered in the nodes table
                await db.execute('UPDATE nodes SET is_registered = 1 WHERE id = ?', [nodeId]);

                await db.execute(`UPDATE nodes SET user_email = ?  WHERE id = ?  AND (user_email IS NULL OR user_email = '')`, [email, nodeId]);


                // 5. Audit Logging (using socket.handshake.address for IP)
                await db.execute(`
                    INSERT INTO audit_logs (action, node_id, user_id, details, ip_address, timestamp)
                    VALUES (?, ?, ?, ?, ?, ?)
                `, ['USER_REGISTER', nodeId, userId, `New account registered for ${email}`, socket.handshake.address, Date.now()]);

                logger.info(`New user registered via socket: ${email} from node ${nodeId}`);

                // 6. Notify connected dashboards that this node's status (is_registered) has changed
                io.to('dashboards').emit('node-status-changed', {
                    nodeId,
                    isOnline: true,
                    lastSeen: Date.now()
                });

                // 7. Send success callback back to Electron main.js
                return callback({ success: true, message: "Account registered successfully." });

            } catch (error) {
                logger.error("Socket Registration error", { error: error.message });
                return callback({ success: false, message: "Internal server error during registration." });
            }
        });





















    } catch (error) {
        logger.error("Node connection handling error", { error: error.message });
    }
}