import { Router, Request, Response } from 'express';
import { getDb, ensureLicenseKeysTable } from '../lib/db';
import { logger } from '../lib/logger';
import crypto from 'crypto';

const router = Router();

const LAVA_API_URL = 'https://gate.lava.top/api/v2';
const LAVA_API_KEY = process.env.LAVA_API_KEY;

// Маппинг продуктов на offerId в Lava.top (нужно заменить на реальные ID из панели lava.top)
const PRODUCT_OFFER_MAP: Record<string, string> = {
  'client-30': process.env.LAVA_OFFER_CLIENT_30 || '',
  'client-90': process.env.LAVA_OFFER_CLIENT_90 || '',
  'client-lifetime': process.env.LAVA_OFFER_CLIENT_LIFETIME || '',
  'hwid-reset': process.env.LAVA_OFFER_HWID_RESET || '',
  'alpha': process.env.LAVA_OFFER_ALPHA || '',
  'premium-30': process.env.LAVA_OFFER_PREMIUM_30 || '',
};

// Маппинг продуктов на длительность подписки (в днях, 0 = бессрочно)
const PRODUCT_DURATION_MAP: Record<string, number> = {
  'client-30': 30,
  'client-90': 90,
  'client-lifetime': 0,
  'hwid-reset': 0,
  'alpha': 0,
  'premium-30': 30,
};

// Маппинг продуктов на тип подписки
const PRODUCT_SUBSCRIPTION_MAP: Record<string, string> = {
  'client-30': 'premium',
  'client-90': 'premium',
  'client-lifetime': 'premium',
  'hwid-reset': 'free', // Не меняет подписку
  'alpha': 'alpha',
  'premium-30': 'premium',
};

// Таблица для хранения заказов
async function ensureOrdersTable() {
  const db = getDb();
  try {
    await db`
      CREATE TABLE IF NOT EXISTS payment_orders (
        id SERIAL PRIMARY KEY,
        order_id VARCHAR(255) UNIQUE NOT NULL,
        user_id INTEGER REFERENCES users(id),
        product_id VARCHAR(100) NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'RUB',
        status VARCHAR(50) DEFAULT 'pending',
        lava_invoice_id VARCHAR(255),
        payment_url TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        paid_at TIMESTAMP WITH TIME ZONE,
        metadata JSONB DEFAULT '{}'
      )
    `;
  } catch (error) {
    logger.error('Ensure payment_orders table error:', { error });
  }
}

