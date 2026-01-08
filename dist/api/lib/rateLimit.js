"use strict";
/**
 * Rate limiting middleware using Upstash Redis
 * Работает в serverless окружении (Vercel)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generalLimiter = exports.verifyCodeLimiter = exports.forgotPasswordLimiter = exports.emailLimiter = exports.registerLimiter = exports.authLimiter = void 0;
const ratelimit_1 = require("@upstash/ratelimit");
const redis_1 = require("@upstash/redis");
// Инициализация Redis клиента
const redis = new redis_1.Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
        return forwarded.split(',')[0].trim();
    }
    return req.ip || req.socket.remoteAddress || 'unknown';
}
// Создание rate limiter с Upstash
function createUpstashLimiter(requests, windowSeconds) {
    return new ratelimit_1.Ratelimit({
        redis,
        limiter: ratelimit_1.Ratelimit.slidingWindow(requests, `${windowSeconds} s`),
        analytics: true,
        prefix: 'ratelimit',
    });
}
// Middleware для применения rate limiting
function createRateLimitMiddleware(limiter, identifier) {
    return async (req, res, next) => {
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
        }
        catch (error) {
            console.error('Rate limit error:', error);
            // В случае ошибки Redis пропускаем запрос (fail-open)
            return next();
        }
    };
}
// Предустановленные лимитеры для разных эндпоинтов
// Аутентификация - 5 попыток за 15 минут
const authRateLimiter = createUpstashLimiter(5, 15 * 60);
exports.authLimiter = createRateLimitMiddleware(authRateLimiter, 'auth');
// Регистрация - 3 попытки за 1 час
const registerRateLimiter = createUpstashLimiter(3, 60 * 60);
exports.registerLimiter = createRateLimitMiddleware(registerRateLimiter, 'register');
// Email отправка - 1 письмо в минуту
const emailRateLimiter = createUpstashLimiter(1, 60);
exports.emailLimiter = createRateLimitMiddleware(emailRateLimiter, 'email');
// Забыли пароль - 3 запроса за 1 час
const forgotPasswordRateLimiter = createUpstashLimiter(3, 60 * 60);
exports.forgotPasswordLimiter = createRateLimitMiddleware(forgotPasswordRateLimiter, 'forgot');
// Проверка кода - 10 попыток за 15 минут
const verifyCodeRateLimiter = createUpstashLimiter(10, 15 * 60);
exports.verifyCodeLimiter = createRateLimitMiddleware(verifyCodeRateLimiter, 'verify');
// Общий лимит - 100 запросов в минуту
const generalRateLimiter = createUpstashLimiter(100, 60);
exports.generalLimiter = createRateLimitMiddleware(generalRateLimiter, 'general');
