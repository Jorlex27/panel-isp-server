import { ObjectId } from 'mongodb';
import { db } from '@shared/utils/db.util';
import { ApiError } from '@shared/errors/api-error';
import { logger } from '@shared/utils/logger.util';
import type { LanggananPopulated, PelangganPopulated } from '@shared/types/doc.types';
import * as paketService from '@modules/paket/paket.service';
import * as langgananService from '@modules/langganan/langganan.service';
import {
    aktifkanPelanggan,
    applyMaxPenggunaMikrotik,
    gantiMacMikrotik,
    gantiPaketMikrotik,
    hapusPelanggan,
    normalizeMac,
    renameSimpleQueue,
    suspendPelanggan,
    tambahPelanggan,
} from '@/services/mikrotik.service';
import type { BayarBodyInput, GantiMacInput, GantiPaketBodyInput, PelangganCreateInput, PelangganUpdateInfoInput } from './pelanggan.schema';

const col = () => db.getCollection('pelanggan');

async function assignNextIp(): Promise<string> {
    const network = process.env.IP_POOL_NETWORK ?? '10.10.0.0';
    const start = Number(process.env.IP_POOL_START ?? '10');
    const end = Number(process.env.IP_POOL_END ?? '254');
    const prefix = network.split('.').slice(0, 3).join('.');

    const taken = await col()
        .find({}, { projection: { ipAddress: 1 } })
        .toArray();
    const takenSet = new Set(taken.map((p) => p.ipAddress));

    for (let i = start; i <= end; i++) {
        const ip = `${prefix}.${i}`;
        if (!takenSet.has(ip)) return ip;
    }
    throw new ApiError('IP pool habis', 500, 'IP_POOL_EXHAUSTED');
}

const pelangganPopulatePipeline = [
    {
        $lookup: {
            from: 'langganan',
            localField: '_id',
            foreignField: 'pelangganId',
            as: 'langgananArr',
        },
    },
    {
        $addFields: {
            langganan: { $arrayElemAt: ['$langgananArr', 0] },
        },
    },
    { $project: { langgananArr: 0 } },
    {
        $lookup: {
            from: 'paket',
            let: { pid: '$langganan.paketId' },
            pipeline: [
                {
                    $match: {
                        $expr: {
                            $and: [{ $ne: ['$$pid', null] }, { $eq: ['$_id', '$$pid'] }],
                        },
                    },
                },
            ],
            as: 'paketArr',
        },
    },
    {
        $addFields: {
            paket: { $arrayElemAt: ['$paketArr', 0] },
        },
    },
    { $project: { paketArr: 0 } },
];

export async function listPelanggan(): Promise<PelangganPopulated[]> {
    return col()
        .aggregate<PelangganPopulated>([{ $sort: { nama: 1 } }, ...pelangganPopulatePipeline])
        .toArray();
}

export async function getPelanggan(id: ObjectId): Promise<PelangganPopulated> {
    const rows = await col()
        .aggregate<PelangganPopulated>([{ $match: { _id: id } }, ...pelangganPopulatePipeline])
        .toArray();
    if (!rows[0]) throw ApiError.notFound('Pelanggan tidak ditemukan');
    return rows[0];
}

export async function createPelanggan(input: PelangganCreateInput): Promise<PelangganPopulated> {
    const paketId = new ObjectId(input.paketId);
    const paket = await paketService.getPaket(paketId);
    const now = new Date();
    const mulai = input.tanggalMulai ?? now;
    const expire = input.tanggalExpire ?? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const statusBayar = input.statusBayar ?? 'belum_bayar';
    const statusPel = input.status ?? 'aktif';
    const ipAddress = await assignNextIp();

    const pelDoc = {
        nama: input.nama,
        noHp: input.noHp,
        alamat: input.alamat,
        macAddress: input.macAddress,
        ipAddress,
        status: statusPel,
        ...(input.maxPengguna !== undefined ? { maxPengguna: input.maxPengguna } : {}),
        createdAt: now,
        updatedAt: now,
    };

    const pelangganId = await db.withTransaction(async (session) => {
        const insertPel = await col().insertOne(pelDoc as never, { session });
        await langgananService.insertLangganan(
            { pelangganId: insertPel.insertedId, paketId, tanggalMulai: mulai, tanggalExpire: expire, statusBayar },
            session
        );
        return insertPel.insertedId;
    });

    try {
        await tambahPelanggan(ipAddress, input.macAddress, paket.speedDown, paket.speedUp, input.nama);
        if (statusPel === 'suspend') {
            await suspendPelanggan(ipAddress, input.nama);
        }
        const created = await getPelanggan(pelangganId);
        try {
            await applyMaxPenggunaMikrotik(created.ipAddress, created.maxPengguna);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            logger.warn(`createPelanggan: max pengguna MikroTik gagal: ${msg}`);
        }
        return created;
    } catch (error: unknown) {
        await db.withTransaction(async (session) => {
            await langgananService.deleteByPelangganId(pelangganId, session);
            await col().deleteOne({ _id: pelangganId }, { session });
        });
        throw error;
    }
}

