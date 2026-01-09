import { Router, Request, Response } from 'express';
import type { User } from '../types';
import { getDb } from '../lib/db';
import { hashPassword, passwordsMatch } from '../lib/password';
import { generateVerificationCode, sendVerificationEmail, sendPasswordResetEmail } from '../lib/email';
import { mapUserFromDb } from '../lib/userMapper';
import { verifyTurnstileToken } from '../lib/turnstile';
import { authLimiter, registerLimiter, emailLimiter, forgotPasswordLimiter, verifyCodeLimiter } from '../lib/rateLimit';
import { logger } from '../lib/logger';

const router = Router();

// Валидация надежности пароля
function validatePassword(password: string): { valid: boolean; message?: string } {
  if (password.length < 12) {
    return { valid: false, message: 'Пароль должен быть минимум 12 символов' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Пароль должен содержать заглавную букву' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Пароль должен содержать строчную букву' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Пароль должен содержать цифру' };
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return { valid: false, message: 'Пароль должен содержать спецсимвол' };
  }
  return { valid: true };
}

// Login
router.post('/login', authLimiter, async (req: Request, res: Response) => {
  const sql = getDb();
  
  const { usernameOrEmail, password, hwid, turnstileToken } = req.body;
  const clientIp = req.headers['x-forwarded-for'] as string || req.ip;

  // ОПТИМИЗАЦИЯ: Запускаем Turnstile и DB запрос ПАРАЛЛЕЛЬНО
  // Используем только нужные поля для ускорения запроса
  const [isTurnstileValid, result] = await Promise.all([
    verifyTurnstileToken(turnstileToken, clientIp),
    sql<User[]>`
      SELECT id, username, email, password, subscription, subscription_end_date, registered_at, 
             is_admin, is_banned, email_verified, settings, avatar, hwid,
             failed_login_attempts, account_locked_until, last_failed_login
      FROM users 
      WHERE username = ${usernameOrEmail} OR email = ${usernameOrEmail}
      LIMIT 1
    `
  ]);

  if (!isTurnstileValid) {
    return res.json({ success: false, message: 'Проверка безопасности не пройдена. Попробуйте снова.' });
  }

  if (result.length === 0) {
    return res.json({ success: false, message: 'Неверный логин или пароль' });
  }

  const dbUser = result[0];

  // БЕЗОПАСНОСТЬ: Проверка блокировки аккаунта
  if (dbUser.account_locked_until && new Date(dbUser.account_locked_until) > new Date()) {
    const minutesLeft = Math.ceil((new Date(dbUser.account_locked_until).getTime() - Date.now()) / 60000);
    logger.warn('Login attempt on locked account', { userId: dbUser.id, ip: clientIp });
    return res.json({ 
      success: false, 
      message: `Аккаунт временно заблокирован. Попробуйте через ${minutesLeft} мин.` 
    });
  }

  const isPasswordValid = await passwordsMatch({ id: dbUser.id, password: dbUser.password ?? null }, password);

  if (!isPasswordValid) {
    // БЕЗОПАСНОСТЬ: Увеличиваем счетчик неудачных попыток
    const failedAttempts = (dbUser.failed_login_attempts || 0) + 1;
    const now = new Date();
    
    // Блокируем аккаунт после 5 неудачных попыток на 30 минут
    if (failedAttempts >= 5) {
      const lockUntil = new Date(now.getTime() + 30 * 60 * 1000); // 30 минут
      await sql`
        UPDATE users 
        SET failed_login_attempts = ${failedAttempts}, 
            last_failed_login = ${now},
            account_locked_until = ${lockUntil}
        WHERE id = ${dbUser.id}
      `;
      logger.warn('Account locked due to failed login attempts', { userId: dbUser.id, ip: clientIp });
      return res.json({ 
        success: false, 
        message: 'Слишком много неудачных попыток. Аккаунт заблокирован на 30 минут.' 
      });
    }
    
    // Обновляем счетчик неудачных попыток
    await sql`
      UPDATE users 
      SET failed_login_attempts = ${failedAttempts}, 
          last_failed_login = ${now}
      WHERE id = ${dbUser.id}
    `;
    
    logger.warn('Failed login attempt', { userId: dbUser.id, attempts: failedAttempts, ip: clientIp });
    
    // БЕЗОПАСНОСТЬ: Не раскрываем количество оставшихся попыток
    return res.json({ 
      success: false, 
      message: 'Неверный логин или пароль' 
    });
  }

  if (dbUser.is_banned) {
    return res.json({ success: false, message: 'Ваш аккаунт заблокирован' });
  }

  // ОПТИМИЗАЦИЯ: Отправляем ответ СРАЗУ, обновляем БД в фоне
  if (hwid) {
    dbUser.hwid = hwid;
  }

  const userData = mapUserFromDb(dbUser);
  
  // Отправляем ответ немедленно - пользователь не ждёт UPDATE
  res.json({ success: true, message: 'Вход выполнен!', data: userData });

  // БЕЗОПАСНОСТЬ: Сбрасываем счетчик при успешном входе (в фоне, не блокируя ответ)
  sql`
    UPDATE users 
    SET failed_login_attempts = 0, 
        account_locked_until = NULL,
        last_failed_login = NULL,
        hwid = ${hwid || dbUser.hwid}
    WHERE id = ${dbUser.id}
  `.catch(err => logger.error('Failed to reset login attempts', { userId: dbUser.id, error: err.message }));

  logger.info('Successful login', { userId: dbUser.id, ip: clientIp });
});

// Register
router.post('/register', registerLimiter, async (req: Request, res: Response) => {
  const sql = getDb();
  // УБРАНО: ensureUserSchema() - схема должна создаваться при деплое, не на каждый запрос
  
  const { username, email, password, hwid, turnstileToken } = req.body;

  // Валидация надежности пароля
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    return res.json({ success: false, message: passwordValidation.message });
  }

  // Verify Turnstile token
  const clientIp = req.headers['x-forwarded-for'] as string || req.ip;
  const isTurnstileValid = await verifyTurnstileToken(turnstileToken, clientIp);
  if (!isTurnstileValid) {
    return res.json({ success: false, message: 'Проверка безопасности не пройдена. Попробуйте снова.' });
  }

  const existingUser = await sql`
    SELECT * FROM users WHERE username = ${username} OR email = ${email}
  `;

  if (existingUser.length > 0) {
    const existing = existingUser[0];
    if (existing.username === username) {
      return res.json({ success: false, message: 'Пользователь с таким логином уже существует' });
    }
    if (existing.email === email) {
      // Не раскрываем, что email существует - возвращаем ошибку
      return res.json({ 
        success: false, 
        message: 'Пользователь с таким email уже существует'
      });
    }
  }

  const verificationCode = generateVerificationCode();
  const codeExpires = new Date(Date.now() + 10 * 60 * 1000);
  const hashedPassword = await hashPassword(password);

  const result = await sql<User[]>`
    INSERT INTO users (username, email, password, verification_code, verification_code_expires, email_verified, hwid, subscription, is_admin, is_banned) 
    VALUES (${username}, ${email}, ${hashedPassword}, ${verificationCode}, ${codeExpires}, false, ${hwid || null}, 'free', false, false) 
    RETURNING *
  `;

  const user = mapUserFromDb(result[0]);
  const emailSent = await sendVerificationEmail(email, username, verificationCode);

  if (!emailSent) {
    await sql`DELETE FROM users WHERE id = ${result[0].id}`;
    return res.json({ success: false, message: 'Ошибка отправки кода. Попробуйте позже.' });
  }

  return res.json({
    success: true,
    message: 'Код подтверждения отправлен на email',
    requiresVerification: true,
    data: user
  });
});

