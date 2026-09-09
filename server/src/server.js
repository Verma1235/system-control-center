import http from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import app from './app.js';
import { initSocketManager } from './socket/socketManager.js';
import { logger } from './utils/logger.js';

// Load environment variables immediately
dotenv.config();

// ============================================================
// HTTP & SOCKET.IO SERVER SETUP
// ============================================================
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*" },
    maxHttpBufferSize: 5e7, // 50MB Max chunks for stability
    pingInterval: 25000,
    pingTimeout: 60000,
    connectTimeout: 45000,
    transports: ["websocket", "polling"],
    perMessageDeflate: true
});

// ✨ ADDED: Expose io instance to Express so our REST APIs can trigger socket events
app.set('io', io);

// Initialize real-time management
initSocketManager(io);

// ============================================================
// SERVER INITIALIZATION
// ============================================================
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    logger.info(`🚀 Control Center running securely on port ${PORT}`);
    logger.info(`📡 Socket.IO signaling ready`);
    logger.info(`🛡️ E2E Encryption Protocol Ready`);
});

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================
let shuttingDown = false;

function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.audit(`\n${signal} received. Shutting down securely...`);
    io.disconnectSockets(true);

    server.close(() => {
        logger.info("HTTP server closed. Exiting process.");
        process.exit(0);
    });

    setTimeout(() => {
        logger.error("Forced shutdown after timeout.");
        process.exit(1);
    }, 10000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));