export async function suspendPelangganDb(id: ObjectId): Promise<PelangganPopulated> {
    const pel = await getPelanggan(id);
    const prev = pel.status;
    await col().updateOne({ _id: id }, { $set: { status: 'suspend', updatedAt: new Date() } });
    try {
        await suspendPelanggan(pel.ipAddress, pel.nama);
    } catch (error: unknown) {
        await col().updateOne({ _id: id }, { $set: { status: prev, updatedAt: new Date() } });
        throw error;
    }
    return getPelanggan(id);
}

export async function aktifkanPelangganDb(id: ObjectId): Promise<PelangganPopulated> {
    const pel = await getPelanggan(id);
    const lang = await langgananService.requireByPelangganId(id);
    const pak = lang.paket;
    if (!pak) throw ApiError.badRequest('Paket langganan tidak ditemukan', 'MISSING_PAKET');
    await aktifkanPelanggan(pel.ipAddress, pak.speedDown, pak.speedUp, pel.nama);
    await col().updateOne({ _id: id }, { $set: { status: 'aktif', updatedAt: new Date() } });
    return getPelanggan(id);
}

export async function deletePelangganDb(id: ObjectId): Promise<void> {
    const pel = await getPelanggan(id);
    await hapusPelanggan(pel.ipAddress, pel.nama);
    await db.withTransaction(async (session) => {
        await langgananService.deleteByPelangganId(id, session);
        await col().deleteOne({ _id: id }, { session });
    });
}

export async function bayarPelanggan(
    id: ObjectId,
    body: BayarBodyInput
): Promise<{ langganan: LanggananPopulated; expire: Date }> {
    const pel = await getPelanggan(id);
    const lang = await langgananService.recordBayar(id, body.jumlah, body.metode);
    if (pel.status === 'suspend') {
        const pak = lang.paket;
        if (!pak) throw ApiError.badRequest('Paket tidak ditemukan', 'MISSING_PAKET');
        await aktifkanPelanggan(pel.ipAddress, pak.speedDown, pak.speedUp, pel.nama);
        await col().updateOne({ _id: id }, { $set: { status: 'aktif', updatedAt: new Date() } });
    }
    return { langganan: lang, expire: lang.tanggalExpire };
}

export async function gantiPaket(
    id: ObjectId,
    input: GantiPaketBodyInput
): Promise<PelangganPopulated> {
    const paketId = new ObjectId(input.paketId);
    const pel = await getPelanggan(id);
    const paket = await paketService.getPaket(paketId);
    const maxLimit =
        pel.status === 'suspend'
            ? '256k/256k'
            : `${paket.speedDown}M/${paket.speedUp}M`;
    await gantiPaketMikrotik(pel.nama, maxLimit);
    await langgananService.updatePaketId(id, paketId);
    return getPelanggan(id);
}

export async function updatePelangganInfo(
    id: ObjectId,
    input: PelangganUpdateInfoInput
): Promise<PelangganPopulated> {
    const prev = await getPelanggan(id);
    const $set: Record<string, unknown> = { updatedAt: new Date() };
    if (input.nama !== undefined) $set.nama = input.nama;
    if (input.noHp !== undefined) $set.noHp = input.noHp;
    if (input.alamat !== undefined) $set.alamat = input.alamat;
    if (input.maxPengguna === null) {
        await col().updateOne({ _id: id }, { $set, $unset: { maxPengguna: '' } });
    } else {
        if (input.maxPengguna !== undefined) $set.maxPengguna = input.maxPengguna;
        await col().updateOne({ _id: id }, { $set });
    }
    if (input.nama !== undefined && input.nama !== prev.nama) {
        try {
            await renameSimpleQueue(prev.nama, input.nama);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            logger.warn(`updatePelangganInfo: rename queue MikroTik gagal: ${msg}`);
        }
    }
    const updated = await getPelanggan(id);
    try {
        await applyMaxPenggunaMikrotik(updated.ipAddress, updated.maxPengguna);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.warn(`updatePelangganInfo: max pengguna MikroTik gagal: ${msg}`);
    }
    return updated;
}

export async function gantiMacPelanggan(
    id: ObjectId,
    macAddress: string
): Promise<PelangganPopulated> {
    const pel = await getPelanggan(id);
    await gantiMacMikrotik(pel.ipAddress, macAddress);
    const normalized = normalizeMac(macAddress);
    await col().updateOne({ _id: id }, { $set: { macAddress: normalized, updatedAt: new Date() } });
    return getPelanggan(id);
}
