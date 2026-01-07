import type { User } from '../types';
interface OAuthProfile {
    id: string;
    email: string | null;
    name: string;
    login?: string;
    avatar?: string | null;
}
export declare function findOrCreateOAuthUser(profile: OAuthProfile, provider: string, hwid?: string | null): Promise<User>;
export declare function encodeState(stateObj: Record<string, unknown>): string;
export declare function decodeState(stateStr: string | null): Record<string, unknown>;
export declare function handleGitHub(code: string): Promise<OAuthProfile>;
export declare function handleGoogle(code: string, redirectUri: string): Promise<OAuthProfile>;
export declare function handleYandex(code: string): Promise<OAuthProfile>;
export {};
