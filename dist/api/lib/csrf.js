"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCsrfToken = generateCsrfToken;
exports.validateCsrfToken = validateCsrfToken;
exports.csrfProtection = csrfProtection;
const crypto_1 = __importDefault(require("crypto"));
const redis_1 = require("@upstash/redis");
// Инициализация Redis клиента
const redis = new redis_1.Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
const CSRF_TOKEN_TTL = 3600; // 1 час в секундах
async function generateCsrfToken(sessionId) {
    const token = crypto_1.default.randomBytes(32).toString('hex');
    const key = `csrf:${sessionId}`;
    // Сохраняем токен в Redis с TTL
    await redis.setex(key, CSRF_TOKEN_TTL, token);
    return token;
}
async function validateCsrfToken(sessionId, token) {
    const key = `csrf:${sessionId}`;
    const stored = await redis.get(key);
    if (!stored)
        return false;
    return stored === token;
}
function csrfProtection(req, res, next) {
    // Skip CSRF for GET, HEAD, OPTIONS
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }
    // Skip CSRF if API key is present (for launcher/mobile apps)
    const apiKey = req.headers['x-api-key'];
    if (apiKey) {
        return next();
    }
    // Get session ID from cookie
    const sessionId = req.cookies?.sessionId;
    if (!sessionId) {
        return res.status(403).json({
            success: false,
            message: 'Missing session ID'
        });
    }
    // Get CSRF token from header
    const csrfToken = req.headers['x-csrf-token'];
    if (!csrfToken) {
        return res.status(403).json({
            success: false,
            message: 'Missing CSRF token'
        });
    }
    validateCsrfToken(sessionId, csrfToken)
        .then(valid => {
        if (!valid) {
            return res.status(403).json({
                success: false,
                message: 'Invalid CSRF token'
            });
        }
        next();
    })
        .catch(error => {
        console.error('CSRF validation error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    });
}
