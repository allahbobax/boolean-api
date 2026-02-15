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

  const frontendUrl = process.env.FRONTEND_URL || 'xisidlc.lol';
  const isLauncher = redirect === 'launcher';

  const redirectUri = `${frontendUrl}/api/oauth?provider=${provider}&action=callback`;

  const stateObj = {
    source: isLauncher ? 'launcher' : 'web',
    hwid: hwid || null
  };
  const state = encodeState(stateObj);

  const urls: Record<string, string> = {
    google: `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent('profile email')}&access_type=offline&state=${state}`,
    discord: `https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent('identify email')}&state=${state}`
  };

  return res.redirect(urls[provider]);
});


// OAuth callback
router.get('/:provider/callback', async (req: Request, res: Response) => {
  const provider = req.params.provider;
  const code = req.query.code as string | undefined;
  const error = req.query.error as string | undefined;
  const state = req.query.state as string | undefined;
  const redirect = req.query.redirect as string | undefined;
  
  const frontendUrl = process.env.FRONTEND_URL || 'xisidlc.lol';
  const stateData = decodeState(state || null);
  const isLauncher = redirect === 'launcher' || stateData.source === 'launcher';
  const hwid = stateData.hwid as string | undefined;

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

    if (isLauncher) {
      return res.redirect(`http://127.0.0.1:3000/callback?user=${encodedUser}`);
    }

    return res.redirect(`${frontendUrl}/auth?auth=success&user=${encodedUser}`);
  } catch (err) {
    logger.error('OAuth callback failed', { provider, ip: req.ip });

    if (isLauncher) {
      return res.redirect(`http://127.0.0.1:3000/callback?error=${provider}_failed`);
    }
    return res.redirect(`${frontendUrl}/auth?error=${provider}_failed`);
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
    const frontendUrl = process.env.FRONTEND_URL || 'xisidlc.lol';
    const redirectUri = `${frontendUrl}/api/oauth?provider=${provider}&action=callback`;
    
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