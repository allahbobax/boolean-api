/**
 * Cloudflare Turnstile server-side verification
 */
import { logger } from './logger';
import { fetchWithTimeout } from './fetchWithTimeout';

const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY

if (!TURNSTILE_SECRET_KEY) {
  console.warn('⚠️ TURNSTILE_SECRET_KEY not set! Turnstile verification will be skipped in development.')
}
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

interface TurnstileVerifyResponse {
  success: boolean
  'error-codes'?: string[]
  challenge_ts?: string
  hostname?: string
}

export async function verifyTurnstileToken(token: string, remoteIp?: string): Promise<boolean> {
  // Если секретный ключ не настроен, пропускаем проверку (для dev окружения)
  if (!TURNSTILE_SECRET_KEY) {
    console.warn('TURNSTILE_SECRET_KEY not configured, skipping verification')
    return true
  }

  if (!token) {
    return false
  }

  try {
    const formData = new URLSearchParams()
    formData.append('secret', TURNSTILE_SECRET_KEY)
    formData.append('response', token)
    if (remoteIp) {
      formData.append('remoteip', remoteIp)
    }

    const response = await fetchWithTimeout(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    }, 3000) // Уменьшен таймаут с 5s до 3s

    const data: TurnstileVerifyResponse = await response.json()

    if (!data.success) {
      logger.warn('Turnstile verification failed', { errorCodes: data['error-codes'] })
    }

    return data.success
  } catch (error) {
    logger.error('Turnstile verification error', { ip: remoteIp })
    return false
  }
}
