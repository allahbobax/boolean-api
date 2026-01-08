# Исправление 500 ошибок на API

## Проблема
API возвращал 500 Internal Server Error на всех эндпоинтах.

## Причины
1. **Неправильная конфигурация Vercel** - `vercel.json` использовал устаревший формат с `builds` и `routes`
2. Redis клиент инициализировался с `undefined` значениями если переменные окружения не были установлены
3. Middleware `generalLimiter` и `csrfProtection` падали при попытке обращения к Redis
4. Не было проверки наличия критичных переменных окружения

## Что исправлено

### 1. Vercel Configuration (`vercel.json`)
- ✅ Упрощена конфигурация - используется `rewrites` вместо `builds` и `routes`
- ✅ Vercel автоматически определяет serverless функции в папке `/api`
- ✅ CORS настраивается в Express приложении, не в Vercel

### 2. Rate Limiting (`api/lib/rateLimit.ts`)
- ✅ Добавлена проверка переменных `UPSTASH_REDIS_REST_URL` и `UPSTASH_REDIS_REST_TOKEN`
- ✅ Redis клиент инициализируется только если переменные заданы
- ✅ Graceful fallback - если Redis не настроен, rate limiting отключается с предупреждением

### 3. CSRF Protection (`api/lib/csrf.ts`)
- ✅ Добавлена проверка переменных окружения
- ✅ Graceful fallback - если Redis не настроен, CSRF проверка пропускается
- ✅ Обработка ошибок при работе с Redis

### 4. API Key Auth (`api/lib/apiKeyAuth.ts`)
- ✅ Добавлены `/` и `/csrf-token` в список публичных роутов

### 5. Главный файл (`api/index.ts`)
- ✅ Добавлена проверка всех критичных переменных окружения при старте
- ✅ Логирование отсутствующих переменных
- ✅ Улучшено логирование ошибок (добавлено сообщение об ошибке)

## Что нужно проверить в Vercel

Убедитесь, что в настройках проекта Vercel установлены следующие переменные:

### Критичные (обязательные):
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - секретный ключ для JWT (минимум 32 символа)
- `INTERNAL_API_KEY` - API ключ для внутренних запросов

### Важные (для полной функциональности):
- `UPSTASH_REDIS_REST_URL` - URL вашего Upstash Redis
- `UPSTASH_REDIS_REST_TOKEN` - токен для Upstash Redis
- `RESEND_API_KEY` - ключ для отправки email
- `TURNSTILE_SECRET_KEY` - ключ Cloudflare Turnstile

### Опциональные:
- OAuth провайдеры (GitHub, Google, Yandex)
- `FRONTEND_URL` - URL фронтенда
- `NODE_ENV=production`

## Деплой

После коммита изменений:

```bash
cd backend-vercel
git add .
git commit -m "fix: vercel serverless configuration and graceful fallbacks"
git push
```

Vercel автоматически задеплоит изменения.

## Проверка

После деплоя проверьте:

1. Логи в Vercel Dashboard - должны появиться сообщения о проверке переменных окружения
2. Эндпоинты:
   - `GET /` - должен вернуть `{"status":"ok","timestamp":"..."}`
   - `GET /health/ping` - должен работать
   - `GET /status` - должен работать

Если видите предупреждения о Redis - добавьте переменные `UPSTASH_REDIS_REST_URL` и `UPSTASH_REDIS_REST_TOKEN` в настройках Vercel.

## Структура проекта для Vercel

```
backend-vercel/
├── api/
│   ├── index.ts          # Express приложение (экспортируется для Vercel)
│   ├── server.ts         # Локальный сервер для разработки
│   ├── lib/              # Утилиты и middleware
│   └── routes/           # API роуты
├── vercel.json           # Конфигурация Vercel (упрощенная)
└── package.json
```

Vercel автоматически создает serverless функцию из `api/index.ts` благодаря экспорту Express app.
