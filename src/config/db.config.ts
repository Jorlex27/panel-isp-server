import type { DatabaseConfig } from './db.types';

export interface AppDbConfig {
    development: DatabaseConfig;
    test: DatabaseConfig;
    production: DatabaseConfig;
}

export const dbConfig: AppDbConfig = {
    development: {
        url: process.env.DEV_DB_URL ?? 'mongodb://localhost:27017',
        name: process.env.DEV_DB_NAME ?? 'panel_isp_dev',
        options: {
            maxPoolSize: 10,
            minPoolSize: 1,
            retryWrites: true,
            retryReads: true,
        },
    },
    test: {
        url: process.env.TEST_DB_URL ?? 'mongodb://localhost:27017',
        name: process.env.TEST_DB_NAME ?? 'panel_isp_test',
        options: {
            maxPoolSize: 5,
            minPoolSize: 1,
        },
    },
    production: {
        url: process.env.PROD_DB_URL ?? 'mongodb://localhost:27017',
        name: process.env.PROD_DB_NAME ?? 'panel_isp_prod',
        options: {
            maxPoolSize: 20,
            minPoolSize: 5,
            retryWrites: true,
            retryReads: true,
        },
    },
};
