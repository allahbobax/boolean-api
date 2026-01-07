import { Router } from 'express';
import { getDb, ensureLicenseKeysTable } from '../lib/db';
const router = Router();
// Get all keys
router.get('/', async (_req, res) => {
    const sql = getDb();
    await ensureLicenseKeysTable();
    const result = await sql `
    SELECT lk.*, u.username as created_by_name, used_user.username as used_by_name 
    FROM license_keys lk 
    LEFT JOIN users u ON lk.created_by = u.id 
    LEFT JOIN users used_user ON lk.used_by = used_user.id 
    ORDER BY lk.created_at DESC
  `;
    const keys = result.map(key => ({
        id: key.id,
        key: key.key,
        product: key.product,
        duration: key.duration_days,
        isUsed: key.is_used,
        usedBy: key.used_by,
        usedAt: key.used_at,
        createdAt: key.created_at,
        createdBy: key.created_by,
        createdByName: key.created_by_name,
        usedByName: key.used_by_name
    }));
    return res.json({ success: true, data: keys });
});
// Create keys
router.post('/', async (req, res) => {
    const sql = getDb();
    await ensureLicenseKeysTable();
    const { keys } = req.body;
    if (!keys || !Array.isArray(keys) || keys.length === 0) {
        return res.status(400).json({ success: false, message: 'Неверный формат данных' });
    }
    const createdKeys = [];
    for (const keyData of keys) {
        const result = await sql `
      INSERT INTO license_keys (key, product, duration_days, created_by) 
      VALUES (${keyData.key.trim().toUpperCase()}, ${keyData.product}, ${keyData.duration}, ${keyData.createdBy}) 
      RETURNING id, key, product, duration_days, is_used, created_at
    `;
        createdKeys.push(result[0]);
    }
    return res.json({ success: true, data: createdKeys });
});
// Activate key
router.post('/activate', async (req, res) => {
    const sql = getDb();
    await ensureLicenseKeysTable();
    const { key, userId } = req.body;
    if (!key || !userId) {
        return res.status(400).json({ success: false, message: 'Ключ и ID пользователя обязательны' });
    }
    const keyResult = await sql `
    SELECT * FROM license_keys WHERE UPPER(key) = ${key.trim().toUpperCase()}
  `;
    if (keyResult.length === 0) {
        return res.json({ success: false, message: 'Ключ не найден' });
    }
    const licenseKey = keyResult[0];
    if (licenseKey.is_used) {
        return res.json({ success: false, message: 'Ключ уже использован' });
    }
    await sql `
    UPDATE license_keys 
    SET is_used = true, used_by = ${userId}, used_at = CURRENT_TIMESTAMP 
    WHERE id = ${licenseKey.id}
  `;
    let newSubscription = 'free';
    if (licenseKey.product === 'premium' || licenseKey.product === 'inside-client') {
        newSubscription = 'premium';
    }
    else if (licenseKey.product === 'alpha') {
        newSubscription = 'alpha';
    }
    await sql `UPDATE users SET subscription = ${newSubscription} WHERE id = ${userId}`;
    return res.json({
        success: true,
        message: 'Ключ активирован',
        data: {
            product: licenseKey.product,
            duration: licenseKey.duration_days,
            newSubscription
        }
    });
});
// Delete key
router.delete('/:id', async (req, res) => {
    const sql = getDb();
    const id = req.params.id;
    const result = await sql `
    DELETE FROM license_keys WHERE id = ${id} RETURNING *
  `;
    if (result.length === 0) {
        return res.json({ success: false, message: 'Ключ не найден' });
    }
    return res.json({ success: true, message: 'Ключ удален' });
});
export default router;
