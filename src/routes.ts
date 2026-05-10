import { Hono } from 'hono';
import { authMiddleware } from '@/middleware/auth.middleware';
import { authRouter } from '@modules/auth';
import { paketRouter } from '@modules/paket';
import { pelangganRouter } from '@modules/pelanggan';
import { langgananRouter } from '@modules/langganan';
import { dashboardRouter } from '@modules/dashboard';
import { monitoringRouter } from '@modules/monitoring';

const protectedRouters = new Hono()
    .use('*', authMiddleware)
    .route('/paket', paketRouter)
    .route('/pelanggan', pelangganRouter)
    .route('/langganan', langgananRouter)
    .route('/dashboard', dashboardRouter)
    .route('/monitoring', monitoringRouter);

export const routers = new Hono()
    .route('/auth', authRouter)
    .route('/', protectedRouters);
