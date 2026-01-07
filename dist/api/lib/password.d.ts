export declare function hashPassword(password: string): Promise<string>;
export declare function comparePassword(password: string, hashed: string): Promise<boolean>;
export declare function rehashLegacyPassword(userId: number, password: string): Promise<string>;
export declare function passwordsMatch(user: {
    id: number;
    password: string | null;
}, inputPassword: string): Promise<boolean>;
