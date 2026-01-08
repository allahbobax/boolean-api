"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateVerificationCode = generateVerificationCode;
exports.generateResetToken = generateResetToken;
exports.isExpired = isExpired;
exports.hashVerificationCode = hashVerificationCode;
exports.verifyCode = verifyCode;
exports.checkVerificationAttempts = checkVerificationAttempts;
exports.resetVerificationAttempts = resetVerificationAttempts;
exports.cleanupVerificationAttempts = cleanupVerificationAttempts;
const crypto_1 = __importDefault(require("crypto"));
// Генерация криптографически стойкого кода верификации
function generateVerificationCode(length = 8) {
    // Используем криптографически стойкий генератор
    // Увеличиваем длину до 8 символов (100 миллионов комбинаций)
    const charset = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < length; i++) {
        const randomIndex = crypto_1.default.randomInt(0, charset.length);
        code += charset[randomIndex];
    }
    return code;
}
// Генерация токена сброса пароля
function generateResetToken() {
    return crypto_1.default.randomBytes(32).toString('hex');
}
// Проверка времени жизни кода/токена
function isExpired(createdAt, expirationMinutes = 15) {
    const now = new Date();
    const expirationTime = new Date(createdAt.getTime() + expirationMinutes * 60 * 1000);
    return now > expirationTime;
}
// Хеширование кода для безопасного хранения в БД
function hashVerificationCode(code) {
    return crypto_1.default.createHash('sha256').update(code).digest('hex');
}
// Проверка кода с защитой от timing attacks
function verifyCode(providedCode, hashedCode) {
    const providedHash = hashVerificationCode(providedCode);
    const providedBuffer = Buffer.from(providedHash, 'hex');
    const storedBuffer = Buffer.from(hashedCode, 'hex');
    if (providedBuffer.length !== storedBuffer.length) {
        return false;
    }
    return crypto_1.default.timingSafeEqual(providedBuffer, storedBuffer);
}
// Ограничение попыток верификации
const verificationAttempts = new Map();
function checkVerificationAttempts(identifier, maxAttempts = 5) {
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
function resetVerificationAttempts(identifier) {
    verificationAttempts.delete(identifier);
}
// Очистка старых попыток
function cleanupVerificationAttempts() {
    const now = Date.now();
    for (const [key, data] of verificationAttempts.entries()) {
        if (now > data.resetTime) {
            verificationAttempts.delete(key);
        }
    }
}
// Запускаем очистку каждые 10 минут
setInterval(cleanupVerificationAttempts, 10 * 60 * 1000);
