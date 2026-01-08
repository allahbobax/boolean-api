import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import { warmupDb } from './lib/db';
import { apiKeyAuth } from './lib/apiKeyAuth';
import { generalLimiter } from './lib/rateLimit';
import { generateCsrfToken, csrfProtection } from './lib/csrf';
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

console.log('🔍 Checking environment variables...');

const missingRequired = REQUIRED_ENV_VARS.filter(key => !process.env[key]);
if (missingRequired.length > 0) {
  console.error('❌ CRITICAL: Missing required environment variables:');
  missingRequired.forEach(key => console.error(`   - ${key}`));
  console.error('⚠️  Application may not function correctly!');
}

const missingOptional = OPTIONAL_ENV_VARS.filter(key => !process.env[key]);
if (missingOptional.length > 0) {
  console.warn('⚠️  WARNING: Missing optional environment variables:');
  missingOptional.forEach(key => console.warn(`   - ${key}`));
  console.warn('⚠️  Some features may be disabled.');
}

if (missingRequired.length === 0 && missingOptional.length === 0) {
  console.log('✅ All environment variables configured');
}

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

app.use(cors({
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
    } else {
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
app.options('*', cors());

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

// CSRF token endpoint (must be before csrfProtection middleware)
// Rate limited to prevent token flooding attacks
app.get('/csrf-token', generalLimiter, async (req, res) => {
  const sessionId = req.cookies?.sessionId || crypto.randomUUID();
  const csrfToken = await generateCsrfToken(sessionId);
  
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
app.use(apiKeyAuth);

// Root endpoint
app.get('/', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/health', health);
app.use('/auth', csrfProtection, auth);
app.use('/oauth', oauth);
app.use('/users', csrfProtection, users);
app.use('/hwid', csrfProtection, hwid);
app.use('/keys', csrfProtection, keys);
app.use('/incidents', csrfProtection, incidents);
app.use('/versions', csrfProtection, versions);
app.use('/products', csrfProtection, products);
app.use('/friends', csrfProtection, friends);
app.use('/client', csrfProtection, client);
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
