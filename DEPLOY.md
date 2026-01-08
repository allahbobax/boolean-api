# Быстрый деплой на Vercel

## Что было исправлено
- ✅ Упрощена конфигурация `vercel.json` для serverless функций
- ✅ Добавлены graceful fallbacks для Redis (rate limiting и CSRF)
- ✅ Улучшено логирование ошибок

## Деплой

```bash
cd backend-vercel
git add .
git commit -m "fix: vercel serverless configuration"
git push
```

## Проверка после деплоя

1. Откройте `https://ваш-домен.vercel.app/`
   - Должен вернуть: `{"status":"ok","timestamp":"..."}`

2. Проверьте логи в Vercel Dashboard
   - Должны быть сообщения о проверке переменных окружения

## Если всё ещё 500 ошибки

Проверьте переменные окружения в Vercel:

**Обязательные:**
- `DATABASE_URL`
- `JWT_SECRET` 
- `INTERNAL_API_KEY`

**Для полной функциональности:**
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Без Redis переменных API будет работать, но без rate limiting и CSRF защиты.
