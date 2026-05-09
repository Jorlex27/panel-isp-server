import { Hono } from 'hono';
import { authMiddleware } from '@/middleware/auth.middleware';
import { authRouter } from '@modules/auth';
import { paketRouter } from '@modules/paket';
import { pelangganRouter } from '@modules/pelanggan';
import { langgananRouter } from '@modules/langganan';
import { dashboardRouter } from '@modules/dashboard';

const protectedRouters = new Hono()
    .use('*', authMiddleware)
    .route('/paket', paketRouter)
    .route('/pelanggan', pelangganRouter)
    .route('/langganan', langgananRouter)
    .route('/dashboard', dashboardRouter);

export const routers = new Hono()
    .route('/auth', authRouter)
    .route('/', protectedRouters);
