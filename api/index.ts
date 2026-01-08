import 'dotenv/config';
import express from 'express';
import cors from 'cors';
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

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests without origin (direct browser access, curl, etc.)
    if (!origin) {
      return callback(null, true);
    }
    const isAllowed = allowedOriginPatterns.some(pattern => pattern.test(origin));
    if (isAllowed) {
      callback(null, origin);
    } else {
      // Log rejected origins for debugging
      logger.warn('CORS rejected', { origin });
      callback(new Error('CORS not allowed'), false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  maxAge: 86400
};

app.use(cors(corsOptions));

// Handle preflight requests explicitly with same CORS config
app.options('*', cors(corsOptions));

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
