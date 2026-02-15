import 'dotenv/config';

// Глобальные обработчики ошибок для отладки
process.on('uncaughtException', (err) => {
  console.error('CRITICAL: Uncaught Exception:', err);
  // Не выходим сразу, чтобы успеть записать лог
  setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
});

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
const app = express();
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
app.use(generalLimiter);

// API Key protection for all routes
app.use(apiKeyAuth);

// Root endpoint
app.get('/', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes Router
const apiRouter = express.Router();
apiRouter.use('/health', health);
apiRouter.use('/auth', auth);
apiRouter.use('/oauth', oauth);
apiRouter.use('/users', users);
apiRouter.use('/hwid', hwid);
apiRouter.use('/keys', keys);
apiRouter.use('/incidents', incidents);
apiRouter.use('/versions', versions);
apiRouter.use('/products', products);
apiRouter.use('/friends', friends);
apiRouter.use('/client', client);
apiRouter.use('/status', status);

// Mount API router
app.use('/api', apiRouter); // Handle /api prefix (e.g. /api/oauth/...)
app.use('/', apiRouter);    // Handle root prefix (e.g. /oauth/...)

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
    logger.info(`Server is running on port ${PORT}`);
    console.log(`Server is running on port ${PORT}`);
  });
}

