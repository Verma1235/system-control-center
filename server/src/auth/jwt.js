import jwt from 'jsonwebtoken';
import argon2 from 'argon2';
import { logger } from '../utils/logger.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_insecure_jwt_secret_change_me';
const TOKEN_EXPIRY = '12h';

/**
 * Generates a signed JWT for an authenticated admin user.
 * 
 * @param {Object} user - User record from the database
 * @returns {string} Signed JWT string
 */
export function signToken(user) {
    return jwt.sign(
        {
            sub: user.id,
            username: user.username,
            role: 'admin'
        },
        JWT_SECRET,
        { expiresIn: TOKEN_EXPIRY }
    );
}

/**
 * Synchronously verifies a JWT token.
 * 
 * @param {string} token - Bearer token
 * @returns {Object|null} Decoded payload or null if invalid
 */
export function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        logger.debug("Token verification failed", { error: error.message });
        return null;
    }
}

/**
 * Securely hashes a plain text password using Argon2id.
 * 
 * @param {string} plainTextPassword 
 * @returns {Promise<string>}
 */
export async function hashPassword(plainTextPassword) {
    return await argon2.hash(plainTextPassword, {
        type: argon2.argon2id,
        memoryCost: 2 ** 16, // 64 MB
        timeCost: 3,
        parallelism: 1
    });
}

/**
 * Verifies a plain text password against an Argon2 hash.
 * 
 * @param {string} hash 
 * @param {string} plainTextPassword 
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(hash, plainTextPassword) {
    try {
        return await argon2.verify(hash, plainTextPassword);
    } catch (error) {
        logger.error("Password verification execution error", { error: error.message });
        return false;
    }
}