import { Request, Response, NextFunction } from 'express';
import type { User } from '../types';
declare global {
    namespace Express {
        interface Request {
            user?: User;
        }
    }
}
export declare function authenticateToken(req: Request, res: Response, next: NextFunction): Promise<Response<any, Record<string, any>> | undefined>;
export declare function requireAdmin(req: Request, res: Response, next: NextFunction): Response<any, Record<string, any>> | undefined;
export declare function requireInternalApiKey(req: Request, res: Response, next: NextFunction): Response<any, Record<string, any>> | undefined;
export declare function rateLimit(maxRequests?: number, windowMs?: number): (req: Request, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
export declare function cleanupRateLimit(): void;
