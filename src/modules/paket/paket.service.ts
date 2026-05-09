import type { ObjectId } from 'mongodb';
import { db } from '@shared/utils/db.util';
import { ApiError } from '@shared/errors/api-error';
import type { PaketPopulated } from '@shared/types/doc.types';
import type { PaketCreateInput, PaketUpdateInput } from './paket.schema';

const col = () => db.getCollection('paket');

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

export async function updatePaket(id: ObjectId, input: PaketUpdateInput): Promise<PaketPopulated> {
    const now = new Date();
    const res = await col().updateOne({ _id: id }, { $set: { ...input, updatedAt: now } });
    if (res.matchedCount === 0) throw ApiError.notFound('Paket tidak ditemukan');
    return getPaket(id);
}

export async function deletePaket(id: ObjectId): Promise<void> {
    const res = await col().deleteOne({ _id: id });
    if (res.deletedCount === 0) throw ApiError.notFound('Paket tidak ditemukan');
}
