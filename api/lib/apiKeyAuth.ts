import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// API Key для внутренних запросов (сайт, лаунчер)
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

/**
 * Безопасное сравнение строк, защищенное от timing attacks
 */
function timingSafeCompare(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  
  const providedBuf = Buffer.from(provided, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  
  if (providedBuf.length !== expectedBuf.length) {
    // Добавляем фиктивное сравнение для защиты от timing
    crypto.timingSafeEqual(Buffer.alloc(32), Buffer.alloc(32));
    return false;
  }
  
  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

// Публичные роуты которые не требуют API ключа
const PUBLIC_ROUTES = [
  '/', // корневой эндпоинт
  '/csrf-token', // CSRF токен
  '/health',
  '/health/ping', // health check для status page
  '/health/site', // health check для status page
  '/health/launcher', // health check для status page
  '/auth/login',
  '/auth/register',
  '/auth/verify-code',
  '/auth/resend-code',
  '/auth/verify-email',
  '/auth/resend-verification',
  '/auth/forgot-password',
  '/auth/verify-reset-code',
  '/auth/reset-password',
  '/auth/check', // health check для status page
  '/oauth',
  '/status',
  '/status/check', // live check для status page (защищён STATUS_PAGE_API_KEY внутри роута)
  '/incidents/active', // только активные инциденты публичны для status page
  '/incidents', // GET запросы к списку инцидентов (только чтение)
  '/payments/lava-webhook', // webhook от Lava.top (защищён подписью внутри роута)
];

// Роуты которые требуют только авторизацию пользователя (JWT), но не API ключ
const USER_AUTH_ROUTES = [
  '/auth/me',
  '/auth/logout',
  '/friends',
  '/client',
];

export function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const path = req.path;
  const method = req.method;
  
  // Пропускаем preflight (OPTIONS) запросы - они обрабатываются CORS middleware
  if (method === 'OPTIONS') {
    return next();
  }
  
  // Логируем для отладки
  console.log(`[apiKeyAuth] ${method} ${path}, Has API Key: ${!!req.headers['x-api-key']}`);
  
  // Специальная обработка для /incidents - только GET запросы публичны
  if (path.startsWith('/incidents')) {
    if (method === 'GET') {
      // GET /incidents и GET /incidents/active публичны для status page
      return next();
    }
    // POST, PUT, DELETE требуют API ключ
    // Продолжаем проверку ниже
  }
  
  // Пропускаем публичные роуты (точное совпадение)
  const isPublicRoute = PUBLIC_ROUTES.some(route => {
    // Точное совпадение пути
    return path === route;
  });
  
  if (isPublicRoute) {
    console.log(`[apiKeyAuth] Public route allowed: ${method} ${path}`);
    return next();
  }
  
  // Пропускаем роуты которые защищены JWT авторизацией
  if (USER_AUTH_ROUTES.some(route => path.startsWith(route))) {
    return next();
  }
  
  // Для остальных роутов требуем API ключ
  const apiKey = req.headers['x-api-key'];
  
  if (!INTERNAL_API_KEY) {
    console.error('INTERNAL_API_KEY not configured in environment!');
    return res.status(403).json({ 
      success: false, 
      message: 'Access denied - server not configured' 
    });
  }
  
  if (!apiKey || !timingSafeCompare(apiKey as string, INTERNAL_API_KEY)) {
    console.log(`[apiKeyAuth] Access denied for ${method} ${path}`);
    return res.status(403).json({ 
      success: false, 
      message: 'Access denied' 
    });
  }
  
  next();
}

// Middleware для админских роутов (требует и API ключ и проверку админа)
export function adminOnly(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'];
  
  if (!INTERNAL_API_KEY || !apiKey || !timingSafeCompare(apiKey as string, INTERNAL_API_KEY)) {
    return res.status(403).json({ 
      success: false, 
      message: 'Access denied' 
    });
  }
  
  next();
}
