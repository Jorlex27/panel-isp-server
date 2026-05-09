import { RouterOSAPI } from 'node-routeros';
import { logger } from '@shared/utils/logger.util';

function rosStr(row: Record<string, unknown>, key: string): string | undefined {
    const v = row[key];
    return typeof v === 'string' ? v : undefined;
}

function normalizeMac(mac: string): string {
    return mac
        .trim()
        .replace(/-/g, ':')
        .split(':')
        .map(part => part.toUpperCase())
        .join(':');
}

function createApi(): RouterOSAPI {
    const host = process.env.MIKROTIK_HOST ?? '';
    const user = process.env.MIKROTIK_USER ?? '';
    const password = process.env.MIKROTIK_PASS ?? '';
    const port = Number(process.env.MIKROTIK_PORT ?? '8728');
    return new RouterOSAPI({ host, user, password, port });
}

async function withRos<T>(fn: (conn: RouterOSAPI) => Promise<T>): Promise<T> {
    const conn = createApi();
    await conn.connect();
    try {
        return await fn(conn);
    } finally {
        await conn.close();
    }
}

export async function tambahPelanggan(
    ip: string,
    mac: string,
    speedDown: number,
    speedUp: number,
    nama: string
): Promise<void> {
    const leaseMac = normalizeMac(mac);
    await withRos(async conn => {
        await conn.write('/ip/dhcp-server/lease/add', [
            `=address=${ip}`,
            `=mac-address=${leaseMac}`,
            `=comment=${nama}`,
        ]);
        await conn.write('/queue/simple/add', [
            `=name=${nama}`,
            `=target=${ip}`,
            `=max-limit=${speedDown}M/${speedUp}M`,
        ]);
    });
}

export async function suspendPelanggan(ip: string): Promise<void> {
    await withRos(async conn => {
        const res = await conn.write('/queue/simple/print', [`?target=${ip}/32`]);
        const id = res[0] ? rosStr(res[0] as Record<string, unknown>, '.id') : undefined;
        if (id) {
            await conn.write('/queue/simple/set', [`=.id=${id}`, '=max-limit=256k/256k']);
        }
    });
}

export async function aktifkanPelanggan(ip: string, speedDown: number, speedUp: number): Promise<void> {
    await withRos(async conn => {
        const res = await conn.write('/queue/simple/print', [`?target=${ip}/32`]);
        const id = res[0] ? rosStr(res[0] as Record<string, unknown>, '.id') : undefined;
        if (id) {
            await conn.write('/queue/simple/set', [
                `=.id=${id}`,
                `=max-limit=${speedDown}M/${speedUp}M`,
            ]);
        }
    });
}

export async function hapusPelanggan(ip: string, nama: string): Promise<void> {
    await withRos(async conn => {
        const queue = await conn.write('/queue/simple/print', [`?name=${nama}`]);
        const qid = queue[0] ? rosStr(queue[0] as Record<string, unknown>, '.id') : undefined;
        if (qid) await conn.write('/queue/simple/remove', [`=.id=${qid}`]);

        const lease = await conn.write('/ip/dhcp-server/lease/print', [`?address=${ip}`]);
        const lid = lease[0] ? rosStr(lease[0] as Record<string, unknown>, '.id') : undefined;
        if (lid) await conn.write('/ip/dhcp-server/lease/remove', [`=.id=${lid}`]);
    });
}

export async function gantiPaketMikrotik(
    nama: string,
    speedDown: number,
    speedUp: number
): Promise<void> {
    await withRos(async conn => {
        const res = await conn.write('/queue/simple/print', [`?name=${nama}`]);
        const id = res[0] ? rosStr(res[0] as Record<string, unknown>, '.id') : undefined;
        if (id) {
            await conn.write('/queue/simple/set', [
                `=.id=${id}`,
                `=max-limit=${speedDown}M/${speedUp}M`,
            ]);
        } else {
            logger.warn(`gantiPaketMikrotik: queue '${nama}' tidak ditemukan di MikroTik`);
        }
    });
}
