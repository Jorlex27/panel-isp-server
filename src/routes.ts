import { Hono } from 'hono';
import { paketRouter } from '@modules/paket';
import { pelangganRouter } from '@modules/pelanggan';
import { langgananRouter } from '@modules/langganan';

export const routers = new Hono()
    .route('/paket', paketRouter)
    .route('/pelanggan', pelangganRouter)
    .route('/langganan', langgananRouter);
