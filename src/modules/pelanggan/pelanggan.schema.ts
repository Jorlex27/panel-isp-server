import { z } from 'zod';
import { objectIdString } from '@shared/schemas/object-id.schema';
import { pembayaranStatusSchema } from '@modules/langganan/langganan.schema';

export const pelangganStatusSchema = z.enum(['aktif', 'suspend']);

export const pelangganCreateSchema = z.object({
    nama: z.string().min(1),
    noHp: z.string().optional(),
    alamat: z.string().optional(),
    macAddress: z.string().min(1),
    paketId: objectIdString,
    status: pelangganStatusSchema.optional(),
    tanggalMulai: z.coerce.date().optional(),
    tanggalExpire: z.coerce.date().optional(),
    statusBayar: pembayaranStatusSchema.optional(),
    maxPengguna: z.number().int().min(2).max(65535).optional(),
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

export const pelangganUpdateInfoSchema = z.object({
    nama: z.string().min(1).optional(),
    noHp: z.string().optional(),
    alamat: z.string().optional(),
    maxPengguna: z.union([z.number().int().min(2).max(65535), z.null()]).optional(),
});

export const gantiMacSchema = z.object({
    macAddress: z.string().min(1),
});

export type PelangganUpdateInfoInput = z.infer<typeof pelangganUpdateInfoSchema>;
export type GantiMacInput = z.infer<typeof gantiMacSchema>;
