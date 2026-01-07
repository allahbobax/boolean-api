import * as jose from 'jose';
import type { User } from '../types';
export declare function generateToken(user: User): Promise<string>;
export declare function verifyToken(token: string): Promise<jose.JWTPayload | null>;
