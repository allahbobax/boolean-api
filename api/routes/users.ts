import { Router, Request, Response } from 'express';
import type { User } from '../types';
import { getDb } from '../lib/db';
import { mapUserFromDb } from '../lib/userMapper';
import validator from 'validator';

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
           is_admin, is_banned, email_verified, settings, hwid, avatar 
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
    hwid: dbUser.hwid,
    avatar: dbUser.avatar
  }));

  return res.json({ success: true, data: users });
});

// Get user by ID
router.get('/:id', async (req: Request, res: Response) => {
  const sql = getDb();
  const id = req.params.id;

  const result = await sql<User[]>`
    SELECT id, username, email, subscription, subscription_end_date, avatar, 
           registered_at, is_admin, is_banned, email_verified, settings, hwid 
    FROM users WHERE id = ${id}
  `;

  if (result.length === 0) {
    return res.json({ success: false, message: 'Пользователь не найден' });
  }

  return res.json({ success: true, data: mapUserFromDb(result[0]) });
});


// Функции валидации
function validateUserId(id: string): boolean {
  // Проверяем, что это положительное целое число в разумных пределах
  const numId = parseInt(id, 10);
  return Number.isInteger(numId) && numId > 0 && numId <= 2147483647; // MAX_INT32
}

function validateEmail(email: string): boolean {
  return validator.isEmail(email) && email.length <= 254; // RFC 5321 limit
}

function validateUsername(username: string): boolean {
  // Только буквы, цифры, подчеркивания и дефисы, длина 3-30 символов
  return /^[a-zA-Z0-9_-]{3,30}$/.test(username);
}

// Update user
router.patch('/:id', async (req: Request, res: Response) => {
  const sql = getDb();
  const id = req.params.id;
  const updates = req.body;

  // Усиленная валидация ID
  if (!validateUserId(id)) {
    return res.status(400).json({ 
      success: false, 
      message: 'Неверный формат ID пользователя' 
    });
  }

  // Валидация входных данных
  if (updates.email && !validateEmail(updates.email)) {
    return res.status(400).json({ 
      success: false, 
      message: 'Неверный формат email адреса' 
    });
  }

  if (updates.username && !validateUsername(updates.username)) {
    return res.status(400).json({ 
      success: false, 
      message: 'Username должен содержать только буквы, цифры, _ и -, длина 3-30 символов' 
    });
  }

  // Фильтруем только разрешённые поля (защита от SQL injection)
  const safeUpdates: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (ALLOWED_UPDATE_FIELDS[key]) {
      const processedValue = key === 'settings' ? JSON.stringify(value) : value;
      safeUpdates[key] = processedValue as string | number | boolean | null;
    }
  }

  if (Object.keys(safeUpdates).length === 0) {
    return res.status(400).json({ 
      success: false, 
      message: 'Нет валидных полей для обновления' 
    });
  }

  // Безопасное обновление с параметризованными запросами
  try {
    // Строим динамический запрос безопасным способом
    // Используем отдельные UPDATE для каждого поля (самый безопасный способ)
    for (const [key, value] of Object.entries(safeUpdates)) {
      const dbField = ALLOWED_UPDATE_FIELDS[key];
      await sql`UPDATE users SET ${sql(dbField)} = ${value} WHERE id = ${id}`;
    }

    const result = await sql<User[]>`
      SELECT id, username, email, subscription, subscription_end_date, avatar, 
             registered_at, is_admin, is_banned, email_verified, settings, hwid 
      FROM users WHERE id = ${id}
    `;

    if (result.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Пользователь не найден' 
      });
    }

    return res.json({ success: true, data: mapUserFromDb(result[0]) });
  } catch (error) {
    console.error('Update user error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Внутренняя ошибка сервера' 
    });
  }
});

export default router;
