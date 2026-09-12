import { db } from '../database/db.js';
import { logger } from '../utils/logger.js';
import { getActiveNodesMap } from '../socket/socketManager.js';

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
                users.created_at AS user_created_at
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
            const [rows] = await db.execute('SELECT * FROM nodes WHERE id = ?', [id]);
            const node = rows[0];

            if (!node) {
                return res.status(404).json({ success: false, message: "Node does not exist." });
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
            logger.audit(`Node authorization toggled: ${id} -> ${approved}`, { adminId: req.user.sub });

            await db.execute(`
                INSERT INTO audit_logs(action, node_id, user_id, details, ip_address, timestamp)
                VALUES(?, ?, ?, ?, ?, ?)
                    `, [actionName, id, req.user.sub, `Approval changed to ${approved}`, req.ip, Date.now()]);

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

            logger.audit(`Node deleted from registry: ${id}`, { adminId: req.user.sub });

            await db.execute(`
                INSERT INTO audit_logs(action, node_id, user_id, details, ip_address, timestamp)
                VALUES(?, ?, ?, ?, ?, ?)
                    `, ['DELETE_NODE', id, req.user.sub, `Node registry deleted`, req.ip, Date.now()]);

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
    }
};