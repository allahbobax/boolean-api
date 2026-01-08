import { Request, Response, NextFunction } from 'express';
export declare function generateCsrfToken(sessionId: string): Promise<string>;
export declare function validateCsrfToken(sessionId: string, token: string): Promise<boolean>;
export declare function csrfProtection(req: Request, res: Response, next: NextFunction): void | Response<any, Record<string, any>>;
