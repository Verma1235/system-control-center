import mysql from "mysql2/promise";
import { logger } from "../utils/logger.js";
import dotenv from "dotenv";
dotenv.config();

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
    minVersion: "TLSv1.2",
    rejectUnauthorized: true,
  },
});

// ============================================================
// SCHEMA DEFINITIONS
// ============================================================
async function initDatabase() {
  try {
    logger.info("Initializing database schema on TiDB...");

    // 1. Users Table (Updated to match frontend payload without strict constraints)
    await db.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(255) PRIMARY KEY,
                node_id VARCHAR(255),
                full_name VARCHAR(255),
                email VARCHAR(255),
                role VARCHAR(50),
                password_login VARCHAR(255),
                password_manage VARCHAR(255),
                admin_auth VARCHAR(255),
                is_blocked TINYINT(1) DEFAULT 0,
                created_at BIGINT
            )
        `);

    // 2. Electron Nodes Table (Added status flags, removed capabilities)
    await db.execute(`
            CREATE TABLE IF NOT EXISTS nodes (
                id VARCHAR(255) PRIMARY KEY,
                hostname VARCHAR(255),
                platform VARCHAR(255),
                user_email VARCHAR(255),
                is_registered TINYINT(1) DEFAULT 0,
                is_approved TINYINT(1) DEFAULT 0,
                is_blocked TINYINT(1) DEFAULT 0,
                last_ip VARCHAR(45),
                last_seen BIGINT,
                created_at BIGINT
            )
        `);

    // 3. Audit Logs Table (For tracking actions)
    await db.execute(`
            CREATE TABLE IF NOT EXISTS audit_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                action VARCHAR(255),
                node_id VARCHAR(255),
                user_id VARCHAR(255),
                details TEXT,
                ip_address VARCHAR(45),
                timestamp BIGINT
            )
        `);

    await db.execute(` CREATE TABLE IF NOT EXISTS user_inquiries (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ticket_id VARCHAR(50) UNIQUE NOT NULL,
        user_email VARCHAR(255) NOT NULL,
        category VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'unread',
        reply_message TEXT,
        replied_by VARCHAR(255),
        created_at BIGINT NOT NULL,
        updated_at BIGINT
        )
     `);

     
    logger.info("Database initialization complete. Tables are ready.");
  } catch (error) {
    logger.error("Database initialization failed:", error);
  }
}

initDatabase();

export { db };
