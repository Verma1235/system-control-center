import { db } from '../database/db.js';
import { logger } from '../utils/logger.js';
import { getActiveNodesMap } from '../socket/socketManager.js';

export const nodeController = {
    /**
     * Get all registered nodes with their capabilities and status
     */
    getAllNodes: async (req, res) => {
        try {
            const [nodes] = await db.execute('SELECT * FROM nodes ORDER BY last_seen DESC');
            const activeNodes = getActiveNodesMap();

            const parsedNodes = nodes.map(node => ({
                ...node,
                isOnline: activeNodes.has(node.id),
                is_approved: Boolean(node.is_approved),
                capabilities: node.capabilities && typeof node.capabilities === 'string'
                    ? JSON.parse(node.capabilities)
                    : (node.capabilities || {}) // MySQL JSON type might already return an object
            }));

            return res.json({
                success: true,
                nodes: parsedNodes
            });
        } catch (error) {
            logger.error("Error fetching nodes list", { error: error.message });
            return res.status(500).json({
                success: false,
                error: "INTERNAL_ERROR",
                message: "Could not retrieve devices."
            });
        }
    },

    getNodeById: async (req, res) => {
        try {
            const { id } = req.params;
            const [rows] = await db.execute('SELECT * FROM nodes WHERE id = ?', [id]);
            const node = rows[0];

            if (!node) {
                return res.status(404).json({
                    success: false,
                    error: "NODE_NOT_FOUND",
                    message: "Node does not exist."
                });
            }

            return res.json({
                success: true,
                node: {
                    ...node,
                    is_approved: Boolean(node.is_approved),
                    capabilities: node.capabilities && typeof node.capabilities === 'string'
                        ? JSON.parse(node.capabilities)
                        : (node.capabilities || {})
                }
            });
        } catch (error) {
            logger.error("Error fetching single node", { error: error.message });
            return res.status(500).json({
                success: false,
                error: "INTERNAL_ERROR",
                message: "Failed to retrieve node."
            });
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
                INSERT INTO audit_logs (action, node_id, user_id, details, ip_address, timestamp)
                VALUES (?, ?, ?, ?, ?, ?)
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
                INSERT INTO audit_logs (action, node_id, user_id, details, ip_address, timestamp)
                VALUES (?, ?, ?, ?, ?, ?)
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