// Resend code
router.post('/resend-code', emailLimiter, async (req: Request, res: Response) => {
  const sql = getDb();
  const { userId } = req.body;

  if (!userId) {
    return res.json({ success: false, message: 'Не указан ID пользователя' });
  }

  const result = await sql<User[]>`SELECT * FROM users WHERE id = ${userId}`;

  if (result.length === 0) {
    return res.json({ success: false, message: 'Пользователь не найден' });
  }

  const user = result[0];

  if (user.email_verified) {
    return res.json({ success: false, message: 'Email уже подтвержден' });
  }

  const verificationCode = generateVerificationCode();
  const codeExpires = new Date(Date.now() + 10 * 60 * 1000);

  await sql`
    UPDATE users SET verification_code = ${verificationCode}, verification_code_expires = ${codeExpires} WHERE id = ${userId}
  `;

  const emailSent = await sendVerificationEmail(user.email, user.username, verificationCode);

  if (emailSent) {
    return res.json({ success: true, message: 'Новый код отправлен на email' });
  }
  return res.json({ success: false, message: 'Ошибка отправки кода' });
});

// Verify code
router.post('/verify-code', verifyCodeLimiter, async (req: Request, res: Response) => {
  const sql = getDb();
  const { userId, code } = req.body;

  if (!userId || !code) {
    return res.json({ success: false, message: 'Не указан ID пользователя или код' });
  }

  const result = await sql<User[]>`SELECT * FROM users WHERE id = ${userId}`;

  if (result.length === 0) {
    return res.json({ success: false, message: 'Пользователь не найден' });
  }

  const user = result[0];

  if (new Date() > new Date(user.verification_code_expires!)) {
    return res.json({ success: false, message: 'Код истек. Запросите новый код.' });
  }

  if (user.verification_code !== code) {
    return res.json({ success: false, message: 'Неверный код подтверждения' });
  }

  await sql`
    UPDATE users SET email_verified = true, verification_code = NULL, verification_code_expires = NULL WHERE id = ${userId}
  `;

  return res.json({ success: true, message: 'Email успешно подтвержден!' });
});

