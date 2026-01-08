import crypto from 'crypto';

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

// Ограничение попыток верификации
const verificationAttempts = new Map<string, { count: number; resetTime: number }>();

export function checkVerificationAttempts(identifier: string, maxAttempts: number = 5): boolean {
  const now = Date.now();
  const attempts = verificationAttempts.get(identifier);
  
  if (!attempts || now > attempts.resetTime) {
    verificationAttempts.set(identifier, { count: 1, resetTime: now + 15 * 60 * 1000 }); // 15 минут
    return true;
  }
  
  if (attempts.count >= maxAttempts) {
    return false;
  }
  
  attempts.count++;
  return true;
}

export function resetVerificationAttempts(identifier: string): void {
  verificationAttempts.delete(identifier);
}

// Очистка старых попыток
export function cleanupVerificationAttempts(): void {
  const now = Date.now();
  for (const [key, data] of verificationAttempts.entries()) {
    if (now > data.resetTime) {
      verificationAttempts.delete(key);
    }
  }
}

// Запускаем очистку каждые 10 минут
setInterval(cleanupVerificationAttempts, 10 * 60 * 1000);