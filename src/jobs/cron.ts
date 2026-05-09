import cron from 'node-cron';
import { ObjectId } from 'mongodb';
import { db } from '@shared/utils/db.util';
import { logger } from '@shared/utils/logger.util';
import { suspendPelanggan } from '@/services/mikrotik.service';
import { kirimWA } from '@/services/whatsapp.service';

async function suspendExpiredUnpaid(): Promise<void> {
    const langCol = db.getCollection('langganan');
    const pelCol = db.getCollection('pelanggan');
    const now = new Date();
    const rows = await langCol
        .find({
            tanggalExpire: { $lte: now },
            statusBayar: { $ne: 'lunas' },
        })
        .toArray();

    for (const row of rows) {
        const pelangganId = row.pelangganId as ObjectId;
        const pel = await pelCol.findOne({ _id: pelangganId });
        if (!pel || typeof pel.ipAddress !== 'string' || typeof pel.nama !== 'string') continue;
        try {
            await suspendPelanggan(pel.ipAddress);
            await pelCol.updateOne(
                { _id: pelangganId },
                { $set: { status: 'suspend', updatedAt: new Date() } }
            );
            const hp = typeof pel.noHp === 'string' ? pel.noHp : '';
            if (hp) {
                await kirimWA(
                    hp,
                    `Halo ${String(pel.nama)}, paket internet Anda sudah habis masa berlakunya. Hubungi kami untuk perpanjang.`
                );
            }
        } catch (error: unknown) {
            logger.error('Cron suspend gagal', error);
        }
    }
}

async function remindExpiring(): Promise<void> {
    const langCol = db.getCollection('langganan');
    const pelCol = db.getCollection('pelanggan');
    const start = new Date();
    const end = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const rows = await langCol
        .find({
            tanggalExpire: { $lte: end, $gte: start },
        })
        .toArray();

    for (const row of rows) {
        const pelangganId = row.pelangganId as ObjectId;
        const expire =
            row.tanggalExpire instanceof Date ? row.tanggalExpire : new Date(row.tanggalExpire);
        const pel = await pelCol.findOne({ _id: pelangganId });
        if (!pel) continue;
        const hp = typeof pel.noHp === 'string' ? pel.noHp : '';
        if (!hp) continue;
        const sisa = Math.max(
            0,
            Math.ceil((expire.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
        );
        try {
            await kirimWA(
                hp,
                `Halo ${String(pel.nama)}, masa aktif internet Anda tersisa ${sisa} hari. Silakan lakukan pembayaran.`
            );
        } catch (error: unknown) {
            logger.error('Cron reminder gagal', error);
        }
    }
}

export function startCronJobs(): void {
    cron.schedule('0 0 * * *', async () => {
        try {
            await suspendExpiredUnpaid();
        } catch (error: unknown) {
            logger.error('Cron harian suspend gagal', error);
        }
    });
    cron.schedule('0 8 * * *', async () => {
        try {
            await remindExpiring();
        } catch (error: unknown) {
            logger.error('Cron reminder pagi gagal', error);
        }
    });
}
