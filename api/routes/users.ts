import { Router, Request, Response } from 'express';
import type { User } from '../types';
import { getDb } from '../lib/db';
import { mapUserFromDb } from '../lib/userMapper';

const router = Router();

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

  const fields: string[] = [];
  const values: unknown[] = [];

  Object.keys(updates).forEach(key => {
    const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (dbKey === 'settings') {
      fields.push(dbKey);
      values.push(JSON.stringify(updates[key]));
    } else {
      fields.push(dbKey);
      values.push(updates[key]);
    }
  });

  if (fields.length === 0) {
    return res.json({ success: false, message: 'Нет полей для обновления' });
  }

  // Build dynamic update query
  const setClause = fields.map((f, i) => `${f} = ${i + 1}`).join(', ');
  values.push(id);

  const result = await sql.unsafe<User[]>(
    `UPDATE users SET ${setClause} 
     WHERE id = ${values.length} 
     RETURNING id, username, email, password, subscription, subscription_end_date, avatar, 
               registered_at, is_admin, is_banned, email_verified, settings, hwid`,
    values as (string | number | boolean | null)[]
  );

  if (result.length === 0) {
    return res.json({ success: false, message: 'Пользователь не найден' });
  }

  return res.json({ success: true, data: mapUserFromDb(result[0]) });
});

export default router;