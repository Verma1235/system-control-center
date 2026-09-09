import { verifyToken } from '../auth/jwt.js';

/**
 * Protects Express routes requiring an active admin session.
 * Expects header: "Authorization: Bearer <token>"
 */
export function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: "AUTH_REQUIRED",
            message: "Missing or malformed Authorization header"
        });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    if (!decoded) {
        return res.status(401).json({
            success: false,
            error: "INVALID_TOKEN",
            message: "Session expired or invalid token"
        });
    }

    req.user = decoded;
    next();
}