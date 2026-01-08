"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPassword = hashPassword;
exports.comparePassword = comparePassword;
exports.rehashLegacyPassword = rehashLegacyPassword;
exports.passwordsMatch = passwordsMatch;
exports.generateSecurePassword = generateSecurePassword;
exports.validatePasswordStrength = validatePasswordStrength;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_1 = require("./db");
const crypto_1 = __importDefault(require("crypto"));
const SALT_ROUNDS = 12; // Увеличиваем до 12 для лучшей безопасности
async function hashPassword(password) {
    // Проверяем минимальную длину пароля
    if (password.length < 8) {
        throw new Error('Password must be at least 8 characters long');
    }
    return bcryptjs_1.default.hash(password, SALT_ROUNDS);
}
async function comparePassword(password, hashed) {
    return bcryptjs_1.default.compare(password, hashed);
}
async function rehashLegacyPassword(userId, password) {
    const sql = (0, db_1.getDb)();
    const hashedPassword = await hashPassword(password);
    await sql `UPDATE users SET password = ${hashedPassword}, legacy_password_migrated = true WHERE id = ${userId}`;
    // Логируем миграцию legacy пароля для аудита
    console.warn(`Legacy password migrated for user ${userId}`);
    return hashedPassword;
}
async function passwordsMatch(user, inputPassword) {
    if (!user.password)
        return false;
    // Только bcrypt пароли разрешены
    if (user.password.startsWith('$2')) {
        return comparePassword(inputPassword, user.password);
    }
    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Полностью отключаем поддержку legacy паролей
    // Это предотвращает атаки на слабые пароли
    console.error(`Attempted login with legacy password format for user ${user.id}. Legacy passwords are no longer supported.`);
    // Возвращаем false для всех legacy паролей
    // Пользователи должны сбросить пароль через безопасную процедуру
    return false;
}
// Новая функция для генерации безопасных паролей
function generateSecurePassword(length = 16) {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += charset.charAt(crypto_1.default.randomInt(0, charset.length));
    }
    return password;
}
// Функция для проверки силы пароля
function validatePasswordStrength(password) {
    const errors = [];
    if (password.length < 8) {
        errors.push('Password must be at least 8 characters long');
    }
    if (!/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
    }
    if (!/\d/.test(password)) {
        errors.push('Password must contain at least one number');
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        errors.push('Password must contain at least one special character');
    }
    return { valid: errors.length === 0, errors };
}
