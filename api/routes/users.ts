import { Router, Request, Response } from 'express';
import type { User } from '../types';
import { getDb } from '../lib/db';
import { mapUserFromDb } from '../lib/userMapper';

const router = Router();

// Whitelist разрешённых полей для обновления (защита от SQL injection)
const ALLOWED_UPDATE_FIELDS: Record<string, string> = {
  username: 'username',
  email: 'email',
  subscription: 'subscription',
  subscriptionEndDate: 'subscription_end_date',
  isAdmin: 'is_admin',
  isBanned: 'is_banned',
  emailVerified: 'email_verified',
  settings: 'settings',
  avatar: 'avatar',
  hwid: 'hwid'
};

// Get all users
router.get('/', async (_req: Request, res: Response) => {
  const sql = getDb();
  
  const result = await sql<User[]>`
    SELECT id, username, email, subscription, subscription_end_date, registered_at, 
           is_admin, is_banned, email_verified, settings, hwid 
    FROM users ORDER BY id DESC
  `;

  const users = result.map(dbUser => ({
    id: dbUser.id,
    username: dbUser.username,
    email: dbUser.email,
    subscription: dbUser.subscription,
    subscriptionEndDate: dbUser.subscription_end_date,
    registeredAt: dbUser.registered_at,
    isAdmin: dbUser.is_admin,
    isBanned: dbUser.is_banned,
    emailVerified: dbUser.email_verified,
    settings: dbUser.settings,
    hwid: dbUser.hwid
  }));

  return res.json({ success: true, data: users });
});

// Get user by ID
router.get('/:id', async (req: Request, res: Response) => {
  const sql = getDb();
  const id = req.params.id;

  const result = await sql<User[]>`
    SELECT id, username, email, password, subscription, subscription_end_date, avatar, 
           registered_at, is_admin, is_banned, email_verified, settings, hwid 
    FROM users WHERE id = ${id}
  `;

  if (result.length === 0) {
    return res.json({ success: false, message: 'Пользователь не найден' });
  }

  return res.json({ success: true, data: mapUserFromDb(result[0]) });
});


// Update user
router.patch('/:id', async (req: Request, res: Response) => {
  const sql = getDb();
  const id = req.params.id;
  const updates = req.body;

  // Валидация ID
  if (!/^\d+$/.test(id)) {
    return res.json({ success: false, message: 'Неверный ID пользователя' });
  }

  // Фильтруем только разрешённые поля (защита от SQL injection)
  const safeUpdates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (ALLOWED_UPDATE_FIELDS[key]) {
      safeUpdates[key] = key === 'settings' ? JSON.stringify(value) : value;
    }
  }

  if (Object.keys(safeUpdates).length === 0) {
    return res.json({ success: false, message: 'Нет полей для обновления' });
  }

  // Безопасное обновление с параметризованными запросами
  // Используем отдельные запросы для каждого поля вместо динамического SQL
  try {
    for (const [key, value] of Object.entries(safeUpdates)) {
      const dbField = ALLOWED_UPDATE_FIELDS[key];
      // Используем параметризованный запрос для каждого поля
      await sql`UPDATE users SET ${sql(dbField)} = ${value} WHERE id = ${id}`;
    }

    const result = await sql<User[]>`
      SELECT id, username, email, password, subscription, subscription_end_date, avatar, 
             registered_at, is_admin, is_banned, email_verified, settings, hwid 
      FROM users WHERE id = ${id}
    `;

    if (result.length === 0) {
      return res.json({ success: false, message: 'Пользователь не найден' });
    }

    return res.json({ success: true, data: mapUserFromDb(result[0]) });
  } catch (error) {
    console.error('Update user error:', error);
    return res.json({ success: false, message: 'Ошибка обновления пользователя' });
  }
});

export default router;