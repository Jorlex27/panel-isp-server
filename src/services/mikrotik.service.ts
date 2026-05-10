import { RouterOSAPI } from 'node-routeros';
import { logger } from '@shared/utils/logger.util';

function rosStr(row: Record<string, unknown>, key: string): string | undefined {
    const v = row[key];
    return typeof v === 'string' ? v : undefined;
}

export function normalizeMac(mac: string): string {
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

async function addToAddressList(conn: RouterOSAPI, ip: string): Promise<void> {
    const existing = await conn.write('/ip/firewall/address-list/print', [
        '?list=pelanggan-aktif',
        `?address=${ip}`,
    ]);
    if (existing.length === 0) {
        await conn.write('/ip/firewall/address-list/add', [
            '=list=pelanggan-aktif',
            `=address=${ip}`,
        ]);
    }
}

async function clearLeaseByMac(conn: RouterOSAPI, mac: string): Promise<void> {
    const leases = await conn.write('/ip/dhcp-server/lease/print', [`?mac-address=${mac}`]);
    for (const lease of leases) {
        const lid = rosStr(lease as Record<string, unknown>, '.id');
        if (lid) await conn.write('/ip/dhcp-server/lease/remove', [`=.id=${lid}`]);
    }
}

async function removeFromAddressList(conn: RouterOSAPI, ip: string): Promise<void> {
    const res = await conn.write('/ip/firewall/address-list/print', [
        '?list=pelanggan-aktif',
        `?address=${ip}`,
    ]);
    const id = res[0] ? rosStr(res[0] as Record<string, unknown>, '.id') : undefined;
    if (id) {
        await conn.write('/ip/firewall/address-list/remove', [`=.id=${id}`]);
    }
}

// Jalankan sekali untuk konfigurasi awal MikroTik RT/RW
export async function setupAwal(): Promise<void> {
    await withRos(async conn => {
        // IP ether2 (admin)
        const eth2 = await conn.write('/ip/address/print', ['?interface=ether2']);
        if (eth2.length === 0) {
            await conn.write('/ip/address/add', [
                '=address=192.168.88.1/24',
                '=interface=ether2',
            ]);
        }

        // IP ether4 (pelanggan)
        const eth4 = await conn.write('/ip/address/print', ['?interface=ether4']);
        if (eth4.length === 0) {
            await conn.write('/ip/address/add', [
                '=address=10.10.0.1/24',
                '=interface=ether4',
            ]);
        }

        // DHCP pool
        const pool = await conn.write('/ip/pool/print', ['?name=pool-pelanggan']);
        if (pool.length === 0) {
            await conn.write('/ip/pool/add', [
                '=name=pool-pelanggan',
                '=ranges=10.10.0.10-10.10.0.254',
            ]);
        }

        // DHCP server ether4
        const dhcp = await conn.write('/ip/dhcp-server/print', ['?interface=ether4']);
        if (dhcp.length === 0) {
            await conn.write('/ip/dhcp-server/add', [
                '=name=dhcp-pelanggan',
                '=interface=ether4',
                '=address-pool=pool-pelanggan',
                '=disabled=no',
            ]);
            await conn.write('/ip/dhcp-server/network/add', [
                '=address=10.10.0.0/24',
                '=gateway=10.10.0.1',
                '=dns-server=8.8.8.8,8.8.4.4',
            ]);
        }

        // NAT masquerade keluar ether1
        const nat = await conn.write('/ip/firewall/nat/print', ['?comment=nat-internet']);
        if (nat.length === 0) {
            await conn.write('/ip/firewall/nat/add', [
                '=chain=srcnat',
                '=out-interface=ether1',
                '=action=masquerade',
                '=comment=nat-internet',
            ]);
        }

        // Firewall: izinkan pelanggan-aktif forward ke internet
        const fwAllow = await conn.write('/ip/firewall/filter/print', [
            '?comment=izin-pelanggan-aktif',
        ]);
        if (fwAllow.length === 0) {
            await conn.write('/ip/firewall/filter/add', [
                '=chain=forward',
                '=in-interface=ether4',
                '=src-address-list=pelanggan-aktif',
                '=action=accept',
                '=comment=izin-pelanggan-aktif',
            ]);
        }

        // Firewall: blokir semua dari ether4 yang belum aktif
        const fwDrop = await conn.write('/ip/firewall/filter/print', [
            '?comment=blokir-pelanggan-nonaktif',
        ]);
        if (fwDrop.length === 0) {
            await conn.write('/ip/firewall/filter/add', [
                '=chain=forward',
                '=in-interface=ether4',
                '=action=drop',
                '=comment=blokir-pelanggan-nonaktif',
            ]);
        }

        logger.info('setupAwal: konfigurasi MikroTik selesai');
    });
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
        await clearLeaseByMac(conn, leaseMac);
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
        await addToAddressList(conn, ip);
    });
}

export async function suspendPelanggan(ip: string): Promise<void> {
    await withRos(async conn => {
        const res = await conn.write('/queue/simple/print', [`?target=${ip}/32`]);
        const id = res[0] ? rosStr(res[0] as Record<string, unknown>, '.id') : undefined;
        if (id) {
            await conn.write('/queue/simple/set', [`=.id=${id}`, '=max-limit=256k/256k']);
        }
        await removeFromAddressList(conn, ip);
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
        await addToAddressList(conn, ip);
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

        await removeFromAddressList(conn, ip);
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

export async function gantiMacMikrotik(ip: string, newMac: string): Promise<void> {
    const normalizedMac = normalizeMac(newMac);
    await withRos(async conn => {
        // Hapus semua lease dengan MAC baru (dynamic) agar device dapat static lease
        await clearLeaseByMac(conn, normalizedMac);
        const res = await conn.write('/ip/dhcp-server/lease/print', [`?address=${ip}`]);
        const id = res[0] ? rosStr(res[0] as Record<string, unknown>, '.id') : undefined;
        if (id) {
            await conn.write('/ip/dhcp-server/lease/set', [
                `=.id=${id}`,
                `=mac-address=${normalizedMac}`,
            ]);
        }
    });
}
