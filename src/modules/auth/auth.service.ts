import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { ApiError } from '@shared/errors/api-error';
import { db } from '@shared/utils/db.util';

export async function login(
    username: string,
    password: string
): Promise<{ token: string; expiresAt: Date }> {
    const secret = process.env.JWT_SECRET ?? '';
    const expiresIn = (process.env.JWT_EXPIRES_IN ?? '7d') as jwt.SignOptions['expiresIn'];

    const admin = await db.getCollection('admin').findOne({ username });
    if (!admin) {
        throw new ApiError('Username atau password salah', 401, 'INVALID_CREDENTIALS');
    }

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) {
        throw new ApiError('Username atau password salah', 401, 'INVALID_CREDENTIALS');
    }

    const token = jwt.sign({ sub: username }, secret, { expiresIn });
    const decoded = jwt.decode(token) as { exp: number } | null;
    const expiresAt = decoded ? new Date(decoded.exp * 1000) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    return { token, expiresAt };
}
