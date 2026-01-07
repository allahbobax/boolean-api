import { Router, Request, Response } from 'express';
import { generateToken } from '../lib/jwt.js';
import { mapOAuthUser } from '../lib/userMapper.js';
import { findOrCreateOAuthUser, encodeState, decodeState, handleGitHub, handleGoogle, handleYandex } from '../lib/oauth.js';

const router = Router();

// OAuth redirect
router.get('/:provider', async (req: Request, res: Response) => {
  const provider = req.params.provider;
  const redirect = req.query.redirect as string | undefined;
  const hwid = req.query.hwid as string | undefined;
  
  if (!['github', 'google', 'yandex'].includes(provider)) {
    return res.status(400).json({ success: false, message: 'Invalid provider' });
  }

  const frontendUrl = process.env.FRONTEND_URL || 'https://booleanclient.ru';
  const isLauncher = redirect === 'launcher';

  const redirectUris: Record<string, string> = {
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
  const state = encodeState(stateObj);

  const urls: Record<string, string> = {
    github: `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent('user:email')}&state=${state}`,
    google: `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent('profile email')}&access_type=offline&state=${state}`,
    yandex: `https://oauth.yandex.ru/authorize?client_id=${process.env.YANDEX_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${state}`
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
  
  const frontendUrl = process.env.FRONTEND_URL || 'https://booleanclient.ru';
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
      case 'github':
        profile = await handleGitHub(code);
        break;
      case 'google':
        profile = await handleGoogle(code, redirectUri);
        break;
      case 'yandex':
        profile = await handleYandex(code);
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
    console.error(`${provider} OAuth error:`, err);

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
    let profile;
    switch (provider) {
      case 'github':
        profile = await handleGitHub(code);
        break;
      case 'google':
        profile = await handleGoogle(code, '');
        break;
      case 'yandex':
        profile = await handleYandex(code);
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
    console.error(`${provider} OAuth exchange error:`, err);
    return res.redirect(`http://127.0.0.1:3000/callback?error=${provider}_failed`);
  }
});

export default router;