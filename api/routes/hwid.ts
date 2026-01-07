import { Router, Request, Response } from 'express';
import { getDb } from '../lib/db.js';

const router = Router();

// Get HWID
router.get('/', async (req: Request, res: Response) => {
  const sql = getDb();
  const userId = req.query.userId as string;

  if (!userId) {
    return res.json({ success: false, message: 'Не указан userId' });
  }

  const result = await sql`SELECT hwid FROM users WHERE id = ${userId}`;

  if (result.length === 0) {
    return res.json({ success: false, message: 'Пользователь не найден' });
  }

  return res.json({ success: true, hwid: result[0].hwid || null });
});

// Set HWID
router.post('/set', async (req: Request, res: Response) => {
  const sql = getDb();
  const { userId, hwid } = req.body;

  if (!userId || !hwid) {
    return res.json({ success: false, message: 'Не указан userId или hwid' });
  }

  const existingHwid = await sql`
    SELECT id, username FROM users WHERE hwid = ${hwid} AND id != ${userId}
  `;

  if (existingHwid.length > 0) {
    return res.json({ success: false, message: 'Этот HWID уже привязан к другому аккаунту' });
  }

  const userResult = await sql`SELECT hwid FROM users WHERE id = ${userId}`;

  if (userResult.length === 0) {
    return res.json({ success: false, message: 'Пользователь не найден' });
  }

  const currentHwid = userResult[0].hwid;

  if (currentHwid && currentHwid !== hwid) {
    return res.json({ success: false, message: 'HWID уже привязан. Для смены требуется сброс.' });
  }

  await sql`UPDATE users SET hwid = ${hwid} WHERE id = ${userId}`;

  return res.json({ success: true, message: 'HWID успешно привязан' });
});

// Reset HWID
router.post('/reset', async (req: Request, res: Response) => {
  const sql = getDb();
  const { userId } = req.body;

  if (!userId) {
    return res.json({ success: false, message: 'Не указан userId' });
  }

  await sql`UPDATE users SET hwid = NULL WHERE id = ${userId}`;
  return res.json({ success: true, message: 'HWID успешно сброшен' });
});

// Verify HWID
router.post('/verify', async (req: Request, res: Response) => {
  const sql = getDb();
  const { userId, hwid } = req.body;

  if (!userId || !hwid) {
    return res.json({ success: false, message: 'Не указан userId или hwid' });
  }

  const result = await sql`
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
    await sql`UPDATE users SET hwid = ${hwid} WHERE id = ${userId}`;
    return res.json({ success: true, message: 'HWID привязан', subscription: user.subscription });
  }

  if (user.hwid !== hwid) {
    return res.json({ success: false, message: 'HWID не совпадает. Требуется сброс привязки.' });
  }

  return res.json({ success: true, message: 'HWID подтвержден', subscription: user.subscription });
});

export default router;