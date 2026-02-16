import { Router, Request, Response } from 'express';
import { generateToken } from '../lib/jwt';
import { mapOAuthUser } from '../lib/userMapper';
import { findOrCreateOAuthUser, encodeState, decodeState, handleGoogle, handleDiscord } from '../lib/oauth';
import { logger } from '../lib/logger';

const router = Router();

// БЕЗОПАСНОСТЬ: Проверка настройки OAuth провайдеров
const isOAuthConfigured = () => {
  const hasGoogle = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const hasDiscord = !!(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);
  return { hasGoogle, hasDiscord };
};

// OAuth redirect
router.get('/:provider', async (req: Request, res: Response) => {
  const provider = req.params.provider;
  const redirect = req.query.redirect as string | undefined;
  const hwid = req.query.hwid as string | undefined;
  
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
  const state = encodeState(stateObj);

  const urls: Record<string, string> = {
    google: `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent('profile email')}&access_type=offline&state=${state}`,
    discord: `https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent('identify email')}&state=${state}`
  };
  
  // LOGGING: Отладочная информация для поиска проблемы с redirect_uri
  logger.info(`OAuth Start [${provider}]`, { redirectUri, frontendUrl: process.env.FRONTEND_URL, authUrl: urls[provider] });

  return res.redirect(urls[provider]);
});


// OAuth callback
router.get('/:provider/callback', async (req: Request, res: Response) => {
  const provider = req.params.provider;
  const code = req.query.code as string | undefined;
  const error = req.query.error as string | undefined;
  const state = req.query.state as string | undefined;
  const redirect = req.query.redirect as string | undefined;
  
  // Убираем trailing slash если есть
  const rawFrontendUrl = process.env.FRONTEND_URL || 'https://xisedlc.lol';
  const frontendUrl = rawFrontendUrl.replace(/\/$/, '');
  
  // API URL для callback
  const apiUrl = process.env.API_URL || 'https://api.xisedlc.lol';
  const cleanApiUrl = apiUrl.replace(/\/$/, '');

  const stateData = decodeState(state || null);
  const isLauncher = redirect === 'launcher' || stateData.source === 'launcher';
  const hwid = stateData.hwid as string | undefined;

  // LOGGING: Отладка входящего callback
  logger.info(`OAuth Callback [${provider}]`, { 
    codePrefix: code?.substring(0, 10), 
    state, 
    redirectUri: `${cleanApiUrl}/oauth/${provider}/callback`
  });

  if (error || !code) {
    logger.error('OAuth Callback: Missing code or error present', { error, codePrefix: code?.substring(0, 5) });
    if (isLauncher) {
      return res.redirect(`http://127.0.0.1:3000/callback?error=${provider}_failed`);
    }
    return res.redirect(`${frontendUrl}/dashboard?error=${provider}_failed`);
  }

  try {
    // Callback URI должен совпадать с тем, что был при старте
    const redirectUri = `${cleanApiUrl}/oauth/${provider}/callback`;
    
    // LOGGING: Отладка входящего callback
    logger.info(`OAuth Callback [${provider}]`, { 
      codePrefix: code?.substring(0, 10), 
      state, 
      redirectUri 
    });

    let profile;
    logger.info(`OAuth Callback [${provider}]: Start handling provider...`);
    switch (provider) {
      case 'google':
        profile = await handleGoogle(code, redirectUri);
        break;
      case 'discord':
        profile = await handleDiscord(code, redirectUri);
        break;
      default:
        throw new Error('Invalid provider');
    }
    logger.info(`OAuth Callback [${provider}]: Provider handled successfully, profile id: ${profile.id}`);

    logger.info(`OAuth Callback [${provider}]: Find or create user...`);
    const user = await findOrCreateOAuthUser(profile, provider, hwid);
    logger.info(`OAuth Callback [${provider}]: User found/created: ${user.id}`);
    
    const token = await generateToken(user);
    const userData = mapOAuthUser(user, token);
    const encodedUser = encodeURIComponent(JSON.stringify(userData));

    if (isLauncher) {
      return res.redirect(`http://127.0.0.1:3000/callback?user=${encodedUser}`);
    }

    return res.redirect(`${frontendUrl}/dashboard?auth=success&user=${encodedUser}`);
  } catch (err: any) {
    console.error('RAW_OAUTH_ERROR:', err);
    logger.error('OAuth callback failed', { 
      provider, 
      ip: req.ip, 
      error: err,
      errorMessage: err?.message || 'No message',
      errorStack: err?.stack || 'No stack'
    });

    if (isLauncher) {
      return res.redirect(`http://127.0.0.1:3000/callback?error=${provider}_failed`);
    }
    return res.redirect(`${frontendUrl}/dashboard?error=${provider}_failed`);
  }
});

// Exchange code for launcher
router.get('/:provider/exchange', async (req: Request, res: Response) => {
  const provider = req.params.provider;
  const code = req.query.code as string | undefined;
  const source = req.query.source as string | undefined;
  const state = req.query.state as string | undefined;

  if (!code) {
    return res.redirect(`http://127.0.0.1:3000/callback?error=no_code`);
  }

  const stateData = decodeState(state || null);
  const hwid = stateData.hwid as string | undefined;

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
        profile = await handleGoogle(code, redirectUri);
        break;
      case 'discord':
        profile = await handleDiscord(code, redirectUri);
        break;
      default:
        throw new Error('Invalid provider');
    }

    const user = await findOrCreateOAuthUser(profile, provider, hwid);
    const token = await generateToken(user);
    const userData = mapOAuthUser(user, token);
    const encodedUser = encodeURIComponent(JSON.stringify(userData));

    return res.redirect(`http://127.0.0.1:3000/callback?user=${encodedUser}`);
  } catch (err) {
    logger.error('OAuth exchange failed', { provider, ip: req.ip });
    return res.redirect(`http://127.0.0.1:3000/callback?error=${provider}_failed`);
  }
});

export default router;