import { Router } from 'express';
import { getDb, ensureUserSchema } from '../lib/db';
import { hashPassword, passwordsMatch } from '../lib/password';
import { generateVerificationCode, sendVerificationEmail, sendPasswordResetEmail } from '../lib/email';
import { mapUserFromDb } from '../lib/userMapper';
const router = Router();
// Login
router.post('/login', async (req, res) => {
    const sql = getDb();
    await ensureUserSchema();
    const { usernameOrEmail, password, hwid } = req.body;
    const result = await sql `
    SELECT id, username, email, password, subscription, subscription_end_date, registered_at, 
           is_admin, is_banned, email_verified, settings, avatar, hwid
    FROM users 
    WHERE username = ${usernameOrEmail} OR email = ${usernameOrEmail}
    LIMIT 1
  `;
    if (result.length === 0) {
        return res.json({ success: false, message: 'Неверный логин или пароль' });
    }
    const dbUser = result[0];
    const isPasswordValid = await passwordsMatch({ id: dbUser.id, password: dbUser.password ?? null }, password);
    if (!isPasswordValid) {
        return res.json({ success: false, message: 'Неверный логин или пароль' });
    }
    if (dbUser.is_banned) {
        return res.json({ success: false, message: 'Ваш аккаунт заблокирован' });
    }
    if (hwid) {
        await sql `UPDATE users SET hwid = ${hwid} WHERE id = ${dbUser.id}`;
        dbUser.hwid = hwid;
    }
    return res.json({ success: true, message: 'Вход выполнен!', data: mapUserFromDb(dbUser) });
});
// Register
router.post('/register', async (req, res) => {
    const sql = getDb();
    await ensureUserSchema();
    const { username, email, password, hwid } = req.body;
    const existingUser = await sql `
    SELECT * FROM users WHERE username = ${username} OR email = ${email}
  `;
    if (existingUser.length > 0) {
        const existing = existingUser[0];
        if (existing.username === username) {
            return res.json({ success: false, message: 'Пользователь с таким логином уже существует' });
        }
        if (existing.email === email) {
            return res.json({ success: false, message: 'Email уже зарегистрирован' });
        }
    }
    const verificationCode = generateVerificationCode();
    const codeExpires = new Date(Date.now() + 10 * 60 * 1000);
    const hashedPassword = await hashPassword(password);
    const result = await sql `
    INSERT INTO users (username, email, password, verification_code, verification_code_expires, email_verified, hwid) 
    VALUES (${username}, ${email}, ${hashedPassword}, ${verificationCode}, ${codeExpires}, false, ${hwid}) 
    RETURNING id, username, email, subscription, subscription_end_date, registered_at, is_admin, is_banned, email_verified, settings, avatar, hwid
  `;
    const user = mapUserFromDb(result[0]);
    const emailSent = await sendVerificationEmail(email, username, verificationCode);
    if (!emailSent) {
        await sql `DELETE FROM users WHERE id = ${result[0].id}`;
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
router.post('/resend-code', async (req, res) => {
    const sql = getDb();
    const { userId } = req.body;
    if (!userId) {
        return res.json({ success: false, message: 'Не указан ID пользователя' });
    }
    const result = await sql `SELECT * FROM users WHERE id = ${userId}`;
    if (result.length === 0) {
        return res.json({ success: false, message: 'Пользователь не найден' });
    }
    const user = result[0];
    if (user.email_verified) {
        return res.json({ success: false, message: 'Email уже подтвержден' });
    }
    const verificationCode = generateVerificationCode();
    const codeExpires = new Date(Date.now() + 10 * 60 * 1000);
    await sql `
    UPDATE users SET verification_code = ${verificationCode}, verification_code_expires = ${codeExpires} WHERE id = ${userId}
  `;
    const emailSent = await sendVerificationEmail(user.email, user.username, verificationCode);
    if (emailSent) {
        return res.json({ success: true, message: 'Новый код отправлен на email' });
    }
    return res.json({ success: false, message: 'Ошибка отправки кода' });
});
// Verify code
router.post('/verify-code', async (req, res) => {
    const sql = getDb();
    const { userId, code } = req.body;
    if (!userId || !code) {
        return res.json({ success: false, message: 'Не указан ID пользователя или код' });
    }
    const result = await sql `SELECT * FROM users WHERE id = ${userId}`;
    if (result.length === 0) {
        return res.json({ success: false, message: 'Пользователь не найден' });
    }
    const user = result[0];
    if (new Date() > new Date(user.verification_code_expires)) {
        return res.json({ success: false, message: 'Код истек. Запросите новый код.' });
    }
    if (user.verification_code !== code) {
        return res.json({ success: false, message: 'Неверный код подтверждения' });
    }
    await sql `
    UPDATE users SET email_verified = true, verification_code = NULL, verification_code_expires = NULL WHERE id = ${userId}
  `;
    return res.json({ success: true, message: 'Email успешно подтвержден!' });
});
// Forgot password
router.post('/forgot-password', async (req, res) => {
    const sql = getDb();
    await ensureUserSchema();
    const { email } = req.body;
    if (!email) {
        return res.json({ success: false, message: 'Укажите email' });
    }
    const result = await sql `SELECT * FROM users WHERE email = ${email}`;
    if (result.length === 0) {
        return res.json({ success: false, message: 'Пользователь с таким email не найден' });
    }
    const user = result[0];
    const resetCode = generateVerificationCode();
    const codeExpires = new Date(Date.now() + 10 * 60 * 1000);
    await sql `
    UPDATE users SET reset_code = ${resetCode}, reset_code_expires = ${codeExpires} WHERE id = ${user.id}
  `;
    const emailSent = await sendPasswordResetEmail(email, user.username, resetCode);
    if (emailSent) {
        return res.json({ success: true, message: 'Код отправлен на email', userId: user.id });
    }
    return res.json({ success: false, message: 'Ошибка отправки кода' });
});
// Verify reset code
router.post('/verify-reset-code', async (req, res) => {
    const sql = getDb();
    const { userId, code } = req.body;
    if (!userId || !code) {
        return res.json({ success: false, message: 'Не указан ID пользователя или код' });
    }
    const result = await sql `SELECT * FROM users WHERE id = ${userId}`;
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
router.post('/reset-password', async (req, res) => {
    const sql = getDb();
    const { userId, code, newPassword } = req.body;
    if (!userId || !code || !newPassword) {
        return res.json({ success: false, message: 'Заполните все поля' });
    }
    if (newPassword.length < 6) {
        return res.json({ success: false, message: 'Пароль должен быть минимум 6 символов' });
    }
    const result = await sql `SELECT * FROM users WHERE id = ${userId}`;
    if (result.length === 0) {
        return res.json({ success: false, message: 'Пользователь не найден' });
    }
    const user = result[0];
    if (!user.reset_code || user.reset_code !== code) {
        return res.json({ success: false, message: 'Неверный код подтверждения' });
    }
    if (new Date() > new Date(user.reset_code_expires)) {
        return res.json({ success: false, message: 'Код истек' });
    }
    const hashedPassword = await hashPassword(newPassword);
    await sql `
    UPDATE users SET password = ${hashedPassword}, reset_code = NULL, reset_code_expires = NULL WHERE id = ${userId}
  `;
    return res.json({ success: true, message: 'Пароль успешно изменен!' });
});
// Health check endpoint for auth service
router.get('/check', async (_req, res) => {
    try {
        const sql = getDb();
        await ensureUserSchema();
        await sql `SELECT 1`;
        return res.json({
            status: 'ok',
            service: 'auth',
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Auth check error:', error);
        return res.status(500).json({
            status: 'error',
            service: 'auth',
            timestamp: new Date().toISOString(),
            error: 'Database connection issue'
        });
    }
});
export default router;
