import { Hono } from 'hono';
import { z } from 'zod';
import * as authService from './auth.service';

const loginSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(1),
});

export const authRouter = new Hono().post('/login', async c => {
    const body = loginSchema.parse(await c.req.json());
    const data = await authService.login(body.username, body.password);
    return c.json({ success: true, data });
});
