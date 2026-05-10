import { db } from '@shared/utils/db.util';
import { createMikrotikClient, type RosRow } from '@shared/utils/mikrotik-rest.util';

export interface IpPoolOverview {
    network: string;
    prefix: string;
    rangeStart: number;
    rangeEnd: number;
    capacity: number;
    assignedInDb: number;
    freeSlots: number;
}

export interface RouterOverview {
    ok: boolean;
    version?: string;
    uptime?: string;
    boardName?: string;
    architecture?: string;
    error?: string;
}

export interface MikrotikCountsOverview {
    ok: boolean;
    dhcpLeaseTotal: number;
    simpleQueueTotal: number;
    addressListPelangganAktif: number;
    error?: string;
}

export interface LeaseAnomaly {
    address: string;
    macAddress: string;
    dynamic: string;
    comment: string;
}

export interface MonitoringOverview {
    generatedAt: string;
    ipPool: IpPoolOverview;
    router: RouterOverview;
    mikrotik: MikrotikCountsOverview;
    dhcpLeasesInPoolNotInDb: LeaseAnomaly[];
    sampleQueues: { name: string; target: string; maxLimit: string }[];
}

function getPoolConfig(): { network: string; prefix: string; start: number; end: number } {
    const network = process.env.IP_POOL_NETWORK ?? '10.10.0.0';
    const start = Number(process.env.IP_POOL_START ?? '10');
    const end = Number(process.env.IP_POOL_END ?? '254');
    const prefix = network.split('.').slice(0, 3).join('.');
    return { network, prefix, start, end };
}

function ipInPool(ipRaw: string, prefix: string, start: number, end: number): boolean {
    const ip = ipRaw.split('/')[0] ?? '';
    const parts = ip.split('.');
    if (parts.length !== 4) return false;
    if (parts.slice(0, 3).join('.') !== prefix) return false;
    const last = Number(parts[3]);
    if (Number.isNaN(last)) return false;
    return last >= start && last <= end;
}

function firstStr(row: RosRow, key: string): string {
    const v = row[key];
    return typeof v === 'string' ? v : '';
}

function resourceRow(json: unknown): RosRow | null {
    if (Array.isArray(json) && json[0] !== undefined && typeof json[0] === 'object' && json[0] !== null) {
        return json[0] as RosRow;
    }
    if (json !== null && typeof json === 'object') {
        return json as RosRow;
    }
    return null;
}

export async function getOverview(): Promise<MonitoringOverview> {
    const { network, prefix, start, end } = getPoolConfig();
    const capacity = end - start + 1;

    const pelCol = db.getCollection('pelanggan');
    const allIps = await pelCol.find({}, { projection: { ipAddress: 1 } }).toArray();
    const dbIpsInPool = new Set<string>();
    for (const doc of allIps) {
        const ip = typeof doc.ipAddress === 'string' ? doc.ipAddress : '';
        if (ipInPool(ip, prefix, start, end)) dbIpsInPool.add(ip.split('/')[0] ?? ip);
    }
    const assignedInDb = dbIpsInPool.size;
    const freeSlots = Math.max(0, capacity - assignedInDb);

    let router: RouterOverview = { ok: false, error: 'Belum diisi' };
    let mikrotik: MikrotikCountsOverview = {
        ok: false,
        dhcpLeaseTotal: 0,
        simpleQueueTotal: 0,
        addressListPelangganAktif: 0,
    };
    const dhcpLeasesInPoolNotInDb: LeaseAnomaly[] = [];
    const sampleQueues: { name: string; target: string; maxLimit: string }[] = [];

    try {
        const client = createMikrotikClient();
        await client.ping();
        const [resourceRaw, leases, queues, addrRows] = await Promise.all([
            client.getJson('system/resource'),
            client.print('ip/dhcp-server/lease'),
            client.print('queue/simple'),
            client.print('ip/firewall/address-list', { list: 'pelanggan-aktif' }),
        ]);

        const resRow = resourceRow(resourceRaw);
        router = resRow
            ? {
                  ok: true,
                  version: firstStr(resRow, 'version'),
                  uptime: firstStr(resRow, 'uptime'),
                  boardName: firstStr(resRow, 'board-name'),
                  architecture: firstStr(resRow, 'architecture-name'),
              }
            : { ok: false, error: 'Respons resource tidak dikenali' };

        mikrotik = {
            ok: true,
            dhcpLeaseTotal: leases.length,
            simpleQueueTotal: queues.length,
            addressListPelangganAktif: addrRows.length,
        };

        for (const row of leases) {
            const addrFull = firstStr(row, 'address') || firstStr(row, 'active-address');
            const base = addrFull.split('/')[0] ?? '';
            if (!base || !ipInPool(base, prefix, start, end)) continue;
            if (dbIpsInPool.has(base)) continue;
            dhcpLeasesInPoolNotInDb.push({
                address: base,
                macAddress: firstStr(row, 'mac-address'),
                dynamic: firstStr(row, 'dynamic'),
                comment: firstStr(row, 'comment'),
            });
            if (dhcpLeasesInPoolNotInDb.length >= 80) break;
        }

        for (let i = 0; i < queues.length && sampleQueues.length < 25; i++) {
            const q = queues[i];
            if (!q) continue;
            sampleQueues.push({
                name: firstStr(q, 'name'),
                target: firstStr(q, 'target'),
                maxLimit: firstStr(q, 'max-limit'),
            });
        }
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        router = { ok: false, error: msg };
        mikrotik = {
            ok: false,
            dhcpLeaseTotal: 0,
            simpleQueueTotal: 0,
            addressListPelangganAktif: 0,
            error: msg,
        };
    }

    return {
        generatedAt: new Date().toISOString(),
        ipPool: {
            network,
            prefix,
            rangeStart: start,
            rangeEnd: end,
            capacity,
            assignedInDb,
            freeSlots,
        },
        router,
        mikrotik,
        dhcpLeasesInPoolNotInDb,
        sampleQueues,
    };
}

