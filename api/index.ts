import 'dotenv/config';
import express from 'express';
import cors from 'cors';

// Routes
import health from './routes/health.js';
import auth from './routes/auth.js';
import oauth from './routes/oauth.js';
import users from './routes/users.js';
import hwid from './routes/hwid.js';
import keys from './routes/keys.js';
import incidents from './routes/incidents.js';
import versions from './routes/versions.js';
import products from './routes/products.js';
import friends from './routes/friends.js';
import client from './routes/client.js';

const app = express();

// CORS configuration
const allowedOriginPatterns = [
  /^http:\/\/localhost(?::\d+)?$/,
  /^http:\/\/127\.0\.0\.1(?::\d+)?$/,
  /^https:\/\/(?:www\.)?booleanclient\.ru$/,
  /^https:\/\/.*\.booleanclient\.ru$/,
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const isAllowed = allowedOriginPatterns.some(pattern => pattern.test(origin));
    callback(null, isAllowed ? origin : '*');
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400
}));

app.use(express.json());

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

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Not found' });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

export default app;
