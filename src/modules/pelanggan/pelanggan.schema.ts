import { z } from 'zod';
import { objectIdString } from '@shared/schemas/object-id.schema';
import { pembayaranStatusSchema } from '@modules/langganan/langganan.schema';

export const pelangganStatusSchema = z.enum(['aktif', 'suspend']);

export const pelangganCreateSchema = z.object({
    nama: z.string().min(1),
    noHp: z.string().min(1),
    alamat: z.string().min(1),
    macAddress: z.string().min(1),
    ipAddress: z.string().min(1),
    paketId: objectIdString,
    status: pelangganStatusSchema.optional(),
    tanggalMulai: z.coerce.date().optional(),
    tanggalExpire: z.coerce.date().optional(),
    statusBayar: pembayaranStatusSchema.optional(),
});

export const bayarBodySchema = z.object({
    jumlah: z.number().positive(),
    metode: z.string().min(1),
});

export type PelangganCreateInput = z.infer<typeof pelangganCreateSchema>;
export type BayarBodyInput = z.infer<typeof bayarBodySchema>;

export const gantiPaketBodySchema = z.object({
    paketId: objectIdString,
});

export type GantiPaketBodyInput = z.infer<typeof gantiPaketBodySchema>;