function normalizeConnSrcIpv4(raw: string): string {
    const m = raw.trim().match(/^(\d{1,3}(?:\.\d{1,3}){3})/);
    return m?.[1] ?? '';
}

export interface PelangganKoneksiRow {
    pelangganId: string;
    ipAddress: string;
    nama: string;
    status: 'aktif' | 'suspend';
    maxPengguna?: number;
    diAddressList: boolean;
    koneksi: number;
}

export interface PelangganKoneksiOverview {
    generatedAt: string;
    ok: boolean;
    error?: string;
    rows: PelangganKoneksiRow[];
}

export async function getPelangganKoneksi(): Promise<PelangganKoneksiOverview> {
    const { prefix, start, end } = getPoolConfig();
    const pelCol = db.getCollection('pelanggan');
    const docs = await pelCol
        .find({})
        .project({ ipAddress: 1, nama: 1, status: 1, maxPengguna: 1 })
        .toArray();

    const inPool = docs.filter(d => {
        const ip = typeof d.ipAddress === 'string' ? d.ipAddress : '';
        return ipInPool(ip, prefix, start, end);
    });

    const counts = new Map<string, number>();
    const addressSet = new Set<string>();
    let ok = false;
    let error: string | undefined;

    try {
        const client = createMikrotikClient();
        await client.ping();
        const [connRows, addrRows] = await Promise.all([
            client.print('ip/firewall/connection'),
            client.print('ip/firewall/address-list', { list: 'pelanggan-aktif' }),
        ]);
        ok = true;
        for (const row of addrRows) {
            const raw = firstStr(row, 'address') || firstStr(row, 'active-address');
            const base = raw.split('/')[0] ?? '';
            if (base) addressSet.add(base);
        }
        for (const row of connRows) {
            const raw = firstStr(row, 'src-address');
            const src = normalizeConnSrcIpv4(raw);
            if (!src || !ipInPool(src, prefix, start, end)) continue;
            counts.set(src, (counts.get(src) ?? 0) + 1);
        }
    } catch (e) {
        error = e instanceof Error ? e.message : String(e);
    }

    const rows: PelangganKoneksiRow[] = inPool.map(p => {
        const ip = (typeof p.ipAddress === 'string' ? p.ipAddress : '').split('/')[0] ?? '';
        const st = p.status === 'suspend' ? 'suspend' : 'aktif';
        return {
            pelangganId: String(p._id ?? ''),
            ipAddress: ip,
            nama: typeof p.nama === 'string' ? p.nama : '',
            status: st,
            maxPengguna: typeof p.maxPengguna === 'number' ? p.maxPengguna : undefined,
            diAddressList: addressSet.has(ip),
            koneksi: counts.get(ip) ?? 0,
        };
    });
    rows.sort((a, b) => b.koneksi - a.koneksi || a.ipAddress.localeCompare(b.ipAddress));

    return {
        generatedAt: new Date().toISOString(),
        ok,
        error,
        rows,
    };
}
