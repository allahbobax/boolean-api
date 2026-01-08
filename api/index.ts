import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
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

// Warm up DB connection early (non-blocking)
warmupDb();

// CORS configuration
const allowedOriginPatterns = [
  /^http:\/\/localhost(?::\d+)?$/,
  /^http:\/\/127\.0\.0\.1(?::\d+)?$/,
  /^https:\/\/(?:www\.)?booleanclient\.ru$/,
  /^https:\/\/.*\.booleanclient\.ru$/,
];

function isOriginAllowed(origin: string | undefined): string | false {
  if (!origin) return false;
  const isAllowed = allowedOriginPatterns.some(pattern => pattern.test(origin));
  return isAllowed ? origin : false;
}

// Manual preflight handler BEFORE any other middleware
app.options('*', (req, res) => {
  const origin = req.headers.origin;
  const allowedOrigin = isOriginAllowed(origin);
  
  // Always set Vary header for proper caching
  res.setHeader('Vary', 'Origin');
  
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  
  res.status(204).end();
});

// Add CORS headers to ALL responses (including non-preflight)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigin = isOriginAllowed(origin);
  
  // Always set Vary for proper caching with different origins
  res.setHeader('Vary', 'Origin');
  
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  
  next();
});

app.use(express.json());
app.use(cookieParser());

// Security headers
app.use(helmet({
  hsts: {
    maxAge: 31536000, // 1 год
    includeSubDomains: true,
    preload: true
  },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'sha256-'"], // Удалили unsafe-inline, используем хеши
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https://booleanclient.ru"], // Ограничили домены
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
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

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Not found' });
});

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

// Для Vercel serverless функций
export default app;
