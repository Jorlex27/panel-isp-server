import { MongoClient, type Collection, type Db } from 'mongodb';
import { dbConfig } from '@config/db.config';
import { ApiError } from '@shared/errors/api-error';
import type { LanggananDoc, PaketDoc, PelangganDoc } from '@shared/types/doc.types';

interface CollectionsByName {
    pelanggan: PelangganDoc;
    paket: PaketDoc;
    langganan: LanggananDoc;
}

class Database {
    private static instance: Database;
    private client: MongoClient | null = null;
    private database: Db | null = null;

    private constructor() {}

    static getInstance(): Database {
        if (!Database.instance) Database.instance = new Database();
        return Database.instance;
    }

    async connect(): Promise<void> {
        const env = process.env.NODE_ENV_CONFIG ?? 'development';
        const key = env === 'test' ? 'test' : env === 'production' ? 'production' : 'development';
        const config = dbConfig[key];

        if (!this.client) {
            this.client = new MongoClient(config.url, config.options);
            await this.client.connect();
            this.database = this.client.db(config.name);
        }
    }

    getDb(): Db {
        if (!this.database) {
            throw new ApiError('Database belum diinisialisasi', 500, 'DB_NOT_READY');
        }
        return this.database;
    }

    getCollection<N extends keyof CollectionsByName>(name: N): Collection<CollectionsByName[N]> {
        return this.getDb().collection<CollectionsByName[N]>(name);
    }

    async ensureIndexes(): Promise<void> {
        const pelanggan = this.getCollection('pelanggan');
        await pelanggan.createIndex({ ipAddress: 1 }, { unique: true });
        await pelanggan.createIndex({ macAddress: 1 }, { unique: true });
    }

    isConnected(): boolean {
        return this.database !== null && this.client !== null;
    }

    async disconnect(): Promise<void> {
        if (this.client) {
            await this.client.close();
            this.client = null;
            this.database = null;
        }
    }
}

export const db = Database.getInstance();
