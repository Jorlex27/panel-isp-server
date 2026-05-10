import { RouterOSAPI } from 'node-routeros';

const conn = new RouterOSAPI({
    host: process.env.MIKROTIK_HOST ?? '',
    user: process.env.MIKROTIK_USER ?? '',
    password: process.env.MIKROTIK_PASS ?? '',
    port: Number(process.env.MIKROTIK_PORT ?? '8728'),
});

await conn.connect();

// Pool
await conn.write('/ip/pool/add', [
    '=name=pool-admin',
    '=ranges=192.168.88.2-192.168.88.10',
]);
console.log('✓ Pool admin: 192.168.88.2-192.168.88.10');

// DHCP server
await conn.write('/ip/dhcp-server/add', [
    '=name=dhcp-admin',
    '=interface=ether2',
    '=address-pool=pool-admin',
    '=disabled=no',
]);
console.log('✓ DHCP server ether2');

// DHCP network
await conn.write('/ip/dhcp-server/network/add', [
    '=address=192.168.88.0/24',
    '=gateway=192.168.88.1',
    '=dns-server=8.8.8.8,8.8.4.4',
]);
console.log('✓ DHCP network 192.168.88.0/24');

await conn.close();
