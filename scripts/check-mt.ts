import { createMikrotikClient } from '../src/shared/utils/mikrotik-rest.util';

const client = createMikrotikClient();
await client.ping();

const leases = await client.print('ip/dhcp-server/lease', { address: '10.10.0.201' });
const row = leases[0];
if (row) {
    console.log(`WAN MAC TP-Link: ${row['mac-address']}`);
} else {
    console.log('Lease 10.10.0.201 tidak ditemukan');
}
