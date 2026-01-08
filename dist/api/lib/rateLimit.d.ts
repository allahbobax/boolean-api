/**
 * Rate limiting middleware using Upstash Redis
 * Работает в serverless окружении (Vercel)
 */
import { Request, Response, NextFunction } from 'express';
export declare const authLimiter: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
export declare const registerLimiter: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
export declare const emailLimiter: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
export declare const forgotPasswordLimiter: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
export declare const verifyCodeLimiter: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
export declare const generalLimiter: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
