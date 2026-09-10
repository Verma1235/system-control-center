import express from 'express';
import { authController } from './authController.js';
import { nodeController } from './nodeController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { streamController } from './streamController.js'; // ✨ ADDED
import dotenv from "dotenv";
dotenv.config();
const router = express.Router();

// Public Authentication Routes
router.post('/auth/login', authController.login);

// Protected Admin Routes
router.get('/auth/verify', requireAuth, authController.verifySession);
router.post('/auth/change-password', requireAuth, authController.changePassword);

// Node Device Management
router.get('/nodes', requireAuth, nodeController.getAllNodes);
router.get('/nodes/:id', requireAuth, nodeController.getNodeById);
router.post('/nodes/:id/approval', requireAuth, nodeController.toggleApproval);
router.delete('/nodes/:id', requireAuth, nodeController.deleteNode);

// ✨ ADDED: Media & Zip Streaming Route (Uses URL-based Token Auth)
router.get('/nodes/:id/stream', streamController.streamMedia);

// Audit Trails
router.get('/logs/audit', requireAuth, nodeController.getAuditLogs);



router.get('/webrtc/ice-servers', async (req, res) => {
    try {
        const apiKey = process.env.METERED_API_KEY;
        const appName = process.env.METERED_APP_NAME; // e.g. "my-app"

        if (apiKey && appName) {
            const response = await fetch(`https://${appName}.metered.live/api/v1/turn/credentials?apiKey=${apiKey}`);
            const iceServers = await response.json();
            return res.json({ success: true, iceServers });
        }

        // Fallback standard STUN servers
        return res.json({
            success: true,
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" },
                { urls: "stun:stun1.l.google.com:19302" }
            ]
        });
    } catch (error) {
        return res.json({
            success: false,
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
        });
    }
});
export default router;