export interface DatabaseConfig {
    url: string;
    name: string;
    options?: {
        maxPoolSize?: number;
        minPoolSize?: number;
        retryWrites?: boolean;
        retryReads?: boolean;
    };
}
