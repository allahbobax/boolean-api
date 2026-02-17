export interface User {
  id: number;
  username: string;
  email: string;
  subscription: string;
  subscription_end_date?: string | null;
  avatar?: string | null;
  registered_at: string;
  is_admin: boolean;
  is_banned: boolean;
  email_verified: boolean;
  settings?: any;
  hwid?: string | null;
  oauth_provider?: string | null;
  oauth_id?: string | null;
  username_change_count?: number;
  last_username_change?: string | null;
}

export interface MappedUser {
  id: number;
  username: string;
  email: string;
  subscription: string;
  subscriptionEndDate: string | null;
  avatar: string | null;
  registeredAt: string;
  isAdmin: boolean;
  isBanned: boolean;
  emailVerified: boolean;
  settings?: unknown;
  hwid: string | null;
  usernameChangeCount?: number;
  lastUsernameChange?: string | null;
}

export interface Incident {
  id: string;
  title: string;
  description: string;
  status: string;
  severity: string;
  affectedServices: string[];
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  updates: IncidentUpdate[];
}

export interface IncidentUpdate {
  id: number;
  status: string;
  message: string;
  createdAt: string;
}

export interface LicenseKey {
  id: number;
  key: string;
  product: string;
  duration: number;
  isUsed: boolean;
  usedBy: number | null;
  usedAt: string | null;
  createdAt: string;
  createdBy: number | null;
}

export interface ClientVersion {
  id: number;
  version: string;
  downloadUrl: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  duration?: number;
  description: string;
  features: string[];
  popular?: boolean;
}
