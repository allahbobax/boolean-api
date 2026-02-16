import type { User, MappedUser } from '../types';

export function mapUserFromDb(dbUser: User): MappedUser {
  const normalizedSubscription = String(dbUser.subscription || 'free').trim().toLowerCase();
  const subscription = normalizedSubscription === 'premium' || normalizedSubscription === 'alpha' 
    ? normalizedSubscription : 'free';
    
  return {
    id: dbUser.id,
    username: dbUser.username,
    email: dbUser.email,
    subscription,
    subscriptionEndDate: dbUser.subscription_end_date || null,
    avatar: dbUser.avatar || null,
    registeredAt: dbUser.registered_at,
    isAdmin: dbUser.is_admin,
    isBanned: dbUser.is_banned,
    emailVerified: dbUser.email_verified,
    settings: dbUser.settings ? JSON.parse(dbUser.settings) : undefined,
    hwid: dbUser.hwid || null
    
  };
}

export function mapOAuthUser(dbUser: User, token: string) {
  const normalizedSubscription = String(dbUser.subscription || 'free').trim().toLowerCase();
  const subscription = normalizedSubscription === 'premium' || normalizedSubscription === 'alpha' 
    ? normalizedSubscription : 'free';
    
  return {
    id: dbUser.id,
    username: dbUser.username,
    email: dbUser.email,
    subscription,
    subscriptionEndDate: dbUser.subscription_end_date || null,
    avatar: dbUser.avatar || null,
    registeredAt: dbUser.registered_at,
    isAdmin: dbUser.is_admin || false,
    isBanned: dbUser.is_banned || false,
    emailVerified: true,
    hwid: dbUser.hwid || null
  };
}
