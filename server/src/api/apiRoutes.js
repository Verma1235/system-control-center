import express from 'express';
import { authController } from './authController.js';
import { nodeController } from './nodeController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { streamController } from './streamController.js'; // ✨ ADDED

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

export default router;