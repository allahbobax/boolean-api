export declare function generateVerificationCode(): string;
export declare function sendPasswordResetEmail(email: string, username: string, resetCode: string): Promise<boolean>;
export declare function sendVerificationEmail(email: string, username: string, verificationCode: string): Promise<boolean>;
