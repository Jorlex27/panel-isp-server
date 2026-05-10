import { createMikrotikClient, type MikrotikRestClient, type RosRow } from '../src/shared/utils/mikrotik-rest.util';

const host = process.env.MIKROTIK_HOST ?? '';
const user = process.env.MIKROTIK_USER ?? '';
const password = process.env.MIKROTIK_PASS ?? '';

function rosStr(row: RosRow, key: string): string | undefined {
    const v = row[key];
    return typeof v === 'string' ? v : undefined;
}

async function removeAll(client: MikrotikRestClient, menu: string, items: RosRow[]) {
    for (const item of items) {
        const id = rosStr(item, '.id');
        if (id) await client.remove(menu, id);
    }
}

async function cleanup(client: MikrotikRestClient) {
    console.log('--- Cleanup ---');

    const ether2Ports = await client.print('interface/bridge/port', { interface: 'ether2' });
    await removeAll(client, 'interface/bridge/port', ether2Ports);
    if (ether2Ports.length) console.log(`✓ Lepas ether2 dari bridge`);

    const fwRules = await client.print('ip/firewall/filter', { 'in-interface': 'ether4' });
    await removeAll(client, 'ip/firewall/filter', fwRules);
    console.log(`✓ Hapus ${fwRules.length} firewall filter rule (ether4)`);

    const natRules = await client.print('ip/firewall/nat', { comment: 'nat-internet' });
    await removeAll(client, 'ip/firewall/nat', natRules);
    console.log(`✓ Hapus ${natRules.length} NAT rule`);

    const addrList = await client.print('ip/firewall/address-list', { list: 'pelanggan-aktif' });
    await removeAll(client, 'ip/firewall/address-list', addrList);
    console.log(`✓ Hapus ${addrList.length} address-list entry`);

    const queues = await client.print('queue/simple');
    await removeAll(client, 'queue/simple', queues);
    console.log(`✓ Hapus ${queues.length} simple queue`);

    const leases = await client.print('ip/dhcp-server/lease');
    await removeAll(client, 'ip/dhcp-server/lease', leases);
    console.log(`✓ Hapus ${leases.length} DHCP lease`);

    for (const iface of ['ether2', 'ether4', 'bridge', 'bridge-lan', 'bridge-admin']) {
        const servers = await client.print('ip/dhcp-server', { interface: iface });
        await removeAll(client, 'ip/dhcp-server', servers);
        if (servers.length) console.log(`✓ Hapus ${servers.length} DHCP server (${iface})`);
    }

    for (const addr of ['10.10.0.0/24', '172.33.1.0/24', '192.168.88.0/24']) {
        const nets = await client.print('ip/dhcp-server/network', { address: addr });
        await removeAll(client, 'ip/dhcp-server/network', nets);
        if (nets.length) console.log(`✓ Hapus ${nets.length} DHCP network (${addr})`);
    }

    for (const name of ['pool-pelanggan', 'pool-admin']) {
        const pools = await client.print('ip/pool', { name });
        await removeAll(client, 'ip/pool', pools);
        if (pools.length) console.log(`✓ Hapus ${pools.length} IP pool (${name})`);
    }

    for (const iface of ['ether2', 'ether4']) {
        const addrs = await client.print('ip/address', { interface: iface });
        await removeAll(client, 'ip/address', addrs);
        if (addrs.length) console.log(`✓ Hapus ${addrs.length} IP di ${iface}`);
    }

    const dhcpClients = await client.print('ip/dhcp-client', { interface: 'ether1' });
    await removeAll(client, 'ip/dhcp-client', dhcpClients);
    if (dhcpClients.length) console.log(`✓ Hapus ${dhcpClients.length} DHCP client (ether1)`);
}

async function setup(client: MikrotikRestClient) {
    console.log('\n--- Setup ---');

    await client.add('ip/address', { address: '172.33.1.1/24', interface: 'ether2' });
    console.log('✓ IP ether2: 172.33.1.1/24');

    await client.add('ip/pool', { name: 'pool-admin', ranges: '172.33.1.2-172.33.1.10' });
    await client.add('ip/dhcp-server', {
        name: 'dhcp-admin',
        interface: 'ether2',
        'address-pool': 'pool-admin',
        disabled: 'no',
    });
    await client.add('ip/dhcp-server/network', {
        address: '172.33.1.0/24',
        gateway: '172.33.1.1',
        'dns-server': '8.8.8.8,8.8.4.4',
    });
    console.log('✓ DHCP server ether2: 172.33.1.2-10');

    await client.add('ip/address', { address: '10.10.0.1/24', interface: 'ether4' });
    console.log('✓ IP ether4: 10.10.0.1/24');

    await client.add('ip/pool', { name: 'pool-pelanggan', ranges: '10.10.0.201-10.10.0.254' });
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
    console.log('✓ DHCP server ether4');

    await client.add('ip/dhcp-client', {
        interface: 'ether1',
        disabled: 'no',
        'add-default-route': 'yes',
        'use-peer-dns': 'yes',
    });
    console.log('✓ DHCP client ether1 (WAN)');

    await client.add('ip/firewall/nat', {
        chain: 'srcnat',
        'out-interface': 'ether1',
        action: 'masquerade',
        comment: 'nat-internet',
    });
    console.log('✓ NAT masquerade ether1');

    await client.add('ip/firewall/filter', {
        chain: 'forward',
        'in-interface': 'ether4',
        'src-address-list': 'pelanggan-aktif',
        action: 'accept',
        comment: 'izin-pelanggan-aktif',
    });
    await client.add('ip/firewall/filter', {
        chain: 'forward',
        'in-interface': 'ether4',
        action: 'drop',
        comment: 'blokir-pelanggan-nonaktif',
    });
    console.log('✓ Firewall ether4');

    const existingUsers = await client.print('user', { name: 'panel-api' });
    if (existingUsers.length === 0) {
        await client.add('user', { name: 'panel-api', password: 'Jorlex22', group: 'full' });
        console.log('✓ User panel-api dibuat');
    } else {
        console.log('✓ User panel-api sudah ada');
    }
}

async function run() {
    if (!host || !user || !password) {
        console.error('Error: MIKROTIK_HOST, MIKROTIK_USER, MIKROTIK_PASS wajib diisi di .env');
        process.exit(1);
    }

    const client = createMikrotikClient();
    await client.ping();
    console.log(`Terhubung ke MikroTik ${host} (REST)\n`);

    await cleanup(client);
    await setup(client);
    console.log('\nSetup selesai.');
}

run().catch(err => {
    console.error('Gagal:', err);
    process.exit(1);
});
