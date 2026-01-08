"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const crypto_1 = __importDefault(require("crypto"));
const db_1 = require("./lib/db");
const apiKeyAuth_1 = require("./lib/apiKeyAuth");
const rateLimit_1 = require("./lib/rateLimit");
const csrf_1 = require("./lib/csrf");
const logger_1 = require("./lib/logger");
// Routes
const health_1 = __importDefault(require("./routes/health"));
const auth_1 = __importDefault(require("./routes/auth"));
const oauth_1 = __importDefault(require("./routes/oauth"));
const users_1 = __importDefault(require("./routes/users"));
const hwid_1 = __importDefault(require("./routes/hwid"));
const keys_1 = __importDefault(require("./routes/keys"));
const incidents_1 = __importDefault(require("./routes/incidents"));
const versions_1 = __importDefault(require("./routes/versions"));
const products_1 = __importDefault(require("./routes/products"));
const friends_1 = __importDefault(require("./routes/friends"));
const client_1 = __importDefault(require("./routes/client"));
const status_1 = __importDefault(require("./routes/status"));
const app = (0, express_1.default)();
// Warm up DB connection early (non-blocking)
(0, db_1.warmupDb)();
// CORS configuration
const allowedOriginPatterns = [
    /^http:\/\/localhost(?::\d+)?$/,
    /^http:\/\/127\.0\.0\.1(?::\d+)?$/,
    /^https:\/\/(?:www\.)?booleanclient\.ru$/,
    /^https:\/\/.*\.booleanclient\.ru$/,
];
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Only allow requests without origin in development mode
        if (!origin) {
            if (process.env.NODE_ENV === 'development') {
                return callback(null, true);
            }
            return callback(new Error('Origin required'), false);
        }
        const isAllowed = allowedOriginPatterns.some(pattern => pattern.test(origin));
        if (isAllowed) {
            callback(null, origin);
        }
        else {
            // Reject unknown origins in production
            callback(new Error('CORS not allowed'), false);
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    maxAge: 86400
}));
// Handle preflight requests explicitly
app.options('*', (0, cors_1.default)());
app.use(express_1.default.json());
app.use((0, cookie_parser_1.default)());
// Security headers
app.use((0, helmet_1.default)({
    hsts: {
        maxAge: 31536000, // 1 год
        includeSubDomains: true,
        preload: true
    },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
        }
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));
// Global rate limiting
app.use(rateLimit_1.generalLimiter);
// CSRF token endpoint (must be before csrfProtection middleware)
// Rate limited to prevent token flooding attacks
app.get('/csrf-token', rateLimit_1.generalLimiter, async (req, res) => {
    const sessionId = req.cookies?.sessionId || crypto_1.default.randomUUID();
    const csrfToken = await (0, csrf_1.generateCsrfToken)(sessionId);
    // Set session cookie
    res.cookie('sessionId', sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 3600000 // 1 hour
    });
    res.json({ csrfToken });
});
// API Key protection for sensitive routes (must be before CSRF)
app.use(apiKeyAuth_1.apiKeyAuth);
// Root endpoint
app.get('/', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// API Routes
app.use('/health', health_1.default);
app.use('/auth', csrf_1.csrfProtection, auth_1.default);
app.use('/oauth', oauth_1.default);
app.use('/users', csrf_1.csrfProtection, users_1.default);
app.use('/hwid', csrf_1.csrfProtection, hwid_1.default);
app.use('/keys', keys_1.default);
app.use('/incidents', incidents_1.default);
app.use('/versions', versions_1.default);
app.use('/products', products_1.default);
app.use('/friends', friends_1.default);
app.use('/client', client_1.default);
app.use('/status', status_1.default);
// 404 handler
app.use((_req, res) => {
    res.status(404).json({ success: false, message: 'Not found' });
});
// Error handler
app.use((err, req, res, _next) => {
    logger_1.logger.error('Server error', {
        endpoint: req.path,
        method: req.method,
        ip: req.ip
    });
    res.status(500).json({ success: false, message: 'Internal server error' });
});
exports.default = app;
