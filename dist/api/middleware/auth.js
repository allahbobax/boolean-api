"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateToken = authenticateToken;
exports.requireAdmin = requireAdmin;
exports.requireInternalApiKey = requireInternalApiKey;
exports.rateLimit = rateLimit;
exports.cleanupRateLimit = cleanupRateLimit;
const crypto = __importStar(require("crypto"));
const jwt_1 = require("../lib/jwt");
const db_1 = require("../lib/db");
const logger_1 = require("../lib/logger");
const redis_1 = require("@upstash/redis");
// Redis клиент для rate limiting
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = REDIS_URL && REDIS_TOKEN ? new redis_1.Redis({
    url: REDIS_URL,
    token: REDIS_TOKEN,
}) : null;
const RATE_LIMIT_PREFIX = 'auth_ratelimit:';
// Middleware для проверки JWT токена
async function authenticateToken(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Токен доступа отсутствует'
        });
    }
    try {
        const payload = await (0, jwt_1.verifyToken)(token);
        if (!payload || !payload.id) {
            return res.status(401).json({
                success: false,
                message: 'Недействительный токен'
            });
        }
        const sql = (0, db_1.getDb)();
        const result = await sql `
      SELECT id, username, email, subscription, subscription_end_date, avatar, 
             registered_at, is_admin, is_banned, email_verified, settings, hwid 
      FROM users WHERE id = ${payload.id}`;
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
    }
    catch (error) {
        // Структурированное логирование без чувствительных данных
        logger_1.logger.error('Token verification failed', {
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
function requireAdmin(req, res, next) {
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
function requireInternalApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'];
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
    }
    catch (error) {
        return res.status(403).json({
            success: false,
            message: 'Недействительный API ключ'
        });
    }
}
// Rate limiting middleware (Redis-based с in-memory fallback)
const fallbackRateLimitStore = new Map();
function rateLimit(maxRequests = 100, windowMs = 15 * 60 * 1000) {
    const windowSeconds = Math.ceil(windowMs / 1000);
    return async (req, res, next) => {
        const clientId = req.ip || 'unknown';
        const key = `${RATE_LIMIT_PREFIX}${clientId}`;
        if (redis) {
            try {
                const current = await redis.get(key);
                if (current === null) {
                    // Первый запрос - устанавливаем счётчик с TTL
                    await redis.set(key, 1, { ex: windowSeconds });
                    return next();
                }
                if (current >= maxRequests) {
                    return res.status(429).json({
                        success: false,
                        message: 'Слишком много запросов. Попробуйте позже.'
                    });
                }
                // Инкрементируем счётчик
                await redis.incr(key);
                return next();
            }
            catch (error) {
                logger_1.logger.error('Redis rate limit error', { error });
                // Fallback to in-memory при ошибке Redis
                return rateLimitFallback(clientId, maxRequests, windowMs, res, next);
            }
        }
        // Fallback если Redis не настроен
        return rateLimitFallback(clientId, maxRequests, windowMs, res, next);
    };
}
function rateLimitFallback(clientId, maxRequests, windowMs, res, next) {
    const now = Date.now();
    const clientData = fallbackRateLimitStore.get(clientId);
    if (!clientData || now > clientData.resetTime) {
        fallbackRateLimitStore.set(clientId, { count: 1, resetTime: now + windowMs });
        return next();
    }
    if (clientData.count >= maxRequests) {
        return res.status(429).json({
            success: false,
            message: 'Слишком много запросов. Попробуйте позже.'
        });
    }
    clientData.count++;
    return next();
}
// Очистка старых записей rate limit fallback (вызывать периодически)
function cleanupRateLimit() {
    const now = Date.now();
    for (const [key, data] of fallbackRateLimitStore.entries()) {
        if (now > data.resetTime) {
            fallbackRateLimitStore.delete(key);
        }
    }
}
// Запускаем очистку каждые 5 минут
setInterval(cleanupRateLimit, 5 * 60 * 1000);
