import { RouterOSAPI } from 'node-routeros';

const conn = new RouterOSAPI({
    host: process.env.MIKROTIK_HOST ?? '',
    user: process.env.MIKROTIK_USER ?? '',
    password: process.env.MIKROTIK_PASS ?? '',
    port: Number(process.env.MIKROTIK_PORT ?? '8728'),
});

await conn.connect();

const leases = await conn.write('/ip/dhcp-server/lease/print', ['?address=10.10.0.201']);
const row = leases[0] as Record<string, unknown> | undefined;
if (row) {
    console.log(`WAN MAC TP-Link: ${row['mac-address']}`);
} else {
    console.log('Lease 10.10.0.201 tidak ditemukan');
}

await conn.close();
