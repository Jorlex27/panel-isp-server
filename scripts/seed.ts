import bcrypt from 'bcrypt';
import { MongoClient } from 'mongodb';

const DB_URL = process.env.DEV_DB_URL ?? 'mongodb://localhost:27017';
const DB_NAME = process.env.DEV_DB_NAME ?? 'panel_isp_dev';

const ADMIN_USERNAME = process.env.SEED_ADMIN_USERNAME ?? 'admin';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'admin123';

async function seed() {
    const client = new MongoClient(DB_URL);
    await client.connect();
    const db = client.db(DB_NAME);

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
