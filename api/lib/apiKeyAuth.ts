import { Request, Response, NextFunction } from 'express';

// API Key для внутренних запросов (сайт, лаунчер)
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

// Публичные роуты которые не требуют API ключа
const PUBLIC_ROUTES = [
  '/health',
  '/auth/login',
  '/auth/register',
  '/auth/verify-email',
  '/auth/resend-verification',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/check', // health check для status page
  '/oauth',
  '/status',
  '/incidents', // публичный для status page
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
  
  // Логируем для отладки
  console.log(`[apiKeyAuth] Path: ${path}, Has API Key: ${!!req.headers['x-api-key']}`);
  
  // Пропускаем публичные роуты
  if (PUBLIC_ROUTES.some(route => path.startsWith(route))) {
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
  
  if (!apiKey || apiKey !== INTERNAL_API_KEY) {
    console.log(`[apiKeyAuth] Access denied for path: ${path}`);
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
  
  if (!INTERNAL_API_KEY || !apiKey || apiKey !== INTERNAL_API_KEY) {
    return res.status(403).json({ 
      success: false, 
      message: 'Access denied' 
    });
  }
  
  next();
}
