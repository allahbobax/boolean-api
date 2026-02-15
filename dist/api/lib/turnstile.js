"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyTurnstileToken = verifyTurnstileToken;
/**
 * Cloudflare Turnstile server-side verification
 */
const logger_1 = require("./logger");
const fetchWithTimeout_1 = require("./fetchWithTimeout");
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY;
if (!TURNSTILE_SECRET_KEY) {
    console.warn('⚠️ TURNSTILE_SECRET_KEY not set! Turnstile verification will be skipped in development.');
}
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
async function verifyTurnstileToken(token, remoteIp) {
    // Если секретный ключ не настроен, пропускаем проверку (для dev окружения)
    if (!TURNSTILE_SECRET_KEY) {
        console.warn('TURNSTILE_SECRET_KEY not configured, skipping verification');
        return true;
    }
    if (!token) {
        return false;
    }
    try {
        const formData = new URLSearchParams();
        formData.append('secret', TURNSTILE_SECRET_KEY);
        formData.append('response', token);
        if (remoteIp) {
            formData.append('remoteip', remoteIp);
        }
        const response = await (0, fetchWithTimeout_1.fetchWithTimeout)(TURNSTILE_VERIFY_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formData.toString(),
        }, 3000); // Уменьшен таймаут с 5s до 3s
        const data = await response.json();
        if (!data.success) {
            logger_1.logger.warn('Turnstile verification failed', { errorCodes: data['error-codes'] });
        }
        return data.success;
    }
    catch (error) {
        logger_1.logger.error('Turnstile verification error', { ip: remoteIp });
        return false;
    }
}
