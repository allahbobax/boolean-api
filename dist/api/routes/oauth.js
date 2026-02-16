"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jwt_1 = require("../lib/jwt");
const userMapper_1 = require("../lib/userMapper");
const oauth_1 = require("../lib/oauth");
const logger_1 = require("../lib/logger");
const router = (0, express_1.Router)();
// БЕЗОПАСНОСТЬ: Проверка настройки OAuth провайдеров
const isOAuthConfigured = () => {
    const hasGoogle = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    const hasDiscord = !!(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);
    return { hasGoogle, hasDiscord };
};
// OAuth redirect
router.get('/:provider', async (req, res) => {
    const provider = req.params.provider;
    const redirect = req.query.redirect;
    const hwid = req.query.hwid;
    if (!['google', 'discord'].includes(provider)) {
        return res.status(400).json({ success: false, message: 'Invalid provider' });
    }
    // БЕЗОПАСНОСТЬ: Проверяем настройку провайдера
    const config = isOAuthConfigured();
    if (provider === 'google' && !config.hasGoogle) {
        return res.status(503).json({ success: false, message: 'Google OAuth не настроен' });
    }
    if (provider === 'discord' && !config.hasDiscord) {
        return res.status(503).json({ success: false, message: 'Discord OAuth не настроен' });
    }
    // Убираем trailing slash если есть, чтобы избежать двойных слешей
    const rawFrontendUrl = process.env.FRONTEND_URL || 'https://xisedlc.lol';
    const frontendUrl = rawFrontendUrl.replace(/\/$/, '');
    // API URL для callback (так как API на поддомене)
    const apiUrl = process.env.API_URL || 'https://api.xisedlc.lol';
    const cleanApiUrl = apiUrl.replace(/\/$/, '');
    const isLauncher = redirect === 'launcher';
    // Callback должен идти на API, а не на фронтенд
    const redirectUri = `${cleanApiUrl}/oauth/${provider}/callback`;
    const stateObj = {
        source: isLauncher ? 'launcher' : 'web',
        hwid: hwid || null
    };
    const state = (0, oauth_1.encodeState)(stateObj);
    const urls = {
        google: `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent('profile email')}&access_type=offline&state=${state}`,
        discord: `https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent('identify email')}&state=${state}`
    };
    // LOGGING: Отладочная информация для поиска проблемы с redirect_uri
    // console.log(`OAuth Start [${provider}]: Generated redirectUri: "${redirectUri}"`);
    // console.log(`OAuth Start [${provider}]: FRONTEND_URL: "${process.env.FRONTEND_URL}"`);
    // console.log(`OAuth Start [${provider}]: Full Auth URL: "${urls[provider]}"`);
    return res.redirect(urls[provider]);
});
// OAuth callback
router.get('/:provider/callback', async (req, res) => {
    const provider = req.params.provider;
    const code = req.query.code;
    const error = req.query.error;
    const state = req.query.state;
    const redirect = req.query.redirect;
    // Убираем trailing slash если есть
    const rawFrontendUrl = process.env.FRONTEND_URL || 'https://xisedlc.lol';
    const frontendUrl = rawFrontendUrl.replace(/\/$/, '');
    // API URL для callback
    const apiUrl = process.env.API_URL || 'https://api.xisedlc.lol';
    const cleanApiUrl = apiUrl.replace(/\/$/, '');
    const stateData = (0, oauth_1.decodeState)(state || null);
    const isLauncher = redirect === 'launcher' || stateData.source === 'launcher';
    const hwid = stateData.hwid;
    // LOGGING: Отладка входящего callback
    // console.log(`OAuth Callback [${provider}]: code=${code?.substring(0, 10)}... state=${state}`);
    // console.log(`OAuth Callback [${provider}]: redirectUri=${cleanApiUrl}/oauth/${provider}/callback`);
    // console.log(`OAuth Callback [${provider}]: Decoded state:`, JSON.stringify(stateData));
    if (error || !code) {
        if (isLauncher) {
            return res.redirect(`http://127.0.0.1:3000/callback?error=${provider}_failed`);
        }
        return res.redirect(`${frontendUrl}/dashboard?error=${provider}_failed`);
    }
    try {
        // Callback URI должен совпадать с тем, что был при старте
        const redirectUri = `${cleanApiUrl}/oauth/${provider}/callback`;
        // LOGGING: Отладка входящего callback
        // console.log(`OAuth Callback [${provider}]: code=${code?.substring(0, 10)}... state=${state}`);
        // console.log(`OAuth Callback [${provider}]: redirectUri=${redirectUri}`);
        let profile;
        // console.log(`OAuth Callback [${provider}]: Start handling provider...`);
        switch (provider) {
            case 'google':
                profile = await (0, oauth_1.handleGoogle)(code, redirectUri);
                break;
            case 'discord':
                profile = await (0, oauth_1.handleDiscord)(code, redirectUri);
                break;
            default:
                throw new Error('Invalid provider');
        }
        // console.log(`OAuth Callback [${provider}]: Provider handled successfully, profile id: ${profile.id}`);
        // console.log(`OAuth Callback [${provider}]: Find or create user...`);
        const user = await (0, oauth_1.findOrCreateOAuthUser)(profile, provider, hwid);
        // console.log(`OAuth Callback [${provider}]: User found/created: ${user.id}`);
        const token = await (0, jwt_1.generateToken)(user);
        const userData = (0, userMapper_1.mapOAuthUser)(user, token);
        const encodedUser = encodeURIComponent(JSON.stringify(userData));
        if (isLauncher) {
            return res.redirect(`http://127.0.0.1:3000/callback?user=${encodedUser}`);
        }
        return res.redirect(`${frontendUrl}/dashboard?auth=success&user=${encodedUser}`);
    }
    catch (err) {
        logger_1.logger.error('OAuth callback failed', { provider, ip: req.ip, error: err });
        // console.error(`OAuth Callback [${provider}]: FAILED`, err);
        if (isLauncher) {
            return res.redirect(`http://127.0.0.1:3000/callback?error=${provider}_failed`);
        }
        return res.redirect(`${frontendUrl}/dashboard?error=${provider}_failed`);
    }
});
// Exchange code for launcher
router.get('/:provider/exchange', async (req, res) => {
    const provider = req.params.provider;
    const code = req.query.code;
    const source = req.query.source;
    const state = req.query.state;
    if (!code) {
        return res.redirect(`http://127.0.0.1:3000/callback?error=no_code`);
    }
    const stateData = (0, oauth_1.decodeState)(state || null);
    const hwid = stateData.hwid;
    if (source !== 'launcher') {
        return res.status(400).json({ success: false, message: 'Invalid source' });
    }
    try {
        // Убираем trailing slash если есть
        const rawFrontendUrl = process.env.FRONTEND_URL || 'https://xisedlc.lol';
        const frontendUrl = rawFrontendUrl.replace(/\/$/, '');
        const redirectUri = `${frontendUrl}/api/oauth/${provider}/callback`;
        let profile;
        switch (provider) {
            case 'google':
                profile = await (0, oauth_1.handleGoogle)(code, redirectUri);
                break;
            case 'discord':
                profile = await (0, oauth_1.handleDiscord)(code, redirectUri);
                break;
            default:
                throw new Error('Invalid provider');
        }
        const user = await (0, oauth_1.findOrCreateOAuthUser)(profile, provider, hwid);
        const token = await (0, jwt_1.generateToken)(user);
        const userData = (0, userMapper_1.mapOAuthUser)(user, token);
        const encodedUser = encodeURIComponent(JSON.stringify(userData));
        return res.redirect(`http://127.0.0.1:3000/callback?user=${encodedUser}`);
    }
    catch (err) {
        logger_1.logger.error('OAuth exchange failed', { provider, ip: req.ip });
        return res.redirect(`http://127.0.0.1:3000/callback?error=${provider}_failed`);
    }
});
exports.default = router;
