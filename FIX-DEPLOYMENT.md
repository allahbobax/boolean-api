# Исправление 500 ошибок на API

## Проблема
API возвращал 500 Internal Server Error на всех эндпоинтах из-за неправильной инициализации Redis клиента.

## Причина
- Redis клиент инициализировался с `undefined` значениями если переменные окружения не были установлены
- Middleware `generalLimiter` и `csrfProtection` падали при попытке обращения к Redis
- Не было проверки наличия критичных переменных окружения

## Что исправлено

### 1. Rate Limiting (`api/lib/rateLimit.ts`)
- ✅ Добавлена проверка переменных `UPSTASH_REDIS_REST_URL` и `UPSTASH_REDIS_REST_TOKEN`
- ✅ Redis клиент инициализируется только если переменные заданы
- ✅ Graceful fallback - если Redis не настроен, rate limiting отключается с предупреждением

### 2. CSRF Protection (`api/lib/csrf.ts`)
- ✅ Добавлена проверка переменных окружения
- ✅ Graceful fallback - если Redis не настроен, CSRF проверка пропускается
- ✅ Обработка ошибок при работе с Redis

### 3. API Key Auth (`api/lib/apiKeyAuth.ts`)
- ✅ Добавлены `/` и `/csrf-token` в список публичных роутов

### 4. Главный файл (`api/index.ts`)
- ✅ Добавлена проверка всех критичных переменных окружения при старте
- ✅ Логирование отсутствующих переменных

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
git commit -m "fix: graceful fallback for Redis and env validation"
git push
```

Vercel автоматически задеплоит изменения.

## Проверка

После деплоя проверьте:

1. Логи в Vercel Dashboard - должны появиться сообщения о проверке переменных окружения
2. Эндпоинты:
   - `GET /` - должен вернуть `{"status":"ok"}`
   - `GET /health/ping` - должен работать
   - `GET /status` - должен работать

Если видите предупреждения о Redis - добавьте переменные `UPSTASH_REDIS_REST_URL` и `UPSTASH_REDIS_REST_TOKEN` в настройках Vercel.