// Генерация уникального ID заказа
function generateOrderId(): string {
  return `order_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
}

// Генерация лицензионного ключа
function generateLicenseKey(): string {
  const segments = [];
  for (let i = 0; i < 4; i++) {
    segments.push(crypto.randomBytes(2).toString('hex').toUpperCase());
  }
  return segments.join('-');
}

// POST /payments/create-order - Создание заказа и получение ссылки на оплату
router.post('/create-order', async (req: Request, res: Response) => {
  try {
    await ensureOrdersTable();
    
    const { productId, userId, email } = req.body;

    if (!productId || !userId || !email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Необходимо указать productId, userId и email' 
      });
    }

    if (!LAVA_API_KEY) {
      logger.error('LAVA_API_KEY not configured');
      return res.status(500).json({ 
        success: false, 
        message: 'Платежная система не настроена' 
      });
    }

    const offerId = PRODUCT_OFFER_MAP[productId];
    if (!offerId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Неизвестный продукт или offerId не настроен' 
      });
    }

    const sql = getDb();
    
    // Проверяем существование пользователя
    const userResult = await sql`SELECT id, email FROM users WHERE id = ${userId}`;
    if (userResult.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Пользователь не найден' 
      });
    }

    const orderId = generateOrderId();
    const successUrl = `${process.env.FRONTEND_URL || 'https://booleanclient.ru'}/payment/success?orderId=${orderId}`;
    const failUrl = `${process.env.FRONTEND_URL || 'https://booleanclient.ru'}/payment/fail?orderId=${orderId}`;

    // Создаем платежную ссылку через Lava.top API
    const lavaResponse = await fetch(`${LAVA_API_URL}/invoice/generate-payment-link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LAVA_API_KEY}`,
      },
      body: JSON.stringify({
        offerId,
        email,
        successUrl,
        failUrl,
        customData: JSON.stringify({ orderId, userId, productId }),
      }),
    });

    if (!lavaResponse.ok) {
      const errorText = await lavaResponse.text();
      logger.error('Lava API error', { status: lavaResponse.status, error: errorText });
      return res.status(500).json({ 
        success: false, 
        message: 'Ошибка при создании платежа' 
      });
    }

    const lavaData = await lavaResponse.json();
    
    // Сохраняем заказ в БД
    await sql`
      INSERT INTO payment_orders (order_id, user_id, product_id, amount, status, lava_invoice_id, payment_url, metadata)
      VALUES (
        ${orderId}, 
        ${userId}, 
        ${productId}, 
        ${lavaData.amount || 0}, 
        'pending',
        ${lavaData.invoiceId || null},
        ${lavaData.paymentUrl || lavaData.url || null},
        ${JSON.stringify({ email, offerId })}
      )
    `;

    logger.info('Payment order created', { orderId, userId, productId });

    return res.json({
      success: true,
      data: {
        orderId,
        paymentUrl: lavaData.paymentUrl || lavaData.url,
        invoiceId: lavaData.invoiceId,
      },
    });
  } catch (error) {
    logger.error('Create order error', { error });
    return res.status(500).json({ 
      success: false, 
      message: 'Внутренняя ошибка сервера' 
    });
  }
});

// POST /payments/lava-webhook - Webhook от Lava.top
router.post('/lava-webhook', async (req: Request, res: Response) => {
  try {
    await ensureOrdersTable();
    await ensureLicenseKeysTable();
    
    const webhookData = req.body;
    
    logger.info('Lava webhook received', { 
      type: webhookData.type,
      status: webhookData.status,
      invoiceId: webhookData.invoiceId 
    });

    // Проверяем API ключ от Lava.top
    const authHeader = req.headers['authorization'];
    const expectedKey = process.env.LAVA_WEBHOOK_SECRET || process.env.LAVA_API_KEY;
    
    if (expectedKey) {
      // Lava отправляет ключ как "Bearer <key>" или просто "<key>"
      const providedKey = authHeader?.replace('Bearer ', '').trim();
      
      if (!providedKey || providedKey !== expectedKey) {
        logger.warn('Lava webhook unauthorized', { providedKey: providedKey?.slice(0, 10) + '...' });
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
    }

    // Обрабатываем только успешные платежи
    if (webhookData.status !== 'completed' && webhookData.status !== 'success') {
      logger.info('Webhook status not completed', { status: webhookData.status });
      return res.json({ success: true, message: 'Webhook received' });
    }

    // Извлекаем данные заказа
    let customData: { orderId?: string; userId?: number; productId?: string } = {};
    try {
      if (webhookData.customData) {
        customData = typeof webhookData.customData === 'string' 
          ? JSON.parse(webhookData.customData) 
          : webhookData.customData;
      }
    } catch {
      logger.error('Failed to parse customData', { customData: webhookData.customData });
    }

    const { orderId, userId, productId } = customData;

    if (!orderId || !userId || !productId) {
      logger.error('Missing order data in webhook', { customData });
      return res.status(400).json({ 
        success: false, 
        message: 'Missing order data' 
      });
    }

    const sql = getDb();

    // Проверяем, не обработан ли уже этот заказ
    const existingOrder = await sql`
      SELECT * FROM payment_orders WHERE order_id = ${orderId}
    `;

    if (existingOrder.length > 0 && existingOrder[0].status === 'completed') {
      logger.info('Order already processed', { orderId });
      return res.json({ success: true, message: 'Order already processed' });
    }

    // Обновляем статус заказа
    await sql`
      UPDATE payment_orders 
      SET status = 'completed', paid_at = CURRENT_TIMESTAMP 
      WHERE order_id = ${orderId}
    `;

    // Обрабатываем в зависимости от типа продукта
    if (productId === 'hwid-reset') {
      // Сброс HWID
      await sql`UPDATE users SET hwid = NULL WHERE id = ${userId}`;
      logger.info('HWID reset for user', { userId });
    } else {
      // Создаем и активируем лицензионный ключ
      const licenseKey = generateLicenseKey();
      const duration = PRODUCT_DURATION_MAP[productId] || 30;
      const subscriptionType = PRODUCT_SUBSCRIPTION_MAP[productId] || 'premium';

      // Создаем ключ
      await sql`
        INSERT INTO license_keys (key, product, duration_days, is_used, used_by, used_at, created_by)
        VALUES (${licenseKey}, ${subscriptionType}, ${duration}, true, ${userId}, CURRENT_TIMESTAMP, ${userId})
      `;

      // Обновляем подписку пользователя
      let subscriptionEndDate: string | null = null;
      
      if (duration > 0) {
        // Получаем текущую дату окончания подписки
        const userResult = await sql`SELECT subscription_end_date FROM users WHERE id = ${userId}`;
        const currentEndDate = userResult[0]?.subscription_end_date;
        
        // Если есть активная подписка, продлеваем от неё
        const baseDate = currentEndDate && new Date(currentEndDate) > new Date() 
          ? new Date(currentEndDate) 
          : new Date();
        
        baseDate.setDate(baseDate.getDate() + duration);
        subscriptionEndDate = baseDate.toISOString();
      }

      await sql`
        UPDATE users 
        SET subscription = ${subscriptionType}, subscription_end_date = ${subscriptionEndDate} 
        WHERE id = ${userId}
      `;

      logger.info('Subscription activated', { 
        userId, 
        productId, 
        subscriptionType, 
        duration,
        licenseKey 
      });
    }

    return res.json({ success: true, message: 'Payment processed' });
  } catch (error) {
    logger.error('Webhook processing error', { error });
    return res.status(500).json({ 
      success: false, 
      message: 'Webhook processing error' 
    });
  }
});

// GET /payments/order-status/:orderId - Проверка статуса заказа
router.get('/order-status/:orderId', async (req: Request, res: Response) => {
  try {
    await ensureOrdersTable();
    
    const { orderId } = req.params;
    const sql = getDb();

    const result = await sql`
      SELECT order_id, product_id, status, created_at, paid_at 
      FROM payment_orders 
      WHERE order_id = ${orderId}
    `;

    if (result.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Заказ не найден' 
      });
    }

    return res.json({
      success: true,
      data: {
        orderId: result[0].order_id,
        productId: result[0].product_id,
        status: result[0].status,
        createdAt: result[0].created_at,
        paidAt: result[0].paid_at,
      },
    });
  } catch (error) {
    logger.error('Get order status error', { error });
    return res.status(500).json({ 
      success: false, 
      message: 'Внутренняя ошибка сервера' 
    });
  }
});

export default router;
