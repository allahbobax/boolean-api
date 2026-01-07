/**
 * In-memory rate limiting middleware
 * Для production рекомендуется использовать Redis
 */

import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// In-memory store (для Vercel serverless используйте Redis/Upstash)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Очистка старых записей каждые 5 минут
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

interface RateLimitOptions {
  windowMs: number;      // Окно времени в мс
  maxRequests: number;   // Макс запросов за окно
  keyPrefix?: string;    // Префикс для ключа
}

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function createRateLimiter(options: RateLimitOptions) {
  const { windowMs, maxRequests, keyPrefix = 'rl' } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = getClientIp(req);
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();

    let entry = rateLimitStore.get(key);

    if (!entry || entry.resetTime < now) {
      entry = { count: 1, resetTime: now + windowMs };
      rateLimitStore.set(key, entry);
      return next();
    }

    entry.count++;

    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      res.set('X-RateLimit-Limit', String(maxRequests));
      res.set('X-RateLimit-Remaining', '0');
      res.set('X-RateLimit-Reset', String(entry.resetTime));
      
      return res.status(429).json({
        success: false,
        message: 'Слишком много запросов. Попробуйте позже.',
        retryAfter
      });
    }

    res.set('X-RateLimit-Limit', String(maxRequests));
    res.set('X-RateLimit-Remaining', String(maxRequests - entry.count));
    res.set('X-RateLimit-Reset', String(entry.resetTime));

    return next();
  };
}

// Предустановленные лимитеры
export const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,  // 15 минут
  maxRequests: 5,             // 5 попыток логина
  keyPrefix: 'auth'
});

export const registerLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,  // 1 час
  maxRequests: 3,             // 3 регистрации
  keyPrefix: 'register'
});

export const emailLimiter = createRateLimiter({
  windowMs: 60 * 1000,       // 1 минута
  maxRequests: 1,             // 1 письмо в минуту
  keyPrefix: 'email'
});

export const forgotPasswordLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,  // 1 час
  maxRequests: 3,             // 3 запроса сброса
  keyPrefix: 'forgot'
});

export const verifyCodeLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,  // 15 минут
  maxRequests: 10,            // 10 попыток ввода кода
  keyPrefix: 'verify'
});

export const generalLimiter = createRateLimiter({
  windowMs: 60 * 1000,       // 1 минута
  maxRequests: 100,           // 100 запросов
  keyPrefix: 'general'
});
