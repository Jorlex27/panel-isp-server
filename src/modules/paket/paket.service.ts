import type { ObjectId } from 'mongodb';
import { gantiPaketMikrotik } from '@/services/mikrotik.service';
import { db } from '@shared/utils/db.util';
import { ApiError } from '@shared/errors/api-error';
import { logger } from '@shared/utils/logger.util';
import type { PaketPopulated } from '@shared/types/doc.types';
import type { PaketCreateInput, PaketUpdateInput } from './paket.schema';

const col = () => db.getCollection('paket');
const langCol = () => db.getCollection('langganan');
const pelCol = () => db.getCollection('pelanggan');

const paketLookupLangganans = [
    {
        $lookup: {
            from: 'langganan',
            localField: '_id',
            foreignField: 'paketId',
            as: 'langganans',
        },
    },
];

export async function listPaket(): Promise<PaketPopulated[]> {
    const rows = await col()
        .aggregate<PaketPopulated>([{ $sort: { nama: 1 } }, ...paketLookupLangganans])
        .toArray();
    return rows;
}

export async function getPaket(id: ObjectId): Promise<PaketPopulated> {
    const rows = await col()
        .aggregate<PaketPopulated>([{ $match: { _id: id } }, ...paketLookupLangganans])
        .toArray();
    if (!rows[0]) throw ApiError.notFound('Paket tidak ditemukan');
    return rows[0];
}

export async function createPaket(input: PaketCreateInput): Promise<PaketPopulated> {
    const now = new Date();
    const doc = { ...input, createdAt: now, updatedAt: now };
    const res = await col().insertOne(doc as never);
    return getPaket(res.insertedId);
}

async function syncMikrotikSpeedsForPaketSubscribers(
    paketId: ObjectId,
    speedDown: number,
    speedUp: number
): Promise<void> {
    const subs = await langCol()
        .find({ paketId })
        .project({ pelangganId: 1 })
        .toArray();
    for (const row of subs) {
        const pel = await pelCol().findOne({ _id: row.pelangganId });
        if (pel && pel.status === 'aktif') {
            try {
                await gantiPaketMikrotik(pel.nama, `${speedDown}M/${speedUp}M`);
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                logger.warn(`Sinkron speed paket ke MikroTik gagal (${pel.nama}): ${msg}`);
            }
        }
    }
}

export async function updatePaket(id: ObjectId, input: PaketUpdateInput): Promise<PaketPopulated> {
    const now = new Date();
    const res = await col().updateOne({ _id: id }, { $set: { ...input, updatedAt: now } });
    if (res.matchedCount === 0) throw ApiError.notFound('Paket tidak ditemukan');
    const data = await getPaket(id);
    if (input.speedDown !== undefined || input.speedUp !== undefined) {
        await syncMikrotikSpeedsForPaketSubscribers(id, data.speedDown, data.speedUp);
    }
    return data;
}

export async function deletePaket(id: ObjectId): Promise<void> {
    const res = await col().deleteOne({ _id: id });
    if (res.deletedCount === 0) throw ApiError.notFound('Paket tidak ditemukan');
}
