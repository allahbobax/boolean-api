export declare function generateVerificationCode(length?: number): string;
export declare function generateResetToken(): string;
export declare function isExpired(createdAt: Date, expirationMinutes?: number): boolean;
export declare function hashVerificationCode(code: string): string;
export declare function verifyCode(providedCode: string, hashedCode: string): boolean;
export declare function checkVerificationAttempts(identifier: string, maxAttempts?: number): boolean;
export declare function resetVerificationAttempts(identifier: string): void;
export declare function cleanupVerificationAttempts(): void;
