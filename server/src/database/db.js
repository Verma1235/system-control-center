import mysql from 'mysql2/promise';
import { logger } from '../utils/logger.js';
import argon2 from 'argon2';
import dotenv from "dotenv";
dotenv.config();

let ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";

// Create a connection pool using your TiDB Cloud credentials
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    port: process.env.DB_PORT || 4000,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true
    }
});

// ============================================================
// SCHEMA DEFINITIONS
// ============================================================
async function initDatabase() {
    try {
        logger.info("Initializing database schema on TiDB...");

        // Administrators Table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(255) PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                created_at BIGINT NOT NULL
            )
        `);

        // Electron Nodes Table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS nodes (
                id VARCHAR(255) PRIMARY KEY,
                hostname VARCHAR(255) NOT NULL,
                platform VARCHAR(255) NOT NULL,
                display_name VARCHAR(255),
                is_approved TINYINT(1) DEFAULT 0,
                last_ip VARCHAR(45),
                last_seen BIGINT,
                capabilities JSON,
                created_at BIGINT NOT NULL
            )
        `);

        // Audit Logs Table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS audit_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                action VARCHAR(255) NOT NULL,
                node_id VARCHAR(255),
                user_id VARCHAR(255),
                details TEXT,
                ip_address VARCHAR(45),
                timestamp BIGINT NOT NULL
            )
        `);

        await seedInitialAdmin();
        logger.info("Database initialization complete.");
    } catch (error) {
        logger.error("Database initialization failed:", error);
    }
}

// ============================================================
// SEEDING
// ============================================================
async function seedInitialAdmin() {
    try {
        const [rows] = await db.execute(`SELECT id FROM users WHERE id = ?`, ['usr_default_admin']);
        const existingAdmin = rows[0];

        if (!existingAdmin) {
            logger.info(`No default admin found. Creating admin account: ${ADMIN_USERNAME}...`);
            const defaultPasswordHash = await argon2.hash(ADMIN_PASSWORD);

            await db.execute(`
                INSERT INTO users (id, username, password_hash, created_at)
                VALUES (?, ?, ?, ?)
            `, ['usr_default_admin', ADMIN_USERNAME, defaultPasswordHash, Date.now()]);

            logger.warn(`Default admin account created. Username: ${ADMIN_USERNAME}. PLEASE CHANGE THIS IMMEDIATELY.`);
        }
    } catch (error) {
        logger.error("Failed to seed default admin", error);
    }
}

initDatabase();

export { db };