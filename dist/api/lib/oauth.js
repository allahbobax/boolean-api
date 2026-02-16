"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.findOrCreateOAuthUser = findOrCreateOAuthUser;
exports.encodeState = encodeState;
exports.decodeState = decodeState;
exports.handleGoogle = handleGoogle;
exports.handleDiscord = handleDiscord;
const db_1 = require("./db");
const crypto_1 = __importDefault(require("crypto"));
const fetchWithTimeout_1 = require("./fetchWithTimeout");
const logger_1 = require("./logger");
const OAUTH_USER_FIELDS = 'id, username, email, subscription, subscription_end_date, avatar, registered_at, is_admin, is_banned, email_verified, hwid, oauth_provider, oauth_id';
async function findOrCreateOAuthUser(profile, provider, hwid) {
    const sql = (0, db_1.getDb)();
    const email = profile.email || `${profile.id}@${provider}.oauth`;
    const username = profile.name || profile.login || `${provider}_${profile.id}`;
    const existing = await sql `SELECT ${sql.unsafe(OAUTH_USER_FIELDS)} FROM users WHERE email = ${email}`;
    if (existing.length > 0) {
        const user = existing[0];
        await sql `
      UPDATE users SET oauth_provider = ${provider}, oauth_id = ${profile.id}, email_verified = true, 
      avatar = COALESCE(${profile.avatar ?? null}, avatar), hwid = COALESCE(${hwid ?? null}, hwid) WHERE id = ${user.id}
    `;
        const updated = await sql `SELECT ${sql.unsafe(OAUTH_USER_FIELDS)} FROM users WHERE id = ${user.id}`;
        return updated[0];
    }
    let uniqueUsername = username;
    let counter = 1;
    while (true) {
        const check = await sql `SELECT id FROM users WHERE username = ${uniqueUsername}`;
        if (check.length === 0)
            break;
        uniqueUsername = `${username}_${counter}`;
        counter++;
    }
    const result = await sql `
    INSERT INTO users (username, email, oauth_provider, oauth_id, email_verified, subscription, avatar, hwid) 
    VALUES (${uniqueUsername}, ${email}, ${provider}, ${profile.id}, true, 'free', ${profile.avatar ?? null}, ${hwid ?? null}) 
    RETURNING ${sql.unsafe(OAUTH_USER_FIELDS)}
  `;
    return result[0];
}
function encodeState(stateObj) {
    // Добавляем криптографически стойкий nonce для защиты от CSRF
    const nonce = crypto_1.default.randomBytes(32).toString('hex');
    const timestamp = Date.now();
    const stateWithSecurity = {
        ...stateObj,
        nonce,
        timestamp,
        // Добавляем подпись для проверки целостности
        signature: crypto_1.default.createHmac('sha256', process.env.JWT_SECRET || 'fallback-secret')
            .update(JSON.stringify({ ...stateObj, nonce, timestamp }))
            .digest('hex')
    };
    return Buffer.from(JSON.stringify(stateWithSecurity)).toString('base64url');
}
function decodeState(stateStr) {
    if (!stateStr)
        return {};
    if (stateStr === 'launcher')
        return { source: 'launcher' };
    if (stateStr === 'web')
        return { source: 'web' };
    try {
        const decoded = Buffer.from(stateStr, 'base64url').toString('utf-8');
        // Попробуем распарсить как JSON
        if (decoded.trim().startsWith('{')) {
            const parsed = JSON.parse(decoded);
            // Проверяем подпись для защиты от подделки
            if (parsed.signature && parsed.nonce && parsed.timestamp) {
                const { signature, ...dataToVerify } = parsed;
                const expectedSignature = crypto_1.default.createHmac('sha256', process.env.JWT_SECRET || 'fallback-secret')
                    .update(JSON.stringify(dataToVerify))
                    .digest('hex');
                if (signature !== expectedSignature) {
                    logger_1.logger.warn('State signature verification failed');
                    return {};
                }
                // Проверяем время жизни state (максимум 10 минут)
                const maxAge = 10 * 60 * 1000; // 10 минут
                if (Date.now() - parsed.timestamp > maxAge) {
                    logger_1.logger.warn('State expired');
                    return {};
                }
                return parsed;
            }
            // Для старых state или без подписи (если вдруг такие есть)
            return parsed;
        }
        return { source: stateStr };
    }
    catch (error) {
        // Если не получилось распарсить как base64/json, возможно это простой текст
        return { source: stateStr };
    }
}
async function handleGoogle(code, redirectUri) {
    try {
        const params = new URLSearchParams({
            code,
            client_id: process.env.GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code'
        });
        const tokenResponse = await (0, fetchWithTimeout_1.fetchWithTimeout)('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'XiSeDLC/1.0 (https://xisedlc.lol, 1.0.0)',
                'Accept': 'application/json'
            },
            body: params
        }, 15000); // Увеличен таймаут
        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            throw new Error(`Google Token Failed: ${tokenResponse.status} ${errorText}`);
        }
        const tokens = await tokenResponse.json();
        if (!tokens.access_token)
            throw new Error('Token failed - no access_token');
        const userResponse = await (0, fetchWithTimeout_1.fetchWithTimeout)('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokens.access_token}` }
        }, 10000);
        if (!userResponse.ok) {
            const errorText = await userResponse.text();
            throw new Error(`Google UserInfo Failed: ${userResponse.status}`);
        }
        const profile = await userResponse.json();
        return { id: profile.id, email: profile.email, name: profile.name, avatar: profile.picture };
    }
    catch (error) {
        logger_1.logger.error('Google OAuth failed', { provider: 'google', error });
        throw error;
    }
}
async function handleDiscord(code, redirectUri) {
    try {
        const params = new URLSearchParams({
            client_id: process.env.DISCORD_CLIENT_ID,
            client_secret: process.env.DISCORD_CLIENT_SECRET,
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri
        });
        const tokenResponse = await (0, fetchWithTimeout_1.fetchWithTimeout)('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'XiSeDLC/1.0 (https://xisedlc.lol, 1.0.0)',
                'Accept': 'application/json'
            },
            body: params
        }, 15000); // Увеличен таймаут
        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            throw new Error(`Discord Token Failed: ${tokenResponse.status} ${errorText}`);
        }
        const tokens = await tokenResponse.json();
        if (!tokens.access_token)
            throw new Error('Token failed - no access_token');
        const userResponse = await (0, fetchWithTimeout_1.fetchWithTimeout)('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${tokens.access_token}` }
        }, 10000);
        if (!userResponse.ok) {
            const errorText = await userResponse.text();
            throw new Error(`Discord UserInfo Failed: ${userResponse.status}`);
        }
        const profile = await userResponse.json();
        const avatar = profile.avatar
            ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png?size=256`
            : null;
        return {
            id: profile.id,
            email: profile.email || `${profile.id}@discord.oauth`,
            name: profile.global_name || profile.username,
            login: profile.username,
            avatar
        };
    }
    catch (error) {
        logger_1.logger.error('Discord OAuth failed', { provider: 'discord', error });
        throw error;
    }
}
