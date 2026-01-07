import { getDb } from './db.js';
import type { User } from '../types.js';
import crypto from 'crypto';

const OAUTH_USER_FIELDS = 'id, username, email, subscription, subscription_end_date, avatar, registered_at, is_admin, is_banned, email_verified, hwid, oauth_provider, oauth_id';

interface OAuthProfile {
  id: string;
  email: string | null;
  name: string;
  login?: string;
  avatar?: string | null;
}

export async function findOrCreateOAuthUser(profile: OAuthProfile, provider: string, hwid?: string | null): Promise<User> {
  const sql = getDb();
  const email = profile.email || `${profile.id}@${provider}.oauth`;
  const username = profile.name || profile.login || `${provider}_${profile.id}`;

  const existing = await sql<User[]>`SELECT ${sql.unsafe(OAUTH_USER_FIELDS)} FROM users WHERE email = ${email}`;

  if (existing.length > 0) {
    const user = existing[0];
    await sql`
      UPDATE users SET oauth_provider = ${provider}, oauth_id = ${profile.id}, email_verified = true, 
      avatar = COALESCE(${profile.avatar ?? null}, avatar), hwid = COALESCE(${hwid ?? null}, hwid) WHERE id = ${user.id}
    `;
    const updated = await sql<User[]>`SELECT ${sql.unsafe(OAUTH_USER_FIELDS)} FROM users WHERE id = ${user.id}`;
    return updated[0];
  }

  let uniqueUsername = username;
  let counter = 1;
  while (true) {
    const check = await sql`SELECT id FROM users WHERE username = ${uniqueUsername}`;
    if (check.length === 0) break;
    uniqueUsername = `${username}_${counter}`;
    counter++;
  }

  const randomPassword = crypto.randomUUID();
  const result = await sql<User[]>`
    INSERT INTO users (username, email, password, oauth_provider, oauth_id, email_verified, subscription, avatar, hwid) 
    VALUES (${uniqueUsername}, ${email}, ${randomPassword}, ${provider}, ${profile.id}, true, 'free', ${profile.avatar ?? null}, ${hwid ?? null}) 
    RETURNING ${sql.unsafe(OAUTH_USER_FIELDS)}
  `;
  return result[0];
}

export function encodeState(stateObj: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(stateObj)).toString('base64');
}

export function decodeState(stateStr: string | null): Record<string, unknown> {
  if (!stateStr) return {};
  if (stateStr === 'launcher') return { source: 'launcher' };
  if (stateStr === 'web') return { source: 'web' };
  try {
    const decoded = Buffer.from(stateStr, 'base64').toString('utf-8');
    if (decoded.trim().startsWith('{')) return JSON.parse(decoded);
    return { source: stateStr };
  } catch {
    return { source: stateStr };
  }
}

export async function handleGitHub(code: string): Promise<OAuthProfile> {
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, code })
  });
  const tokens = await tokenResponse.json() as { access_token?: string };
  if (!tokens.access_token) throw new Error('Token failed');

  const userResponse = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${tokens.access_token}`, 'User-Agent': 'Boolean-API' }
  });
  const profile = await userResponse.json() as { id: number; email: string | null; name: string; login: string; avatar_url: string };

  let email = profile.email;
  if (!email) {
    const emailsResponse = await fetch('https://api.github.com/user/emails', {
      headers: { Authorization: `Bearer ${tokens.access_token}`, 'User-Agent': 'Boolean-API' }
    });
    const emails = await emailsResponse.json() as { email: string; primary: boolean }[];
    const primaryEmail = emails.find(e => e.primary);
    email = primaryEmail ? primaryEmail.email : null;
  }

  return { id: profile.id.toString(), email, name: profile.name || profile.login, login: profile.login, avatar: profile.avatar_url };
}

export async function handleGoogle(code: string, redirectUri: string): Promise<OAuthProfile> {
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri, grant_type: 'authorization_code'
    })
  });
  const tokens = await tokenResponse.json() as { access_token?: string };
  if (!tokens.access_token) throw new Error('Token failed');

  const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` }
  });
  const profile = await userResponse.json() as { id: string; email: string; name: string; picture: string };
  return { id: profile.id, email: profile.email, name: profile.name, avatar: profile.picture };
}

export async function handleYandex(code: string): Promise<OAuthProfile> {
  const tokenResponse = await fetch('https://oauth.yandex.ru/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code, client_id: process.env.YANDEX_CLIENT_ID!, client_secret: process.env.YANDEX_CLIENT_SECRET!
    })
  });
  const tokens = await tokenResponse.json() as { access_token?: string };
  if (!tokens.access_token) throw new Error('Token failed');

  const userResponse = await fetch('https://login.yandex.ru/info?format=json', {
    headers: { Authorization: `OAuth ${tokens.access_token}` }
  });
  const profile = await userResponse.json() as { id: string; default_email: string; display_name: string; login: string; default_avatar_id: string };
  const avatarId = profile.default_avatar_id;
  const avatar = avatarId ? `https://avatars.yandex.net/get-yapic/${avatarId}/islands-200` : null;
  return { id: profile.id, email: profile.default_email || `${profile.id}@yandex.oauth`, name: profile.display_name || profile.login, avatar };
}
