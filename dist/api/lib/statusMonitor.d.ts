export declare function ensureStatusTable(): Promise<void>;
export declare function runCheck(): Promise<{
    status: string;
    responseTime: number;
    name: string;
}[] | null>;
export declare function startMonitoring(): void;
export declare function stopMonitoring(): void;
export declare function getLatestStatus(): {
    data: Array<{
        name: string;
        status: string;
        responseTime: number;
    }> | null;
    timestamp: number;
};
