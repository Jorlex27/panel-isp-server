import { z } from 'zod';

export const objectIdString = z.string().regex(/^[a-f\d]{24}$/i, 'ObjectId tidak valid');
