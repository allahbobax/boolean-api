/**
 * Rate limiting middleware using Upstash Redis
 * Работает в serverless окружении (Vercel)
 */

import { Request, Response, NextFunction } from 'express';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Инициализация Redis клиента
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

// Создание rate limiter с Upstash
function createUpstashLimiter(requests: number, windowSeconds: number) {
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, `${windowSeconds} s`),
    analytics: true,
    prefix: 'ratelimit',
  });
}

// Middleware для применения rate limiting
function createRateLimitMiddleware(limiter: Ratelimit, identifier?: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ip = getClientIp(req);
      const key = identifier ? `${identifier}:${ip}` : ip;
      
      const { success, limit, remaining, reset } = await limiter.limit(key);

      // Устанавливаем заголовки
      res.set('X-RateLimit-Limit', String(limit));
      res.set('X-RateLimit-Remaining', String(remaining));
      res.set('X-RateLimit-Reset', String(reset));

      if (!success) {
        const retryAfter = Math.ceil((reset - Date.now()) / 1000);
        res.set('Retry-After', String(retryAfter));
        
        return res.status(429).json({
          success: false,
          message: 'Слишком много запросов. Попробуйте позже.',
          retryAfter
        });
      }

      return next();
    } catch (error) {
      console.error('Rate limit error:', error);
      // В случае ошибки Redis пропускаем запрос (fail-open)
      return next();
    }
  };
}

// Предустановленные лимитеры для разных эндпоинтов

// Аутентификация - 5 попыток за 15 минут
const authRateLimiter = createUpstashLimiter(5, 15 * 60);
export const authLimiter = createRateLimitMiddleware(authRateLimiter, 'auth');

// Регистрация - 3 попытки за 1 час
const registerRateLimiter = createUpstashLimiter(3, 60 * 60);
export const registerLimiter = createRateLimitMiddleware(registerRateLimiter, 'register');

// Email отправка - 1 письмо в минуту
const emailRateLimiter = createUpstashLimiter(1, 60);
export const emailLimiter = createRateLimitMiddleware(emailRateLimiter, 'email');

// Забыли пароль - 3 запроса за 1 час
const forgotPasswordRateLimiter = createUpstashLimiter(3, 60 * 60);
export const forgotPasswordLimiter = createRateLimitMiddleware(forgotPasswordRateLimiter, 'forgot');

// Проверка кода - 10 попыток за 15 минут
const verifyCodeRateLimiter = createUpstashLimiter(10, 15 * 60);
export const verifyCodeLimiter = createRateLimitMiddleware(verifyCodeRateLimiter, 'verify');

// Общий лимит - 100 запросов в минуту
const generalRateLimiter = createUpstashLimiter(100, 60);
export const generalLimiter = createRateLimitMiddleware(generalRateLimiter, 'general');