// Forgot password
router.post('/forgot-password', forgotPasswordLimiter, async (req: Request, res: Response) => {
  const sql = getDb();
  // УБРАНО: ensureUserSchema() - схема должна создаваться при деплое, не на каждый запрос
  
  const { email } = req.body;

  if (!email) {
    return res.json({ success: false, message: 'Укажите email' });
  }

  const result = await sql<User[]>`SELECT * FROM users WHERE email = ${email}`;

  // Всегда возвращаем успех, чтобы не раскрывать существование email
  if (result.length === 0) {
    return res.json({ success: true, message: 'Если email существует в системе, код отправлен' });
  }

  const user = result[0];
  const resetCode = generateVerificationCode();
  const codeExpires = new Date(Date.now() + 10 * 60 * 1000);

  await sql`
    UPDATE users SET reset_code = ${resetCode}, reset_code_expires = ${codeExpires} WHERE id = ${user.id}
  `;

  const emailSent = await sendPasswordResetEmail(email, user.username, resetCode);

  if (emailSent) {
    return res.json({ success: true, message: 'Если email существует в системе, код отправлен', userId: user.id });
  }
  // Даже при ошибке отправки не раскрываем детали
  return res.json({ success: true, message: 'Если email существует в системе, код отправлен' });
});

// Verify reset code
router.post('/verify-reset-code', verifyCodeLimiter, async (req: Request, res: Response) => {
  const sql = getDb();
  const { userId, code } = req.body;

  if (!userId || !code) {
    return res.json({ success: false, message: 'Не указан ID пользователя или код' });
  }

  const result = await sql<User[]>`SELECT * FROM users WHERE id = ${userId}`;

  if (result.length === 0) {
    return res.json({ success: false, message: 'Пользователь не найден' });
  }

  const user = result[0];

  if (!user.reset_code || !user.reset_code_expires) {
    return res.json({ success: false, message: 'Код сброса не запрашивался' });
  }

  if (new Date() > new Date(user.reset_code_expires)) {
    return res.json({ success: false, message: 'Код истек. Запросите новый код.' });
  }

  if (user.reset_code !== code) {
    return res.json({ success: false, message: 'Неверный код' });
  }

  return res.json({ success: true, message: 'Код подтвержден' });
});

// Reset password
router.post('/reset-password', verifyCodeLimiter, async (req: Request, res: Response) => {
  const sql = getDb();
  const { userId, code, newPassword } = req.body;

  if (!userId || !code || !newPassword) {
    return res.json({ success: false, message: 'Заполните все поля' });
  }

  // Валидация надежности пароля
  const passwordValidation = validatePassword(newPassword);
  if (!passwordValidation.valid) {
    return res.json({ success: false, message: passwordValidation.message });
  }

  const result = await sql<User[]>`SELECT * FROM users WHERE id = ${userId}`;

  if (result.length === 0) {
    return res.json({ success: false, message: 'Пользователь не найден' });
  }

  const user = result[0];

  if (!user.reset_code || user.reset_code !== code) {
    return res.json({ success: false, message: 'Неверный код подтверждения' });
  }

  if (new Date() > new Date(user.reset_code_expires!)) {
    return res.json({ success: false, message: 'Код истек' });
  }

  const hashedPassword = await hashPassword(newPassword);

  await sql`
    UPDATE users SET password = ${hashedPassword}, reset_code = NULL, reset_code_expires = NULL WHERE id = ${userId}
  `;

  return res.json({ success: true, message: 'Пароль успешно изменен!' });
});

// Health check endpoint for auth service
// ОПТИМИЗАЦИЯ: Убрали DB запрос - проверяем только что сервис отвечает
// DB проверяется через /health/ping, дублировать не нужно
router.get('/check', (_req: Request, res: Response) => {
  return res.json({ 
    status: 'ok', 
    service: 'auth',
    timestamp: new Date().toISOString()
  });
});

export default router;