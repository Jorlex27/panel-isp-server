import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { ApiError } from '@shared/errors/api-error';

export async function login(
    username: string,
    password: string
): Promise<{ token: string; expiresAt: Date }> {
    const adminUsername = process.env.ADMIN_USERNAME ?? '';
    const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH ?? '';
    const secret = process.env.JWT_SECRET ?? '';
    const expiresIn = (process.env.JWT_EXPIRES_IN ?? '7d') as jwt.SignOptions['expiresIn'];

    if (username !== adminUsername) {
        throw new ApiError('Username atau password salah', 401, 'INVALID_CREDENTIALS');
    }

    const valid = await bcrypt.compare(password, adminPasswordHash);
    if (!valid) {
        throw new ApiError('Username atau password salah', 401, 'INVALID_CREDENTIALS');
    }

    const token = jwt.sign({ sub: username }, secret, { expiresIn });
    const decoded = jwt.decode(token) as { exp: number } | null;
    const expiresAt = decoded ? new Date(decoded.exp * 1000) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    return { token, expiresAt };
}
