import type { User, MappedUser } from '../types';
export declare function mapUserFromDb(dbUser: User): MappedUser;
export declare function mapOAuthUser(dbUser: User, token: string): {
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
    hwid: string | null;
    token: string;
};
