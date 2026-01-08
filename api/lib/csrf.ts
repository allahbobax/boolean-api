import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { Redis } from '@upstash/redis';

// Проверка наличия переменных окружения для Redis
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!REDIS_URL || !REDIS_TOKEN) {
  console.error('⚠️  WARNING: UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN not configured!');
  console.error('⚠️  CSRF protection will be DISABLED. This is not recommended for production.');
}

// Инициализация Redis клиента (только если переменные заданы)
const redis = REDIS_URL && REDIS_TOKEN ? new Redis({
  url: REDIS_URL,
  token: REDIS_TOKEN,
}) : null;

const CSRF_TOKEN_TTL = 3600; // 1 час в секундах

export async function generateCsrfToken(sessionId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  
  // Если Redis не настроен, просто возвращаем токен (не сохраняем)
  if (!redis) {
    console.warn('CSRF token generated but not stored (Redis not configured)');
    return token;
  }
  
  const key = `csrf:${sessionId}`;
  
  try {
    // Сохраняем токен в Redis с TTL
    await redis.setex(key, CSRF_TOKEN_TTL, token);
  } catch (error) {
    console.error('Failed to store CSRF token:', error);
  }
  
  return token;
}

export async function validateCsrfToken(sessionId: string, token: string): Promise<boolean> {
  // Если Redis не настроен, пропускаем валидацию
  if (!redis) {
    console.warn('CSRF validation skipped (Redis not configured)');
    return true;
  }
  
  const key = `csrf:${sessionId}`;
  
  try {
    const stored = await redis.get<string>(key);
    
    if (!stored) return false;
    return stored === token;
  } catch (error) {
    console.error('CSRF validation error:', error);
    // В случае ошибки пропускаем (fail-open для доступности)
    return true;
  }
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
