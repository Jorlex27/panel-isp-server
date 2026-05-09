import { z } from 'zod';
import { objectIdString } from '@shared/schemas/object-id.schema';

export const pembayaranStatusSchema = z.enum(['lunas', 'belum_bayar']);

export const langgananCreateSchema = z.object({
    pelangganId: objectIdString,
    paketId: objectIdString,
    tanggalMulai: z.coerce.date(),
    tanggalExpire: z.coerce.date(),
    statusBayar: pembayaranStatusSchema.optional(),
});

export type LanggananCreateInput = z.infer<typeof langgananCreateSchema>;
