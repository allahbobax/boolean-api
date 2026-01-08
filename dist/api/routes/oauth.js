"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jwt_1 = require("../lib/jwt");
const userMapper_1 = require("../lib/userMapper");
const oauth_1 = require("../lib/oauth");
const logger_1 = require("../lib/logger");
const router = (0, express_1.Router)();
// OAuth redirect
router.get('/:provider', async (req, res) => {
    const provider = req.params.provider;
    const redirect = req.query.redirect;
    const hwid = req.query.hwid;
    if (!['github', 'google', 'yandex'].includes(provider)) {
        return res.status(400).json({ success: false, message: 'Invalid provider' });
    }
    const frontendUrl = process.env.FRONTEND_URL || 'https://booleanclient.ru';
    const isLauncher = redirect === 'launcher';
    const redirectUris = {
        github: isLauncher
            ? `http://localhost:3000/api/oauth?provider=${provider}&action=callback`
            : `${frontendUrl}/api/oauth?provider=${provider}&action=callback`,
        google: `${frontendUrl}/api/oauth?provider=${provider}&action=callback`,
        yandex: `${frontendUrl}/api/oauth?provider=${provider}&action=callback`
    };
    const redirectUri = redirectUris[provider];
    const stateObj = {
        source: isLauncher ? 'launcher' : 'web',
        hwid: hwid || null
    };
    const state = (0, oauth_1.encodeState)(stateObj);
    const urls = {
        github: `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent('user:email')}&state=${state}`,
        google: `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent('profile email')}&access_type=offline&state=${state}`,
        yandex: `https://oauth.yandex.ru/authorize?client_id=${process.env.YANDEX_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${state}`
    };
    return res.redirect(urls[provider]);
});
// OAuth callback
router.get('/:provider/callback', async (req, res) => {
    const provider = req.params.provider;
    const code = req.query.code;
    const error = req.query.error;
    const state = req.query.state;
    const redirect = req.query.redirect;
    const frontendUrl = process.env.FRONTEND_URL || 'https://booleanclient.ru';
    const stateData = (0, oauth_1.decodeState)(state || null);
    const isLauncher = redirect === 'launcher' || stateData.source === 'launcher';
    const hwid = stateData.hwid;
    if (error || !code) {
        if (isLauncher) {
            return res.redirect(`http://127.0.0.1:3000/callback?error=${provider}_failed`);
        }
        return res.redirect(`${frontendUrl}/auth?error=${provider}_failed`);
    }
    try {
        const redirectUri = `${frontendUrl}/api/oauth?provider=${provider}&action=callback`;
        let profile;
        switch (provider) {
            case 'github':
                profile = await (0, oauth_1.handleGitHub)(code);
                break;
            case 'google':
                profile = await (0, oauth_1.handleGoogle)(code, redirectUri);
                break;
            case 'yandex':
                profile = await (0, oauth_1.handleYandex)(code);
                break;
            default:
                throw new Error('Invalid provider');
        }
        const user = await (0, oauth_1.findOrCreateOAuthUser)(profile, provider, hwid);
        const token = await (0, jwt_1.generateToken)(user);
        const userData = (0, userMapper_1.mapOAuthUser)(user, token);
        const encodedUser = encodeURIComponent(JSON.stringify(userData));
        if (isLauncher) {
            return res.redirect(`http://127.0.0.1:3000/callback?user=${encodedUser}`);
        }
        return res.redirect(`${frontendUrl}/auth?auth=success&user=${encodedUser}`);
    }
    catch (err) {
        logger_1.logger.error('OAuth callback failed', { provider, ip: req.ip });
        if (isLauncher) {
            return res.redirect(`http://127.0.0.1:3000/callback?error=${provider}_failed`);
        }
        return res.redirect(`${frontendUrl}/auth?error=${provider}_failed`);
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
        let profile;
        switch (provider) {
            case 'github':
                profile = await (0, oauth_1.handleGitHub)(code);
                break;
            case 'google':
                profile = await (0, oauth_1.handleGoogle)(code, '');
                break;
            case 'yandex':
                profile = await (0, oauth_1.handleYandex)(code);
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
