import { db } from '../database/db.js';
import { verifyPassword, signToken, hashPassword } from '../auth/jwt.js';
import { logger } from '../utils/logger.js';

export const authController = {
    /**
     * Admin login handler
     */
    login: async (req, res) => {
        try {
            const { username, password } = req.body;

            if (!username || !password) {
                return res.status(400).json({
                    success: false,
                    error: "INVALID_REQUEST",
                    message: "Username and password are required."
                });
            }

            const [rows] = await db.execute('SELECT * FROM users WHERE username = ?', [username]);
            const user = rows[0];

            if (!user) {
                return res.status(401).json({
                    success: false,
                    error: "INVALID_CREDENTIALS",
                    message: "Invalid username or password."
                });
            }

            const isMatch = await verifyPassword(user.password_hash, password);

            if (!isMatch) {
                logger.warn(`Failed login attempt for username: ${username}`, { ip: req.ip });
                return res.status(401).json({
                    success: false,
                    error: "INVALID_CREDENTIALS",
                    message: "Invalid username or password."
                });
            }

            const token = signToken(user);
            logger.info(`Admin logged in successfully: ${username}`, { ip: req.ip });

            // Audit log entry
            await db.execute(`
                INSERT INTO audit_logs (action, user_id, details, ip_address, timestamp)
                VALUES (?, ?, ?, ?, ?)
            `, ['ADMIN_LOGIN', user.id, `User logged in`, req.ip, Date.now()]);

            return res.json({
                success: true,
                token,
                user: {
                    id: user.id,
                    username: user.username
                }
            });
        } catch (error) {
            logger.error("Login controller error", { error: error.message });
            return res.status(500).json({
                success: false,
                error: "INTERNAL_ERROR",
                message: "Internal server error during authentication."
            });
        }
    },

    /**
     * Session validation endpoint
     */
    verifySession: (req, res) => {
        return res.json({
            success: true,
            user: req.user
        });
    },

    /**
     * Change admin password
     */
    changePassword: async (req, res) => {
        try {
            const { oldPassword, newPassword } = req.body;
            const userId = req.user.sub;

            if (!oldPassword || !newPassword || newPassword.length < 8) {
                return res.status(400).json({
                    success: false,
                    error: "INVALID_REQUEST",
                    message: "New password must be at least 8 characters."
                });
            }

            const [rows] = await db.execute('SELECT * FROM users WHERE id = ?', [userId]);
            const user = rows[0];

            const isMatch = await verifyPassword(user.password_hash, oldPassword);

            if (!isMatch) {
                return res.status(401).json({
                    success: false,
                    error: "INVALID_CREDENTIALS",
                    message: "Existing password incorrect."
                });
            }

            const newHash = await hashPassword(newPassword);
            await db.execute('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, userId]);

            logger.audit(`Password changed for admin: ${user.username}`, { userId });

            await db.execute(`
                INSERT INTO audit_logs (action, user_id, details, ip_address, timestamp)
                VALUES (?, ?, ?, ?, ?)
            `, ['PASSWORD_CHANGE', userId, 'Password updated successfully', req.ip, Date.now()]);

            return res.json({
                success: true,
                message: "Password updated successfully."
            });
        } catch (error) {
            logger.error("Change password error", { error: error.message });
            return res.status(500).json({
                success: false,
                error: "INTERNAL_ERROR",
                message: "Failed to update password."
            });
        }
    }
};