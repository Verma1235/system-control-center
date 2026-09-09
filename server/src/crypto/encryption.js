import crypto from 'crypto';
import { logger } from '../utils/logger.js';

const ALGORITHM = 'aes-256-gcm';
const NONCE_LENGTH = 12; // 96 bits for GCM
const MAX_TIME_DRIFT_MS = 30000; // 30 seconds

// Replay Protection: In-memory store for recently seen message IDs
const seenMessageIds = new Set();

// Clear the set periodically to prevent memory leaks
setInterval(() => {
    seenMessageIds.clear();
}, MAX_TIME_DRIFT_MS * 2).unref();

/**
 * Encrypts a string payload using AES-256-GCM.
 * 
 * @param {string} payload - The data to encrypt
 * @param {Buffer} sessionKey - 32-byte AES key
 * @returns {Object} Encrypted envelope ready for network transit
 */
export function encryptPayload(payload, sessionKey) {
    if (!Buffer.isBuffer(sessionKey) || sessionKey.length !== 32) {
        throw new Error("Encryption failed: AES-256 requires a valid 32-byte Buffer key.");
    }

    const nonce = crypto.randomBytes(NONCE_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, sessionKey, nonce);

    const header = {
        version: "1.0",
        messageId: crypto.randomUUID(),
        timestamp: Date.now()
    };

    // Use header as Additional Authenticated Data (AAD)
    const aad = Buffer.from(JSON.stringify(header), 'utf8');
    cipher.setAAD(aad);

    let ciphertext = cipher.update(payload, 'utf8', 'base64');
    ciphertext += cipher.final('base64');

    const authTag = cipher.getAuthTag().toString('base64');

    return {
        header,
        nonce: nonce.toString('base64'),
        ciphertext,
        authTag
    };
}

/**
 * Decrypts and verifies an encrypted envelope.
 * 
 * @param {Object} envelope - The received encrypted payload
 * @param {Buffer} sessionKey - 32-byte AES key
 * @returns {string} The decrypted string payload
 */
export function decryptPayload(envelope, sessionKey) {
    if (!Buffer.isBuffer(sessionKey) || sessionKey.length !== 32) {
        throw new Error("Decryption failed: AES-256 requires a valid 32-byte Buffer key.");
    }

    const { header, nonce, ciphertext, authTag } = envelope;

    if (!header || !nonce || !ciphertext || !authTag) {
        throw new Error("Decryption failed: Malformed encrypted envelope.");
    }

    // 1. Replay Protection: Time Drift Check
    const now = Date.now();
    if (Math.abs(now - header.timestamp) > MAX_TIME_DRIFT_MS) {
        logger.warn("E2E Replay Blocked: Timestamp out of bounds", { msgId: header.messageId });
        throw new Error(`Message rejected: Timestamp out of bounds.`);
    }

    // 2. Replay Protection: Duplicate ID Check
    if (seenMessageIds.has(header.messageId)) {
        logger.warn("E2E Replay Blocked: Duplicate Message ID", { msgId: header.messageId });
        throw new Error(`Message rejected: Duplicate message ID.`);
    }
    seenMessageIds.add(header.messageId);

    // 3. Decryption & Integrity Check
    const nonceBuffer = Buffer.from(nonce, 'base64');
    const authTagBuffer = Buffer.from(authTag, 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, sessionKey, nonceBuffer);

    const aad = Buffer.from(JSON.stringify(header), 'utf8');
    decipher.setAAD(aad);
    decipher.setAuthTag(authTagBuffer);

    try {
        let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        logger.error("E2E Integrity Failed: Ciphertext or AAD tampered with.");
        throw new Error(`Message authentication failed.`);
    }
}