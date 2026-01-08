import bcrypt from 'bcryptjs';
import { getDb } from './db';
import crypto from 'crypto';

const SALT_ROUNDS = 6; // Оптимизировано для serverless (~15-25ms вместо ~100ms при 10)

export async function hashPassword(password: string): Promise<string> {
  // Проверяем минимальную длину пароля
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(password: string, hashed: string): Promise<boolean> {
  return bcrypt.compare(password, hashed);
}

export async function rehashLegacyPassword(userId: number, password: string): Promise<string> {
  const sql = getDb();
  const hashedPassword = await hashPassword(password);
  await sql`UPDATE users SET password = ${hashedPassword}, legacy_password_migrated = true WHERE id = ${userId}`;
  
  // Логируем миграцию legacy пароля для аудита
  console.warn(`Legacy password migrated for user ${userId}`);
  
  return hashedPassword;
}

export async function passwordsMatch(
  user: { id: number; password: string | null },
  inputPassword: string
): Promise<boolean> {
  if (!user.password) return false;

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
export function generateSecurePassword(length: number = 16): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(crypto.randomInt(0, charset.length));
  }
  return password;
}

// Функция для проверки силы пароля
export function validatePasswordStrength(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
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
