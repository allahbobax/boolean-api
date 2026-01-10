import crypto from 'crypto';
import { Redis } from '@upstash/redis';

// Redis клиент для хранения попыток верификации
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = REDIS_URL && REDIS_TOKEN ? new Redis({
  url: REDIS_URL,
  token: REDIS_TOKEN,
}) : null;

const VERIFICATION_PREFIX = 'verification_attempts:';
const VERIFICATION_TTL = 15 * 60; // 15 минут в секундах

// In-memory fallback (только если Redis недоступен)
const fallbackAttempts = new Map<string, { count: number; resetTime: number }>();

// Генерация криптографически стойкого кода верификации
export function generateVerificationCode(length: number = 8): string {
  // Используем криптографически стойкий генератор
  // Увеличиваем длину до 8 символов (100 миллионов комбинаций)
  const charset = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  
  for (let i = 0; i < length; i++) {
    const randomIndex = crypto.randomInt(0, charset.length);
    code += charset[randomIndex];
  }
  
  return code;
}

// Генерация токена сброса пароля
export function generateResetToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Проверка времени жизни кода/токена
export function isExpired(createdAt: Date, expirationMinutes: number = 15): boolean {
  const now = new Date();
  const expirationTime = new Date(createdAt.getTime() + expirationMinutes * 60 * 1000);
  return now > expirationTime;
}

// Хеширование кода для безопасного хранения в БД
export function hashVerificationCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

// Проверка кода с защитой от timing attacks
export function verifyCode(providedCode: string, hashedCode: string): boolean {
  const providedHash = hashVerificationCode(providedCode);
  const providedBuffer = Buffer.from(providedHash, 'hex');
  const storedBuffer = Buffer.from(hashedCode, 'hex');
  
  if (providedBuffer.length !== storedBuffer.length) {
    return false;
  }
  
  return crypto.timingSafeEqual(providedBuffer, storedBuffer);
}

// Ограничение попыток верификации (Redis-based)
export async function checkVerificationAttempts(identifier: string, maxAttempts: number = 5): Promise<boolean> {
  const key = `${VERIFICATION_PREFIX}${identifier}`;
  
  if (redis) {
    try {
      const current = await redis.get<number>(key);
      
      if (current === null) {
        // Первая попытка - устанавливаем счётчик с TTL
        await redis.set(key, 1, { ex: VERIFICATION_TTL });
        return true;
      }
      
      if (current >= maxAttempts) {
        return false;
      }
      
      // Инкрементируем счётчик (TTL сохраняется)
      await redis.incr(key);
      return true;
    } catch (error) {
      console.error('Redis verification attempts error:', error);
      // Fallback to in-memory при ошибке Redis
      return checkVerificationAttemptsFallback(identifier, maxAttempts);
    }
  }
  
  // Fallback если Redis не настроен
  return checkVerificationAttemptsFallback(identifier, maxAttempts);
}

// In-memory fallback
function checkVerificationAttemptsFallback(identifier: string, maxAttempts: number): boolean {
  const now = Date.now();
  const attempts = fallbackAttempts.get(identifier);
  
  if (!attempts || now > attempts.resetTime) {
    fallbackAttempts.set(identifier, { count: 1, resetTime: now + VERIFICATION_TTL * 1000 });
    return true;
  }
  
  if (attempts.count >= maxAttempts) {
    return false;
  }
  
  attempts.count++;
  return true;
}

export async function resetVerificationAttempts(identifier: string): Promise<void> {
  const key = `${VERIFICATION_PREFIX}${identifier}`;
  
  if (redis) {
    try {
      await redis.del(key);
    } catch (error) {
      console.error('Redis reset verification attempts error:', error);
    }
  }
  
  // Также очищаем fallback
  fallbackAttempts.delete(identifier);
}

// Очистка старых попыток (только для fallback)
export function cleanupVerificationAttempts(): void {
  const now = Date.now();
  for (const [key, data] of fallbackAttempts.entries()) {
    if (now > data.resetTime) {
      fallbackAttempts.delete(key);
    }
  }
}

// Запускаем очистку fallback каждые 10 минут
setInterval(cleanupVerificationAttempts, 10 * 60 * 1000);