import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { warmupDb } from './lib/db';
import { apiKeyAuth } from './lib/apiKeyAuth';
import { generalLimiter } from './lib/rateLimit';
import { logger } from './lib/logger';

// Routes
import health from './routes/health';
import auth from './routes/auth';
import oauth from './routes/oauth';
import users from './routes/users';
import hwid from './routes/hwid';
import keys from './routes/keys';
import incidents from './routes/incidents';
import versions from './routes/versions';
import products from './routes/products';
import friends from './routes/friends';
import client from './routes/client';
import status from './routes/status';
import payments from './routes/payments';

// Проверка критичных переменных окружения
const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'JWT_SECRET',
  'INTERNAL_API_KEY',
];

const OPTIONAL_ENV_VARS = [
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'RESEND_API_KEY',
  'TURNSTILE_SECRET_KEY',
];
const app = express();
app.disable('x-powered-by');

// CORS configuration constants
const allowedOriginPatterns = [
  /^http:\/\/localhost(?::\d+)?$/,
  /^http:\/\/127\.0\.0\.1(?::\d+)?$/,
  /^https?:\/\/(?:www\.)?booleanclient\.ru$/,
  /^https?:\/\/.*\.booleanclient\.ru$/,
  /^https?:\/\/booleanclient\.online$/,
  /^https?:\/\/www\.booleanclient\.online$/,
  /^https?:\/\/.*\.booleanclient\.online$/,
  /^https?:\/\/status\.booleanclient\.ru$/,
  /^https?:\/\/.*\.onrender\.com$/,
  /^https?:\/\/.*\.infinityfree\.com$/,
];

// CORS configuration using the official package
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const isAllowed = allowedOriginPatterns.some(pattern => pattern.test(origin));
    if (isAllowed) {
      callback(null, true);
    } else {
      // Для разработки можно разрешить, но в проде лучше ограничить
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'x-api-key']
}));

app.use(express.json());
app.use(cookieParser());

// Security headers
app.use(helmet({
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
      "img-src": ["'self'", "data:", "https://booleanclient.ru", "https://challenges.cloudflare.com"],
      "connect-src": ["'self'", "https://challenges.cloudflare.com", "https://api.booleanclient.online"],
      "font-src": ["'self'", "https://fonts.gstatic.com"],
      "frame-src": ["'self'", "https://challenges.cloudflare.com"],
      "frame-ancestors": ["'self'", "https://booleanclient.online", "https://www.booleanclient.online", "https://booleanclient.ru"],
    }
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// Global rate limiting
app.use(generalLimiter);

// API Key protection for all routes
app.use(apiKeyAuth);

// Root endpoint
app.get('/', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/health', health);
app.use('/auth', auth);
app.use('/oauth', oauth);
app.use('/users', users);
app.use('/hwid', hwid);
app.use('/keys', keys);
app.use('/incidents', incidents);
app.use('/versions', versions);
app.use('/products', products);
app.use('/friends', friends);
app.use('/client', client);
app.use('/status', status);
app.use('/payments', payments);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Not found' });
});

// Background Status Checker (for persistent environments like Render)
// On Vercel this will not run reliably, but on Render it will ensure the heartmap is always full
if (process.env.RENDER || process.env.PERSISTENT_HOST) {
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
      logger.info('Background status check completed');
    } catch (err) {
      logger.error('Background status check failed', { error: err });
    }
  };

  // Run initial check after server start
  setTimeout(runBackgroundCheck, 10000);
  // Then run periodically
  setInterval(runBackgroundCheck, STATUS_CHECK_INTERVAL);
}

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Server error', {
    endpoint: req.path,
    method: req.method,
    ip: req.ip,
    error: err.message
  });
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// Vercel serverless handler
export default app;
