import bcrypt from 'bcrypt';
import { MongoClient } from 'mongodb';
import { dbConfig } from '../src/config/db.config';

const env = process.env.NODE_ENV_CONFIG ?? 'development';
const configKey =
    env === 'test' ? 'test' : env === 'production' ? 'production' : 'development';
const { url, name, options } = dbConfig[configKey];

const ADMIN_USERNAME = process.env.SEED_ADMIN_USERNAME ?? 'admin';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'admin123';

async function seed() {
    const client = new MongoClient(url, options);
    await client.connect();
    const db = client.db(name);

    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await db.collection('admin').updateOne(
        { username: ADMIN_USERNAME },
        { $set: { username: ADMIN_USERNAME, passwordHash } },
        { upsert: true }
    );

    console.log(`Seeded admin: ${ADMIN_USERNAME}`);
    await client.close();
}

seed().catch((err) => {
    console.error(err);
    process.exit(1);
});
