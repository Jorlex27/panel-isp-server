import jwt from 'jsonwebtoken';
import { createMiddleware } from 'hono/factory';
import { ApiError } from '@shared/errors/api-error';

export const authMiddleware = createMiddleware(async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        throw new ApiError('Token tidak ditemukan', 401, 'UNAUTHORIZED');
    }
    const token = authHeader.slice(7);
    const secret = process.env.JWT_SECRET ?? '';
    try {
        jwt.verify(token, secret);
    } catch {
        throw new ApiError('Token tidak valid atau sudah expired', 401, 'UNAUTHORIZED');
    }
    await next();
});
