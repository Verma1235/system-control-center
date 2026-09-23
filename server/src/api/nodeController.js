import { db } from '../database/db.js';
import { logger } from '../utils/logger.js';
import { getActiveNodesMap } from '../socket/socketManager.js';
import crypto from 'crypto';
export const nodeController = {
    getAllNodes: async (req, res) => {
        try {
            const isAdminOrCoAdmin = req?.user?.role === 'admin' || req?.user?.role === 'coadmin';

            let query = `
            SELECT 
                nodes.*, 
                users.id AS user_id, 
                users.full_name AS user_full_name, 
                users.role AS user_role, 
                users.is_blocked AS user_is_blocked, 
                users.created_at AS user_created_at,
                users.password_manage AS user_manage_auth
            FROM \`nodes\` 
            LEFT JOIN \`users\` ON \`nodes\`.\`user_email\` = \`users\`.\`email\`
        `;

            const queryParams = [];

            // If not admin, restrict the results to only the nodes belonging to this specific user
            if (!isAdminOrCoAdmin) {
                query += ` WHERE \`users\`.\`id\` = ? `;
                queryParams.push(req?.user?.id);
            }

            // Apply ordering at the very end
            query += ` ORDER BY \`nodes\`.\`last_seen\` DESC`;

            // Execute dynamic query
            const [nodes] = await db.execute(query, queryParams);
            const activeNodes = getActiveNodesMap();

            // Parse capabilities and booleans once
            const parsedNodes = nodes.map(node => ({
                ...node,
                isOnline: activeNodes.has(node.id),
                is_approved: Boolean(node.is_approved),
                is_registered: Boolean(node.is_registered),
                is_blocked: Boolean(node.is_blocked)
            }));

            return res.json({ success: true, nodes: parsedNodes, userData: req.user });

        } catch (error) {
            logger.error("Error fetching nodes list", { error: error.message });
            return res.status(500).json({ success: false, message: "Could not retrieve devices." });
        }
    },

    getNodeById: async (req, res) => {
        try {
            const { id } = req.params;
            const isAdminOrCoAdmin = req?.user?.role === 'admin' || req?.user?.role === 'coadmin';

            // Base query: Fetch node and join with users table to verify ownership
            let query = `
                SELECT 
                    nodes.*, 
                    users.id AS user_id,
                    users.role AS user_role
                FROM \`nodes\`
                LEFT JOIN \`users\` ON \`nodes\`.\`user_email\` = \`users\`.\`email\`
                WHERE \`nodes\`.\`id\` = ?
            `;

            const queryParams = [id];

            // SECURITY FIX: If normal user, force check that the node belongs to them
            if (!isAdminOrCoAdmin) {
                query += ` AND \`users\`.\`id\` = ?`;
                queryParams.push(req.user.id);
            }

            const [rows] = await db.execute(query, queryParams);
            const node = rows[0];

            // If node doesn't exist, OR if it belongs to someone else (query returns empty)
            if (!node) {
                return res.status(403).json({
                    success: false,
                    error: "ACCESS_DENIED",
                    message: "Access Denied: You do not have permission to manage this system."
                });
            }

            return res.json({
                success: true,
                node: {
                    ...node,
                    is_approved: Boolean(node.is_approved),
                    is_registered: Boolean(node.is_registered),
                    is_blocked: Boolean(node.is_blocked)
                }
            });
        } catch (error) {
            logger.error("Error fetching node by ID", { error: error.message });
            return res.status(500).json({ success: false, message: "Failed to retrieve node." });
        }
    },

    /**
     * Approve or Revoke a node's authorized state
     */
    toggleApproval: async (req, res) => {
        try {
            const { id } = req.params;
            const { approved, password } = req.body;

            let authPass = process.env.APPROVAL_PASSWORD || null;
            if (authPass != password) {
                return res.status(403).json({
                    success: false,
                    error: "AUTH_INVALID",
                    message: "security key is incorrect, permission denied."
                });
            }


            const [rows] = await db.execute('SELECT * FROM nodes WHERE id = ?', [id]);
            const node = rows[0];

            if (!node) {
                return res.status(404).json({
                    success: false,
                    error: "NODE_NOT_FOUND",
                    message: "Node does not exist."
                });

            }

            const approvalState = approved ? 1 : 0;
            await db.execute('UPDATE nodes SET is_approved = ? WHERE id = ?', [approvalState, id]);

            const actionName = approved ? 'APPROVE_NODE' : 'REVOKE_NODE';
            logger.audit(`Node authorization toggled: ${id} -> ${approved}`, { adminId: req.user?.id });

            await db.execute(`
                INSERT INTO audit_logs(action, node_id, user_id, details, ip_address, timestamp)
                VALUES(?, ?, ?, ?, ?, ?)
                    `, [actionName, id, req.user?.id, `Approval changed to ${approved}`, req.ip, Date.now()]);

            return res.json({
                success: true,
                message: `Node ${approved ? 'approved' : 'revoked'} successfully.`
            });
        } catch (error) {
            logger.error("Error toggling node authorization", { error: error.message });
            return res.status(500).json({
                success: false,
                error: "INTERNAL_ERROR",
                message: "Could not alter node authorization state."
            });
        }
    },

    /**
     * Delete a registered node from database
     */
    deleteNode: async (req, res) => {
        try {
            const { id } = req.params;
            await db.execute('DELETE FROM nodes WHERE id = ?', [id]);

            logger.audit(`Node deleted from registry: ${id}`, { adminId: req.user?.id });

            await db.execute(`
                INSERT INTO audit_logs(action, node_id, user_id, details, ip_address, timestamp)
                VALUES(?, ?, ?, ?, ?, ?)
                    `, ['DELETE_NODE', id, req.user?.id, `Node registry deleted`, req.ip, Date.now()]);

            return res.json({
                success: true,
                message: "Node record deleted successfully."
            });
        } catch (error) {
            logger.error("Error deleting node", { error: error.message });
            return res.status(500).json({
                success: false,
                error: "INTERNAL_ERROR",
                message: "Could not delete node record."
            });
        }
    },

    /**
     * Retrieve audit log history
     */
    getAuditLogs: async (req, res) => {
        try {
            const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);

            // For LIMIT, db.query is often safer in mysql2 than db.execute with parameterized numbers
            const [logs] = await db.query('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?', [limit]);

            return res.json({
                success: true,
                logs
            });
        } catch (error) {
            logger.error("Error fetching audit logs", { error: error.message });
            return res.status(500).json({
                success: false,
                error: "INTERNAL_ERROR",
                message: "Could not retrieve audit history."
            });
        }
    },
    // ##########################################
    // feedback/query handeller
    // ##########################################

    sendQuiries: async (req, res) => {

        try {
            const { type, message, timestamp } = req?.body;
            const user_id = req?.user?.id;
            const user_email = req?.user?.email;

            const ticketId = crypto.randomUUID();


            let query = `
              INSERT INTO user_inquiries 
              (ticket_id,user_email,category,message,created_at)
              VALUES (?, ?, ?, ?, ?)
            `;

            await db.execute(query, [ticketId, user_email, type, message, Date.now()]);
            logger.info(`New message sent: ${user_email} from server.}`);
            return res.json({ success: true, message: "Messge/feedback sent successfully !" });
        } catch (error) {

            throw res.json({ success: false, message: `${error?.message}` });

        }

    },
    readAllMessage: async (req, res) => {
        try {
            const client_role = req?.user?.role;

            // FIX 1: Must use && (AND) so only people who are NEITHER get blocked
            if (client_role !== 'admin' && client_role !== 'coadmin') {
                return res.status(403).json({ success: false, message: "You are not allowed!" });
            }

            const query = `
            SELECT 
                id AS msg_id,
                ticket_id AS msg_ticket_id,
                user_email AS msg_user_email,
                category AS msg_category,
                message AS msg_user,
                reply_message AS msg_admin_reply,
                replied_by AS msg_replied_by,
                status AS msg_status,
                created_at AS msg_created_at
            FROM user_inquiries 
            ORDER BY created_at DESC;
        `;

            const [queries] = await db.execute(query);

            return res.status(200).json({
                success: true,
                message: "All messages fetched successfully!",
                data: queries
            });

        } catch (error) {
            console.error("Error fetching messages:", error);

            // FIX 2: Return the response properly, do not use 'throw' here
            return res.status(500).json({
                success: false,
                message: error?.message || "Internal Server Error"
            });
        }
    }
};




// BODY: {
//   type: 'query',
//   message: 'hi ',
//   timestamp: '2026-09-23T16:06:49.216Z'
// }
// USER: {
//   id: '3f5a142a-e3d5-4dee-a50b-d3fe6f0b0382',
//   username: 'Dinesh kumar verma',
//   role: 'user',
//   manageAuth: '$argon2id$v=19$m=65536,p=1,t=3$3z5J/y32Y9YIGzl7McyTPQ$02IPLoI1VAZ09FXufsPLAkA5IS+KFvFPp8LCsJpCyGQ',
//   accountStatus: 0,
//   email: 'vermadinesh9693@gmail.com',
//   iat: 1790179357,
//   exp: 1790222557
// }


