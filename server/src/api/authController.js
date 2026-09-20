import { db } from '../database/db.js';
import { verifyPassword, signToken, hashPassword } from '../auth/jwt.js';
import { logger } from '../utils/logger.js';
import crypto from 'crypto';

export const authController = {
    /**
     * Handle Device Registration Payload
     */
    register: async (req, res) => {
        try {
            const { success, data, nodeId } = req.body;

            if (!success || !data || !nodeId) {
                return res.status(400).json({ success: false, message: "Invalid payload format." });
            }

            const { fullName, email, role, passwordLogin, passwordManage, adminAuth } = data;

            // Check if email already exists
            const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
            if (existing.length > 0) {
                return res.status(409).json({ success: false, message: "Email is already registered." });
            }

            const userId = crypto.randomUUID();

            // Hash all secure fields
            const hashedLogin = await hashPassword(passwordLogin);
            const hashedManage = await hashPassword(passwordManage);
            const hashedAuth = await hashPassword(adminAuth);

            // Insert into modified users table
            await db.execute(`
                INSERT INTO users 
                (id, node_id, full_name, email, role, password_login, password_manage, admin_auth, is_blocked, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [userId, nodeId, fullName, email, role, hashedLogin, hashedManage, hashedAuth, 0, Date.now()]);

            // Mark node as registered in the nodes table
            await db.execute('UPDATE nodes SET is_registered = 1 WHERE id = ?', [nodeId]);

            // Audit
            await db.execute(`
                INSERT INTO audit_logs (action, node_id, user_id, details, ip_address, timestamp)
                VALUES (?, ?, ?, ?, ?, ?)
            `, ['USER_REGISTER', nodeId, userId, `New account registered for ${email}`, req.ip, Date.now()]);

            logger.info(`New user registered: ${email} from node ${nodeId}`);

            return res.json({ success: true, message: "Account registered successfully." });
        } catch (error) {
            logger.error("Registration error", { error: error.message });
            return res.status(500).json({ success: false, message: "Internal server error during registration." });
        }
    },

    /**
     * Admin login handler (Modified for Email)
     */
    login: async (req, res) => {
        try {
            const { email, password } = req.body; // Changed from username to email

            if (!email || !password) {
                return res.status(400).json({
                    success: false, error: "INVALID_REQUEST", message: "Email and password are required."
                });
            }

            const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
            const user = rows[0];

            if (!user) {
                return res.status(401).json({
                    success: false, error: "INVALID_CREDENTIALS", message: "Invalid email or password."
                });
            }

            if (user.is_blocked) {
                return res.status(403).json({
                    success: false, error: "ACCOUNT_BLOCKED", message: "This account has been blocked."
                });
            }

            // Verify using the new password_login column
            const isMatch = await verifyPassword(user.password_login, password);

            if (!isMatch) {
                logger.warn(`Failed login attempt for email: ${email}`, { ip: req.ip });
                return res.status(401).json({
                    success: false, error: "INVALID_CREDENTIALS", message: "Invalid email or password."
                });
            }

            const token = signToken(user);
            logger.info(`Admin logged in successfully: ${email}`, { ip: req.ip });

            await db.execute(`
                INSERT INTO audit_logs (action, user_id, details, ip_address, timestamp)
                VALUES (?, ?, ?, ?, ?)
            `, ['ADMIN_LOGIN', user.id, `User logged in`, req.ip, Date.now()]);

            return res.json({
                success: true,
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    fullName: user.full_name,
                    role: user.role
                }
            });
        } catch (error) {
            logger.error("Login controller error", { error: error.message });
            return res.status(500).json({
                success: false, error: "INTERNAL_ERROR", message: "Internal server error."
            });
        }
    },

    verifySession: (req, res) => {
        return res.json({ success: true, user: req.user });
    },

    /**
     * Change admin password
     */
    changePassword: async (req, res) => {
        try {
            const { oldPassword, newPassword } = req.body;
            const userId = req.user?.id;

            if (!oldPassword || !newPassword || newPassword.length < 8) {
                return res.status(400).json({
                    success: false, error: "INVALID_REQUEST", message: "New password must be at least 8 characters."
                });
            }

            const [rows] = await db.execute('SELECT * FROM users WHERE id = ?', [userId]);
            const user = rows[0];

            const isMatch = await verifyPassword(user.password_login, oldPassword);

            if (!isMatch) {
                return res.status(401).json({
                    success: false, error: "INVALID_CREDENTIALS", message: "Existing password incorrect."
                });
            }

            const newHash = await hashPassword(newPassword);
            await db.execute('UPDATE users SET password_login = ? WHERE id = ?', [newHash, userId]);

            logger.audit(`Password changed for admin: ${user.email}`, { userId });

            return res.json({ success: true, message: "Password updated successfully." });
        } catch (error) {
            logger.error("Change password error", { error: error.message });
            return res.status(500).json({ success: false, message: "Failed to update password." });
        }
    },
    verifyAccess: async (req, res) => {
        try {
            const { node, password } = req.body;
            const userData = req?.user;
            // console.log("NODE DATA:", node);

            // .env file se password get karna
            const envPassword = process.env.ADMIN_AUTH;
            const isMatch = await verifyPassword(node?.user_manage_auth, password);
            // Agar kisi ne blank password bheja hai
            if (!password) {
                return res.status(400).json({ success: false, message: "Password is required" });
            }

            // Password compare karna
            if (password === envPassword) {
                // Success hone par response bhejna
                // Tip: Aap yahan security ke liye JWT token ya HttpOnly Cookie bhi set kar sakte hain
                return res.json({ success: true, message: "Access Granted", nodeId: node?.id });
            } else if (isMatch) {
                return res.json({ success: true, message: "Access Granted", nodeId: node?.id });
            } else {
                // Password galat hone par
                return res.status(401).json({ success: false, message: "Incorrect Password" });
            }

        } catch (error) {
            console.error("Verification Error:", error);
            return res.status(500).json({ success: false, message: error?.message || "Internal Server Error" });
        }
    },

};