import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { verifyToken } from '../lib/jwt';
import { getDb } from '../lib/db';
import type { User } from '../types';
import { logger } from '../lib/logger';

// Расширяем Request для добавления user
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

// Middleware для проверки JWT токена
export async function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ 
      success: false, 
      message: 'Токен доступа отсутствует' 
    });
  }

  try {
    const payload = await verifyToken(token);
    
    if (!payload || !payload.id) {
      return res.status(401).json({ 
        success: false, 
        message: 'Недействительный токен' 
      });
    }
    
    const sql = getDb();
    
    const result = await sql<User[]>`
      SELECT id, username, email, subscription, subscription_end_date, avatar, 
             registered_at, is_admin, is_banned, email_verified, settings, hwid 
      FROM users WHERE id = ${payload.id as number}`;

    if (result.length === 0) {
      return res.status(401).json({ 
        success: false, 
        message: 'Пользователь не найден' 
      });
    }

    const user = result[0];
    
    // Проверяем, не заблокирован ли пользователь
    if (user.is_banned) {
      return res.status(403).json({ 
        success: false, 
        message: 'Аккаунт заблокирован' 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    // Структурированное логирование без чувствительных данных
    logger.error('Token verification failed', {
      ip: req.ip,
      endpoint: req.path
    });
    return res.status(403).json({ 
      success: false, 
      message: 'Недействительный токен' 
    });
  }
}

// Middleware для проверки админских прав
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ 
      success: false, 
      message: 'Требуется аутентификация' 
    });
  }

  if (!req.user.is_admin) {
    return res.status(403).json({ 
      success: false, 
      message: 'Требуются права администратора' 
    });
  }

  next();
}

// Middleware для проверки внутреннего API ключа
export function requireInternalApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'] as string;
  const expectedApiKey = process.env.INTERNAL_API_KEY;

  if (!apiKey || !expectedApiKey) {
    return res.status(401).json({ 
      success: false, 
      message: 'API ключ отсутствует' 
    });
  }

  // Используем crypto.timingSafeEqual для защиты от timing attacks
  try {
    const providedKey = Buffer.from(apiKey, 'utf8');
    const expectedKey = Buffer.from(expectedApiKey, 'utf8');

    if (providedKey.length !== expectedKey.length || 
        !crypto.timingSafeEqual(providedKey, expectedKey)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Недействительный API ключ' 
      });
    }

    next();
  } catch (error) {
    return res.status(403).json({ 
      success: false, 
      message: 'Недействительный API ключ' 
    });
  }
}

// Rate limiting middleware (простая реализация в памяти)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

export function rateLimit(maxRequests: number = 100, windowMs: number = 15 * 60 * 1000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientId = req.ip || 'unknown';
    const now = Date.now();
    
    const clientData = rateLimitStore.get(clientId);
    
    if (!clientData || now > clientData.resetTime) {
      rateLimitStore.set(clientId, { count: 1, resetTime: now + windowMs });
      return next();
    }
    
    if (clientData.count >= maxRequests) {
      return res.status(429).json({ 
        success: false, 
        message: 'Слишком много запросов. Попробуйте позже.' 
      });
    }
    
    clientData.count++;
    next();
  };
}

// Очистка старых записей rate limit (вызывать периодически)
export function cleanupRateLimit() {
  const now = Date.now();
  for (const [key, data] of rateLimitStore.entries()) {
    if (now > data.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

// Запускаем очистку каждые 5 минут
setInterval(cleanupRateLimit, 5 * 60 * 1000);