import { z } from 'zod';

export const paketCreateSchema = z.object({
    nama: z.string().min(1),
    hargaBulanan: z.number().nonnegative(),
    speedDown: z.number().positive(),
    speedUp: z.number().positive(),
    deskripsi: z.string().optional(),
});

export const paketUpdateSchema = paketCreateSchema.partial();

export type PaketCreateInput = z.infer<typeof paketCreateSchema>;
export type PaketUpdateInput = z.infer<typeof paketUpdateSchema>;
