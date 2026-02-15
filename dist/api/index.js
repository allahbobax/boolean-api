"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
// Глобальные обработчики ошибок для отладки
process.on('uncaughtException', (err) => {
    console.error('CRITICAL: Uncaught Exception:', err);
    // Не выходим сразу, чтобы успеть записать лог
    setTimeout(() => process.exit(1), 1000);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
});
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const apiKeyAuth_1 = require("./lib/apiKeyAuth");
const rateLimit_1 = require("./lib/rateLimit");
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
app.disable('x-powered-by');
// CORS configuration constants
const allowedOriginPatterns = [
    /^http:\/\/localhost(?::\d+)?$/,
    /^http:\/\/127\.0\.0\.1(?::\d+)?$/,
    /^https?:\/\/.*\.onrender\.com$/,
    /^https?:\/\/.*\.railway\.app$/,
    /^https?:\/\/.*\.up\.railway\.app$/,
    /^https?:\/\/.*\.infinityfree\.com$/,
    /^https?:\/\/.*\.xisedlc\.lol$/,
    /^https?:\/\/xisedlc\.lol$/,
];
// CORS configuration using the official package
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin)
            return callback(null, true);
        const isAllowed = allowedOriginPatterns.some(pattern => pattern.test(origin));
        if (isAllowed) {
            callback(null, true);
        }
        else {
            // Для разработки можно разрешить, но в проде лучше ограничить
            callback(null, false);
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'x-api-key']
}));
app.use(express_1.default.json());
app.use((0, cookie_parser_1.default)());
// Security headers
app.use((0, helmet_1.default)({
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    },
    contentSecurityPolicy: {
        useDefaults: true,
        directives: {
            "default-src": ["'self'"],
            "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://challenges.cloudflare.com"],
            "script-src": ["'self'", "'unsafe-inline'", "https://challenges.cloudflare.com"],
            "img-src": ["'self'", "data:", "https://xisedlc.lol", "https://challenges.cloudflare.com"],
            "connect-src": ["'self'", "https://challenges.cloudflare.com", "https://api.xisedlc.lol"],
            "font-src": ["'self'", "https://fonts.gstatic.com"],
            "frame-src": ["'self'", "https://challenges.cloudflare.com"],
            "frame-ancestors": ["'self'", "https://xisedlc.lol", "https://www.xisedlc.lol", "https://xisedlc.lol"],
        }
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));
// Global rate limiting except for health check routes
app.use(rateLimit_1.generalLimiter);
// API Key protection for all routes
app.use(apiKeyAuth_1.apiKeyAuth);
// Root endpoint
app.get('/', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// API Routes Router
const apiRouter = express_1.default.Router();
apiRouter.use('/health', health_1.default);
apiRouter.use('/auth', auth_1.default);
apiRouter.use('/oauth', oauth_1.default);
apiRouter.use('/users', users_1.default);
apiRouter.use('/hwid', hwid_1.default);
apiRouter.use('/keys', keys_1.default);
apiRouter.use('/incidents', incidents_1.default);
apiRouter.use('/versions', versions_1.default);
apiRouter.use('/products', products_1.default);
apiRouter.use('/friends', friends_1.default);
apiRouter.use('/client', client_1.default);
apiRouter.use('/status', status_1.default);
// Mount API router
app.use('/api', apiRouter); // Handle /api prefix (e.g. /api/oauth/...)
// Mount OAuth router explicitly to root for compatibility if needed, 
// but also ensure it works under /api via apiRouter
app.use('/oauth', oauth_1.default);
// For other routes on root level (legacy support)
app.use('/', apiRouter); // Handle root prefix (e.g. /oauth/...)
// 404 handler
app.use((_req, res) => {
    res.status(404).json({ success: false, message: 'Not found' });
});
// Background Status Checker (for persistent environments like Railway/Render)
if (process.env.NODE_ENV !== 'test') {
    const STATUS_CHECK_INTERVAL = 60000; // 1 minute
    const runBackgroundCheck = async () => {
        try {
            // We can use the existing check logic by hitting our own endpoint or calling the logic directly
            // Here we hit the internal /status/check endpoint
            const internalApiKey = process.env.STATUS_PAGE_API_KEY || process.env.INTERNAL_API_KEY;
            const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
            await fetch(`${baseUrl}/status/check`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': internalApiKey || ''
                }
            });
            logger_1.logger.info('Background status check completed');
        }
        catch (err) {
            logger_1.logger.error('Background status check failed', { error: err });
        }
    };
    // Run initial check after server start
    setTimeout(runBackgroundCheck, 10000);
    // Then run periodically
    setInterval(runBackgroundCheck, STATUS_CHECK_INTERVAL);
}
// Error handler
app.use((err, req, res, _next) => {
    logger_1.logger.error('Server error', {
        endpoint: req.path,
        method: req.method,
        ip: req.ip,
        error: err.message
    });
    res.status(500).json({ success: false, message: 'Internal server error' });
});
// Start server
if (process.env.NODE_ENV !== 'test') {
    const PORT = process.env.PORT || 3000;
    if (isNaN(Number(PORT))) {
        console.error('CRITICAL: Invalid PORT configuration:', process.env.PORT);
        process.exit(1);
    }
    console.log('Starting server on port:', PORT);
    // Ensure we listen on all interfaces for Docker/Railway
    app.listen(Number(PORT), '0.0.0.0', () => {
        logger_1.logger.info(`Server is running on port ${PORT}`);
        console.log(`Server is running on port ${PORT}`);
    });
}
