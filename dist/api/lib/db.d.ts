import postgres from 'postgres';
export declare function getDb(): postgres.Sql<{}>;
export declare function warmupDb(): Promise<void>;
export declare function ensureUserSchema(): Promise<void>;
export declare function ensureKeysTable(): Promise<void>;
export declare function ensureLicenseKeysTable(): Promise<void>;
export declare function ensureIncidentsTables(): Promise<void>;
export declare function ensureFriendshipsTable(): Promise<void>;
export declare function ensureVersionsTable(): Promise<void>;
