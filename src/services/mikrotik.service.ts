import { createMikrotikClient, type MikrotikRestClient, type RosRow } from '@shared/utils/mikrotik-rest.util';
import { logger } from '@shared/utils/logger.util';

function rosStr(row: RosRow, key: string): string | undefined {
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

async function withMt<T>(fn: (client: MikrotikRestClient) => Promise<T>): Promise<T> {
    const client = createMikrotikClient();
    await client.ping();
    return fn(client);
}

async function addToAddressList(client: MikrotikRestClient, ip: string): Promise<void> {
    const existing = await client.print('ip/firewall/address-list', {
        list: 'pelanggan-aktif',
        address: ip,
    });
    if (existing.length === 0) {
        await client.add('ip/firewall/address-list', {
            list: 'pelanggan-aktif',
            address: ip,
        });
    }
}

async function clearLeaseByMac(client: MikrotikRestClient, mac: string): Promise<void> {
    const leases = await client.print('ip/dhcp-server/lease', { 'mac-address': mac });
    for (const lease of leases) {
        const lid = rosStr(lease, '.id');
        if (lid) await client.remove('ip/dhcp-server/lease', lid);
    }
}

async function removeFromAddressList(client: MikrotikRestClient, ip: string): Promise<void> {
    const res = await client.print('ip/firewall/address-list', {
        list: 'pelanggan-aktif',
        address: ip,
    });
    const id = res[0] ? rosStr(res[0], '.id') : undefined;
    if (id) await client.remove('ip/firewall/address-list', id);
}

export async function setupAwal(): Promise<void> {
    await withMt(async client => {
        const eth2 = await client.print('ip/address', { interface: 'ether2' });
        if (eth2.length === 0) {
            await client.add('ip/address', {
                address: '192.168.88.1/24',
                interface: 'ether2',
            });
        }

        const eth4 = await client.print('ip/address', { interface: 'ether4' });
        if (eth4.length === 0) {
            await client.add('ip/address', {
                address: '10.10.0.1/24',
                interface: 'ether4',
            });
        }

        const pool = await client.print('ip/pool', { name: 'pool-pelanggan' });
        if (pool.length === 0) {
            await client.add('ip/pool', {
                name: 'pool-pelanggan',
                ranges: '10.10.0.10-10.10.0.254',
            });
        }

        const dhcp = await client.print('ip/dhcp-server', { interface: 'ether4' });
        if (dhcp.length === 0) {
            await client.add('ip/dhcp-server', {
                name: 'dhcp-pelanggan',
                interface: 'ether4',
                'address-pool': 'pool-pelanggan',
                disabled: 'no',
            });
            await client.add('ip/dhcp-server/network', {
                address: '10.10.0.0/24',
                gateway: '10.10.0.1',
                'dns-server': '8.8.8.8,8.8.4.4',
            });
        }

        const nat = await client.print('ip/firewall/nat', { comment: 'nat-internet' });
        if (nat.length === 0) {
            await client.add('ip/firewall/nat', {
                chain: 'srcnat',
                'out-interface': 'ether1',
                action: 'masquerade',
                comment: 'nat-internet',
            });
        }

        const fwAllow = await client.print('ip/firewall/filter', { comment: 'izin-pelanggan-aktif' });
        if (fwAllow.length === 0) {
            await client.add('ip/firewall/filter', {
                chain: 'forward',
                'in-interface': 'ether4',
                'src-address-list': 'pelanggan-aktif',
                action: 'accept',
                comment: 'izin-pelanggan-aktif',
            });
        }

        const fwDrop = await client.print('ip/firewall/filter', { comment: 'blokir-pelanggan-nonaktif' });
        if (fwDrop.length === 0) {
            await client.add('ip/firewall/filter', {
                chain: 'forward',
                'in-interface': 'ether4',
                action: 'drop',
                comment: 'blokir-pelanggan-nonaktif',
            });
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
    await withMt(async client => {
        await clearLeaseByMac(client, leaseMac);
        await client.add('ip/dhcp-server/lease', {
            address: ip,
            'mac-address': leaseMac,
            comment: nama,
        });
        await client.add('queue/simple', {
            name: nama,
            target: ip,
            'max-limit': `${speedDown}M/${speedUp}M`,
        });
        await addToAddressList(client, ip);
    });
}

export async function suspendPelanggan(ip: string): Promise<void> {
    await withMt(async client => {
        const res = await client.print('queue/simple', { target: `${ip}/32` });
        const id = res[0] ? rosStr(res[0], '.id') : undefined;
        if (id) {
            await client.set('queue/simple', id, { 'max-limit': '256k/256k' });
        }
        await removeFromAddressList(client, ip);
    });
}

export async function aktifkanPelanggan(ip: string, speedDown: number, speedUp: number): Promise<void> {
    await withMt(async client => {
        const res = await client.print('queue/simple', { target: `${ip}/32` });
        const id = res[0] ? rosStr(res[0], '.id') : undefined;
        if (id) {
            await client.set('queue/simple', id, { 'max-limit': `${speedDown}M/${speedUp}M` });
        }
        await addToAddressList(client, ip);
    });
}

export async function hapusPelanggan(ip: string, nama: string): Promise<void> {
    await withMt(async client => {
        const queue = await client.print('queue/simple', { name: nama });
        const qid = queue[0] ? rosStr(queue[0], '.id') : undefined;
        if (qid) await client.remove('queue/simple', qid);

        const lease = await client.print('ip/dhcp-server/lease', { address: ip });
        const lid = lease[0] ? rosStr(lease[0], '.id') : undefined;
        if (lid) await client.remove('ip/dhcp-server/lease', lid);

        await removeFromAddressList(client, ip);
    });
}

export async function gantiPaketMikrotik(
    nama: string,
    speedDown: number,
    speedUp: number
): Promise<void> {
    await withMt(async client => {
        const res = await client.print('queue/simple', { name: nama });
        const id = res[0] ? rosStr(res[0], '.id') : undefined;
        if (id) {
            await client.set('queue/simple', id, { 'max-limit': `${speedDown}M/${speedUp}M` });
        } else {
            logger.warn(`gantiPaketMikrotik: queue '${nama}' tidak ditemukan di MikroTik`);
        }
    });
}

export async function gantiMacMikrotik(ip: string, newMac: string): Promise<void> {
    const normalizedMac = normalizeMac(newMac);
    await withMt(async client => {
        await clearLeaseByMac(client, normalizedMac);
        const res = await client.print('ip/dhcp-server/lease', { address: ip });
        const id = res[0] ? rosStr(res[0], '.id') : undefined;
        if (id) {
            await client.set('ip/dhcp-server/lease', id, { 'mac-address': normalizedMac });
        }
    });
}
