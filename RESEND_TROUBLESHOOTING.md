# Решение проблемы 403 с Resend

## Возможные причины ошибки 403

### 1. API ключ не установлен или неверный

**Проверь:**
- В Vercel Dashboard → Settings → Environment Variables должна быть переменная `RESEND_API_KEY`
- Ключ должен начинаться с `re_`
- Ключ должен быть активным в панели Resend

**Как получить правильный ключ:**
1. Зайди на https://resend.com/api-keys
2. Создай новый API ключ или скопируй существующий
3. Добавь его в Vercel Environment Variables

### 2. Домен не верифицирован в Resend

**Проверь:**
- В Resend Dashboard → Domains должен быть добавлен домен `booleanclient.ru`
- Статус домена должен быть "Verified" (зеленая галочка)
- DNS записи должны быть правильно настроены

**Как верифицировать домен:**
1. Зайди на https://resend.com/domains
2. Добавь домен `booleanclient.ru`
3. Добавь DNS записи (SPF, DKIM, DMARC) в настройки домена
4. Дождись верификации (может занять до 48 часов)

### 3. Email адрес отправителя не соответствует домену

В коде используется: `noreply@booleanclient.ru`

**Убедись что:**
- Домен `booleanclient.ru` верифицирован в Resend
- Или используй тестовый email: `onboarding@resend.dev` (только для разработки)

### 4. Превышен лимит отправки

**Проверь:**
- В Resend Dashboard → Usage смотри лимиты
- Free план: 100 писем/день, 3000/месяц
- Если превышен - апгрейдни план

## Быстрая диагностика

### Шаг 1: Проверь переменные окружения на Vercel

```bash
# В Vercel Dashboard
Settings → Environment Variables → RESEND_API_KEY
```

### Шаг 2: Проверь логи

После обновления кода с улучшенным логированием, смотри логи в Vercel:

```bash
# В Vercel Dashboard
Deployments → [твой деплой] → Functions → Logs
```

Ищи строки с `Email sending failed` - там будет детальная информация об ошибке.

### Шаг 3: Тестовая отправка

Временно измени email отправителя на тестовый:

```typescript
const fromEmail = 'onboarding@resend.dev'; // Вместо noreply@booleanclient.ru
```

Если с `onboarding@resend.dev` работает - проблема в домене.

## Решение

### Вариант 1: Верифицируй домен (рекомендуется)

1. Resend Dashboard → Domains → Add Domain
2. Добавь `booleanclient.ru`
3. Скопируй DNS записи
4. Добавь их в настройки домена у регистратора
5. Дождись верификации

### Вариант 2: Используй тестовый email (временно)

Измени в `backend-vercel/api/lib/email.ts`:

```typescript
const fromEmail = 'onboarding@resend.dev';
```

**Важно:** Это только для тестирования! В продакшене нужен верифицированный домен.

## Проверка после исправления

1. Задеплой изменения на Vercel
2. Попробуй зарегистрироваться с новым email
3. Проверь логи в Vercel Dashboard
4. Если видишь `Email sent successfully` - всё работает!

## Дополнительная информация

- Resend Docs: https://resend.com/docs
- Resend API Reference: https://resend.com/docs/api-reference/emails/send-email
- Vercel Environment Variables: https://vercel.com/docs/environment-variables
