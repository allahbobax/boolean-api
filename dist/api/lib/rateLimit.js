"use strict";
/**
 * Rate limiting middleware using Upstash Redis
 * Работает в serverless окружении (Vercel)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generalLimiter = exports.verifyCodeLimiter = exports.forgotPasswordLimiter = exports.emailLimiter = exports.registerLimiter = exports.authLimiter = void 0;
const ratelimit_1 = require("@upstash/ratelimit");
const redis_1 = require("@upstash/redis");
// Проверка наличия переменных окружения для Redis
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
// Инициализация Redis клиента (только если переменные заданы и не являются пустыми строками или "undefined")
const isValidRedisConfig = (url, token) => {
    return url && token && token !== 'undefined' && token !== 'null' && url !== 'undefined' && url !== 'null';
};
const redis = isValidRedisConfig(REDIS_URL, REDIS_TOKEN) ? new redis_1.Redis({
    url: REDIS_URL,
    token: REDIS_TOKEN,
}) : null;
// In-memory fallback rate limiter для случаев когда Redis недоступен
// БЕЗОПАСНОСТЬ: Fail-closed вместо fail-open
class InMemoryRateLimiter {
    requests = new Map();
    maxRequests;
    windowMs;
    constructor(maxRequests, windowSeconds) {
        this.maxRequests = maxRequests;
        this.windowMs = windowSeconds * 1000;
        // Очистка устаревших записей каждую минуту
        setInterval(() => this.cleanup(), 60000);
    }
    cleanup() {
        const now = Date.now();
        for (const [key, value] of this.requests.entries()) {
            if (value.resetAt < now) {
                this.requests.delete(key);
            }
        }
    }
    async limit(key) {
        const now = Date.now();
        const record = this.requests.get(key);
        if (!record || record.resetAt < now) {
            // Новое окно
            const resetAt = now + this.windowMs;
            this.requests.set(key, { count: 1, resetAt });
            return { success: true, limit: this.maxRequests, remaining: this.maxRequests - 1, reset: resetAt };
        }
        if (record.count >= this.maxRequests) {
            return { success: false, limit: this.maxRequests, remaining: 0, reset: record.resetAt };
        }
        record.count++;
        return { success: true, limit: this.maxRequests, remaining: this.maxRequests - record.count, reset: record.resetAt };
    }
}
// Fallback лимитеры (создаются лениво)
const fallbackLimiters = new Map();
function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
        return forwarded.split(',')[0].trim();
    }
    return req.ip || req.socket.remoteAddress || 'unknown';
}
// Создание rate limiter с Upstash
function createUpstashLimiter(requests, windowSeconds) {
    if (!redis) {
        return null; // Возвращаем null если Redis не настроен
    }
    return new ratelimit_1.Ratelimit({
        redis,
        limiter: ratelimit_1.Ratelimit.slidingWindow(requests, `${windowSeconds} s`),
        analytics: true,
        prefix: 'ratelimit',
    });
}
// Middleware для применения rate limiting
function createRateLimitMiddleware(limiter, identifier = 'default', maxRequests = 100, windowSeconds = 60) {
    return async (req, res, next) => {
        try {
            // БЕЗОПАСНОСТЬ: Исключаем статус-страницу из rate limiting
            // Статус-страница должна всегда работать для мониторинга
            if (req.path.startsWith('/status')) {
                return next();
            }
            const ip = getClientIp(req);
            const key = identifier ? `${identifier}:${ip}` : ip;
            let result;
            if (limiter) {
                // Используем Redis
                result = await limiter.limit(key);
            }
            else {
                // БЕЗОПАСНОСТЬ: Используем in-memory fallback вместо пропуска
                let fallback = fallbackLimiters.get(identifier);
                if (!fallback) {
                    fallback = new InMemoryRateLimiter(maxRequests, windowSeconds);
                    fallbackLimiters.set(identifier, fallback);
                }
                result = await fallback.limit(key);
            }
            const { success, limit, remaining, reset } = result;
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
        }
        catch (error) {
            console.error('Rate limit error:', error);
            // БЕЗОПАСНОСТЬ: Fail-closed - при ошибке используем fallback лимитер
            let fallback = fallbackLimiters.get(identifier);
            if (!fallback) {
                fallback = new InMemoryRateLimiter(maxRequests, windowSeconds);
                fallbackLimiters.set(identifier, fallback);
            }
            const ip = getClientIp(req);
            const key = identifier ? `${identifier}:${ip}` : ip;
            const result = await fallback.limit(key);
            if (!result.success) {
                return res.status(429).json({
                    success: false,
                    message: 'Слишком много запросов. Попробуйте позже.',
                });
            }
            return next();
        }
    };
}
// Предустановленные лимитеры для разных эндпоинтов
// Аутентификация - 5 попыток за 40 секунд
const authRateLimiter = createUpstashLimiter(5, 40);
exports.authLimiter = createRateLimitMiddleware(authRateLimiter, 'auth', 5, 40);
// Регистрация - 3 попытки за 40 секунд
const registerRateLimiter = createUpstashLimiter(3, 40);
exports.registerLimiter = createRateLimitMiddleware(registerRateLimiter, 'register', 3, 40);
// Email отправка - 1 письмо за 40 секунд
const emailRateLimiter = createUpstashLimiter(1, 40);
exports.emailLimiter = createRateLimitMiddleware(emailRateLimiter, 'email', 1, 40);
// Забыли пароль - 3 запроса за 40 секунд
const forgotPasswordRateLimiter = createUpstashLimiter(3, 40);
exports.forgotPasswordLimiter = createRateLimitMiddleware(forgotPasswordRateLimiter, 'forgot', 3, 40);
// Проверка кода - 10 попыток за 40 секунд
const verifyCodeRateLimiter = createUpstashLimiter(10, 40);
exports.verifyCodeLimiter = createRateLimitMiddleware(verifyCodeRateLimiter, 'verify', 10, 40);
// Общий лимит - 100 запросов в минуту
const generalRateLimiter = createUpstashLimiter(100, 60);
exports.generalLimiter = createRateLimitMiddleware(generalRateLimiter, 'general', 100, 60);
