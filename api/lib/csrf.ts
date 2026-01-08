import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { Redis } from '@upstash/redis';

// Инициализация Redis клиента
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const CSRF_TOKEN_TTL = 3600; // 1 час в секундах

export async function generateCsrfToken(sessionId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const key = `csrf:${sessionId}`;
  
  // Сохраняем токен в Redis с TTL
  await redis.setex(key, CSRF_TOKEN_TTL, token);
  
  return token;
}

export async function validateCsrfToken(sessionId: string, token: string): Promise<boolean> {
  const key = `csrf:${sessionId}`;
  const stored = await redis.get<string>(key);
  
  if (!stored) return false;
  return stored === token;
}

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Skip CSRF for GET, HEAD, OPTIONS
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip CSRF if API key is present (for launcher/mobile apps)
  const apiKey = req.headers['x-api-key'] as string;
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
  const csrfToken = req.headers['x-csrf-token'] as string;

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
