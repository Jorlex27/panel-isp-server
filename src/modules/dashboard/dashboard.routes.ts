import { Hono } from 'hono';
import * as dashboardService from './dashboard.service';

export const dashboardRouter = new Hono().get('/summary', async c => {
    const data = await dashboardService.getSummary();
    return c.json({ success: true, data });
});
