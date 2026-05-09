import type { ObjectId } from 'mongodb';
import { db } from '@shared/utils/db.util';
import { ApiError } from '@shared/errors/api-error';
import type { LanggananPopulated, PembayaranItem } from '@shared/types/doc.types';
import * as paketService from '@modules/paket/paket.service';

const col = () => db.getCollection('langganan');

const langgananLookupRelations = [
    {
        $lookup: {
            from: 'pelanggan',
            localField: 'pelangganId',
            foreignField: '_id',
            as: 'pelanggan',
        },
    },
    { $unwind: { path: '$pelanggan', preserveNullAndEmptyArrays: true } },
    {
        $lookup: {
            from: 'paket',
            localField: 'paketId',
            foreignField: '_id',
            as: 'paket',
        },
    },
    { $unwind: { path: '$paket', preserveNullAndEmptyArrays: true } },
];

export async function listLangganan(): Promise<LanggananPopulated[]> {
    return col()
        .aggregate<LanggananPopulated>([{ $sort: { tanggalExpire: -1 } }, ...langgananLookupRelations])
        .toArray();
}

export async function getLangganan(id: ObjectId): Promise<LanggananPopulated> {
    const rows = await col()
        .aggregate<LanggananPopulated>([{ $match: { _id: id } }, ...langgananLookupRelations])
        .toArray();
    if (!rows[0]) throw ApiError.notFound('Langganan tidak ditemukan');
    return rows[0];
}

export async function requireByPelangganId(pelangganId: ObjectId): Promise<LanggananPopulated> {
    const rows = await col()
        .aggregate<LanggananPopulated>([{ $match: { pelangganId } }, ...langgananLookupRelations])
        .toArray();
    if (!rows[0]) throw ApiError.notFound('Langganan tidak ditemukan');
    return rows[0];
}

export async function insertLangganan(payload: {
    pelangganId: ObjectId;
    paketId: ObjectId;
    tanggalMulai: Date;
    tanggalExpire: Date;
    statusBayar: 'lunas' | 'belum_bayar';
}): Promise<LanggananPopulated> {
    const now = new Date();
    const doc = {
        ...payload,
        historyPembayaran: [] as PembayaranItem[],
        createdAt: now,
        updatedAt: now,
    };
    const res = await col().insertOne(doc as never);
    return getLangganan(res.insertedId);
}

export async function createLanggananManual(payload: {
    pelangganId: ObjectId;
    paketId: ObjectId;
    tanggalMulai: Date;
    tanggalExpire: Date;
    statusBayar: 'lunas' | 'belum_bayar';
}): Promise<LanggananPopulated> {
    const existing = await col().findOne({ pelangganId: payload.pelangganId });
    if (existing) throw ApiError.badRequest('Pelanggan sudah punya langganan', 'LANGGANAN_EXISTS');
    await paketService.getPaket(payload.paketId);
    const pel = await db.getCollection('pelanggan').findOne({ _id: payload.pelangganId });
    if (!pel) throw ApiError.notFound('Pelanggan tidak ditemukan');
    return insertLangganan(payload);
}

export async function deleteByPelangganId(pelangganId: ObjectId): Promise<void> {
    await col().deleteMany({ pelangganId });
}

export async function recordBayar(
    pelangganId: ObjectId,
    jumlah: number,
    metode: string
): Promise<LanggananPopulated> {
    const bulan = 30 * 24 * 60 * 60 * 1000;
    const expireBaru = new Date(Date.now() + bulan);
    const entry: PembayaranItem = { tanggal: new Date(), jumlah, metode };
    const existing = await col().findOne({ pelangganId });
    if (!existing) throw ApiError.notFound('Langganan tidak ditemukan');
    await col().updateOne(
        { pelangganId },
        {
            $set: {
                tanggalExpire: expireBaru,
                statusBayar: 'lunas',
                updatedAt: new Date(),
            },
        }
    );
    await col().updateOne({ pelangganId }, { $push: { historyPembayaran: entry } });
    return getLangganan(existing._id);
}

export async function updatePaketId(pelangganId: ObjectId, paketId: ObjectId): Promise<void> {
    await col().updateOne(
        { pelangganId },
        { $set: { paketId, updatedAt: new Date() } }
    );
}
