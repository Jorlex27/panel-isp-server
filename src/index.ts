import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { db } from '@shared/utils/db.util';
import { ApiError } from '@shared/errors/api-error';
import { logger } from '@shared/utils/logger.util';
import { routers } from './routes';
import { startCronJobs } from './jobs/cron';

const app = new Hono();

app.use(
    '/*',
    cors({
        origin: '*',
        credentials: true,
    })
);

app.get('/health', c => c.json({ status: 'OK' }));

app.route('/api/v1', routers);

app.onError((err, c) => ApiError.handle(err, c, 'Server'));

const shutdown = async () => {
    logger.warn('Shutting down server...');
    await db.disconnect();
    process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

try {
    await db.connect();
    await db.ensureIndexes();
    logger.db('Database connected successfully');
} catch (error: unknown) {
    logger.error('Database connection error:', error);
    process.exit(1);
}

startCronJobs();

const port = Number(process.env.PORT ?? '3000');

logger.server(`Server is running at http://localhost:${port}`);

export default {
    port,
    idleTimeout: 255,
    fetch: app.fetch,
};
