/**
 * Rate limiting middleware using Upstash Redis
 * Работает в serverless окружении (Vercel)
 */

import { Request, Response, NextFunction } from 'express';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Проверка наличия переменных окружения для Redis
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!REDIS_URL || !REDIS_TOKEN) {
  console.error('⚠️  WARNING: UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN not configured!');
  console.error('⚠️  Rate limiting will be DISABLED. This is not recommended for production.');
}

// Инициализация Redis клиента (только если переменные заданы)
const redis = REDIS_URL && REDIS_TOKEN ? new Redis({
  url: REDIS_URL,
  token: REDIS_TOKEN,
}) : null;

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

// Создание rate limiter с Upstash
function createUpstashLimiter(requests: number, windowSeconds: number) {
  if (!redis) {
    return null; // Возвращаем null если Redis не настроен
  }
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, `${windowSeconds} s`),
    analytics: true,
    prefix: 'ratelimit',
  });
}

// Middleware для применения rate limiting
function createRateLimitMiddleware(limiter: Ratelimit | null, identifier?: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Если Redis не настроен, пропускаем rate limiting
    if (!limiter) {
      return next();
    }

    try {
      // БЕЗОПАСНОСТЬ: Исключаем статус-страницу из rate limiting
      // Статус-страница должна всегда работать для мониторинга
      if (req.path.startsWith('/status')) {
        return next();
      }

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

// Аутентификация - 5 попыток за 40 секунд
const authRateLimiter = createUpstashLimiter(5, 40);
export const authLimiter = createRateLimitMiddleware(authRateLimiter, 'auth');

// Регистрация - 3 попытки за 40 секунд
const registerRateLimiter = createUpstashLimiter(3, 40);
export const registerLimiter = createRateLimitMiddleware(registerRateLimiter, 'register');

// Email отправка - 1 письмо за 40 секунд
const emailRateLimiter = createUpstashLimiter(1, 40);
export const emailLimiter = createRateLimitMiddleware(emailRateLimiter, 'email');

// Забыли пароль - 3 запроса за 40 секунд
const forgotPasswordRateLimiter = createUpstashLimiter(3, 40);
export const forgotPasswordLimiter = createRateLimitMiddleware(forgotPasswordRateLimiter, 'forgot');

// Проверка кода - 10 попыток за 40 секунд
const verifyCodeRateLimiter = createUpstashLimiter(10, 40);
export const verifyCodeLimiter = createRateLimitMiddleware(verifyCodeRateLimiter, 'verify');

// Общий лимит - 100 запросов в минуту
const generalRateLimiter = createUpstashLimiter(100, 60);
export const generalLimiter = createRateLimitMiddleware(generalRateLimiter, 'general');
