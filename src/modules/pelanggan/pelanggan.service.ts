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
import type { BayarBodyInput, GantiPaketBodyInput, PelangganCreateInput, PelangganUpdateInfoInput } from './pelanggan.schema';
import { kirimDiscordSafe } from '@/services/discord.service';

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
        const maxLine =
            created.maxPengguna != null ? `\nMax pengguna: ${created.maxPengguna}` : '';
        const suspendNote =
            statusPel === 'suspend' ? '\nCatatan: dibuat langsung suspend (MikroTik).' : '';
        kirimDiscordSafe(
            `**${created.nama}**\nIP: \`${created.ipAddress}\`\nMAC: \`${created.macAddress}\`\nPaket: ${created.paket?.nama ?? '—'}\nStatus: ${created.status}\nStatus bayar: ${statusBayar}${maxLine}${suspendNote}`,
            'Pelanggan baru',
            0x57f287
        );
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
    const refreshed = await getPelanggan(id);
    kirimDiscordSafe(
        `**${refreshed.nama}** (${typeof refreshed.noHp === 'string' ? refreshed.noHp : '-'})\nIP: \`${refreshed.ipAddress}\``,
        'Pelanggan disuspend',
        0xe74c3c
    );
    return refreshed;
}

export async function aktifkanPelangganDb(id: ObjectId): Promise<PelangganPopulated> {
    const pel = await getPelanggan(id);
    const lang = await langgananService.requireByPelangganId(id);
    const pak = lang.paket;
    if (!pak) throw ApiError.badRequest('Paket langganan tidak ditemukan', 'MISSING_PAKET');
    await aktifkanPelanggan(pel.ipAddress, pak.speedDown, pak.speedUp, pel.nama);
    await col().updateOne({ _id: id }, { $set: { status: 'aktif', updatedAt: new Date() } });
    const refreshed = await getPelanggan(id);
    kirimDiscordSafe(
        `**${refreshed.nama}** (${typeof refreshed.noHp === 'string' ? refreshed.noHp : '-'})\nIP: \`${refreshed.ipAddress}\``,
        'Pelanggan diaktifkan',
        0x57f287
    );
    return refreshed;
}

export async function deletePelangganDb(id: ObjectId): Promise<void> {
    const pel = await getPelanggan(id);
    await hapusPelanggan(pel.ipAddress, pel.nama);
    await db.withTransaction(async (session) => {
        await langgananService.deleteByPelangganId(id, session);
        await col().deleteOne({ _id: id }, { session });
    });
    kirimDiscordSafe(
        `**${pel.nama}**\nIP: \`${pel.ipAddress}\`\nMAC: \`${pel.macAddress}\``,
        'Pelanggan dihapus',
        0x992d22
    );
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
    const aktifPart = pel.status === 'suspend' ? '\nStatus: diaktifkan karena lunas.' : '';
    kirimDiscordSafe(
        `**${pel.nama}** (${typeof pel.noHp === 'string' ? pel.noHp : '-'})\nJumlah: Rp ${body.jumlah.toLocaleString('id-ID')}\nMetode: ${body.metode}${aktifPart}\nBerlaku s/d: ${lang.tanggalExpire instanceof Date ? lang.tanggalExpire.toLocaleDateString('id-ID') : String(lang.tanggalExpire)}`,
        'Pembayaran pelanggan',
        0xf1c40f
    );
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
    const paketLama = pel.paket?.nama ?? '—';
    await gantiPaketMikrotik(pel.nama, maxLimit);
    await langgananService.updatePaketId(id, paketId);
    const out = await getPelanggan(id);
    kirimDiscordSafe(
        `**${out.nama}**\nPaket: ${paketLama} → ${out.paket?.nama ?? '—'}`,
        'Ganti paket pelanggan',
        0x3498db
    );
    return out;
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
    const parts: string[] = [];
    if (input.nama !== undefined && input.nama !== prev.nama) {
        parts.push(`Nama: ${prev.nama} → ${input.nama}`);
    }
    if (input.noHp !== undefined && input.noHp !== prev.noHp) {
        parts.push(`HP: ${prev.noHp ?? '—'} → ${input.noHp}`);
    }
    if (input.alamat !== undefined && input.alamat !== prev.alamat) {
        parts.push('Alamat diubah');
    }
    if (input.maxPengguna === null && prev.maxPengguna != null) {
        parts.push(`Max pengguna dihapus (sebelum ${prev.maxPengguna})`);
    } else if (
        input.maxPengguna !== undefined &&
        input.maxPengguna !== prev.maxPengguna
    ) {
        parts.push(`Max pengguna: ${prev.maxPengguna ?? '—'} → ${input.maxPengguna}`);
    }
    if (parts.length > 0) {
        kirimDiscordSafe(
            `**${updated.nama}**\nIP: \`${updated.ipAddress}\`\n${parts.join('\n')}`,
            'Info pelanggan diubah',
            0x95a5a6
        );
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
    const out = await getPelanggan(id);
    kirimDiscordSafe(
        `**${out.nama}**\nIP: \`${out.ipAddress}\`\nMAC: \`${pel.macAddress}\` → \`${normalized}\``,
        'Ganti MAC pelanggan',
        0x9b59b6
    );
    return out;
}
