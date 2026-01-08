"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../lib/db");
const router = (0, express_1.Router)();
// Валидация формата HWID
function validateHWID(hwid) {
    // HWID должен быть хешем (MD5/SHA256) - 32-64 символа hex
    const hwidRegex = /^[A-F0-9]{32,64}$/i;
    return hwidRegex.test(hwid) && hwid.length >= 32 && hwid.length <= 64;
}
// Get HWID
router.get('/', async (req, res) => {
    const sql = (0, db_1.getDb)();
    const userId = req.query.userId;
    if (!userId) {
        return res.json({ success: false, message: 'Не указан userId' });
    }
    const result = await sql `SELECT hwid FROM users WHERE id = ${userId}`;
    if (result.length === 0) {
        return res.json({ success: false, message: 'Пользователь не найден' });
    }
    return res.json({ success: true, hwid: result[0].hwid || null });
});
// Set HWID
router.post('/set', async (req, res) => {
    const sql = (0, db_1.getDb)();
    const { userId, hwid } = req.body;
    if (!userId || !hwid) {
        return res.json({ success: false, message: 'Не указан userId или hwid' });
    }
    if (!validateHWID(hwid)) {
        return res.json({ success: false, message: 'Неверный формат HWID' });
    }
    try {
        // Check if HWID is already bound to another user
        const existingHwid = await sql `
      SELECT id, username FROM users WHERE hwid = ${hwid} AND id != ${userId}
    `;
        if (existingHwid.length > 0) {
            return res.json({ success: false, message: 'Этот HWID уже привязан к другому аккаунту' });
        }
        const userResult = await sql `
      SELECT hwid FROM users WHERE id = ${userId}
    `;
        if (userResult.length === 0) {
            return res.json({ success: false, message: 'Пользователь не найден' });
        }
        const currentHwid = userResult[0].hwid;
        if (currentHwid && currentHwid !== hwid) {
            return res.json({ success: false, message: 'HWID уже привязан. Для смены требуется сброс.' });
        }
        await sql `UPDATE users SET hwid = ${hwid} WHERE id = ${userId}`;
        return res.json({ success: true, message: 'HWID успешно привязан' });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Ошибка при привязке HWID';
        return res.json({ success: false, message });
    }
});
// Reset HWID
router.post('/reset', async (req, res) => {
    const sql = (0, db_1.getDb)();
    const { userId } = req.body;
    if (!userId) {
        return res.json({ success: false, message: 'Не указан userId' });
    }
    await sql `UPDATE users SET hwid = NULL WHERE id = ${userId}`;
    return res.json({ success: true, message: 'HWID успешно сброшен' });
});
// Verify HWID
router.post('/verify', async (req, res) => {
    const sql = (0, db_1.getDb)();
    const { userId, hwid } = req.body;
    if (!userId || !hwid) {
        return res.json({ success: false, message: 'Не указан userId или hwid' });
    }
    if (!validateHWID(hwid)) {
        return res.json({ success: false, message: 'Неверный формат HWID' });
    }
    try {
        const result = await sql `
      SELECT hwid, subscription, is_banned FROM users WHERE id = ${userId}
    `;
        if (result.length === 0) {
            return res.json({ success: false, message: 'Пользователь не найден' });
        }
        const user = result[0];
        if (user.is_banned) {
            return res.json({ success: false, message: 'Аккаунт заблокирован' });
        }
        if (!user.hwid) {
            // Check if HWID is already bound to another user
            const existingHwid = await sql `
        SELECT id FROM users WHERE hwid = ${hwid} AND id != ${userId}
      `;
            if (existingHwid.length > 0) {
                return res.json({ success: false, message: 'Этот HWID уже привязан к другому аккаунту' });
            }
            await sql `UPDATE users SET hwid = ${hwid} WHERE id = ${userId}`;
            return res.json({ success: true, message: 'HWID привязан', subscription: user.subscription });
        }
        if (user.hwid !== hwid) {
            return res.json({ success: false, message: 'HWID не совпадает. Требуется сброс привязки.' });
        }
        return res.json({ success: true, message: 'HWID подтвержден', subscription: user.subscription });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Ошибка при проверке HWID';
        return res.json({ success: false, message });
    }
});
exports.default = router;
