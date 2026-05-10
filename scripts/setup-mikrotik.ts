import { RouterOSAPI } from 'node-routeros';

const host = process.env.MIKROTIK_HOST ?? '';
const user = process.env.MIKROTIK_USER ?? '';
const password = process.env.MIKROTIK_PASS ?? '';
const port = Number(process.env.MIKROTIK_PORT ?? '8728');

function rosStr(row: unknown, key: string): string | undefined {
    if (typeof row !== 'object' || row === null) return undefined;
    const v = (row as Record<string, unknown>)[key];
    return typeof v === 'string' ? v : undefined;
}

async function removeAll(conn: RouterOSAPI, path: string, items: unknown[]) {
    for (const item of items) {
        const id = rosStr(item, '.id');
        if (id) await conn.write(`${path}/remove`, [`=.id=${id}`]);
    }
}

async function cleanup(conn: RouterOSAPI) {
    console.log('--- Cleanup ---');

    // Lepas ether2 dari bridge
    const ether2Ports = await conn.write('/interface/bridge/port/print', ['?interface=ether2']);
    await removeAll(conn, '/interface/bridge/port', ether2Ports);
    if (ether2Ports.length) console.log(`✓ Lepas ether2 dari bridge`);

    // Firewall filter ether4
    const fwRules = await conn.write('/ip/firewall/filter/print', ['?in-interface=ether4']);
    await removeAll(conn, '/ip/firewall/filter', fwRules);
    console.log(`✓ Hapus ${fwRules.length} firewall filter rule (ether4)`);

    // NAT nat-internet
    const natRules = await conn.write('/ip/firewall/nat/print', ['?comment=nat-internet']);
    await removeAll(conn, '/ip/firewall/nat', natRules);
    console.log(`✓ Hapus ${natRules.length} NAT rule`);

    // Address-list pelanggan-aktif
    const addrList = await conn.write('/ip/firewall/address-list/print', ['?list=pelanggan-aktif']);
    await removeAll(conn, '/ip/firewall/address-list', addrList);
    console.log(`✓ Hapus ${addrList.length} address-list entry`);

    // Simple queues
    const queues = await conn.write('/queue/simple/print');
    await removeAll(conn, '/queue/simple', queues);
    console.log(`✓ Hapus ${queues.length} simple queue`);

    // DHCP leases
    const leases = await conn.write('/ip/dhcp-server/lease/print');
    await removeAll(conn, '/ip/dhcp-server/lease', leases);
    console.log(`✓ Hapus ${leases.length} DHCP lease`);

    // DHCP server
    for (const iface of ['ether2', 'ether4', 'bridge', 'bridge-lan', 'bridge-admin']) {
        const servers = await conn.write('/ip/dhcp-server/print', [`?interface=${iface}`]);
        await removeAll(conn, '/ip/dhcp-server', servers);
        if (servers.length) console.log(`✓ Hapus ${servers.length} DHCP server (${iface})`);
    }

    // DHCP network
    for (const addr of ['10.10.0.0/24', '172.33.1.0/24', '192.168.88.0/24']) {
        const nets = await conn.write('/ip/dhcp-server/network/print', [`?address=${addr}`]);
        await removeAll(conn, '/ip/dhcp-server/network', nets);
        if (nets.length) console.log(`✓ Hapus ${nets.length} DHCP network (${addr})`);
    }

    // IP pool
    for (const name of ['pool-pelanggan', 'pool-admin']) {
        const pools = await conn.write('/ip/pool/print', [`?name=${name}`]);
        await removeAll(conn, '/ip/pool', pools);
        if (pools.length) console.log(`✓ Hapus ${pools.length} IP pool (${name})`);
    }

    // IP address ether2, ether4
    for (const iface of ['ether2', 'ether4']) {
        const addrs = await conn.write('/ip/address/print', [`?interface=${iface}`]);
        await removeAll(conn, '/ip/address', addrs);
        if (addrs.length) console.log(`✓ Hapus ${addrs.length} IP di ${iface}`);
    }

    // DHCP client ether1
    const dhcpClients = await conn.write('/ip/dhcp-client/print', ['?interface=ether1']);
    await removeAll(conn, '/ip/dhcp-client', dhcpClients);
    if (dhcpClients.length) console.log(`✓ Hapus ${dhcpClients.length} DHCP client (ether1)`);
}

async function setup(conn: RouterOSAPI) {
    console.log('\n--- Setup ---');

    // IP ether2 (admin)
    await conn.write('/ip/address/add', ['=address=172.33.1.1/24', '=interface=ether2']);
    console.log('✓ IP ether2: 172.33.1.1/24');

    // DHCP admin (ether2)
    await conn.write('/ip/pool/add', ['=name=pool-admin', '=ranges=172.33.1.2-172.33.1.10']);
    await conn.write('/ip/dhcp-server/add', ['=name=dhcp-admin', '=interface=ether2', '=address-pool=pool-admin', '=disabled=no']);
    await conn.write('/ip/dhcp-server/network/add', ['=address=172.33.1.0/24', '=gateway=172.33.1.1', '=dns-server=8.8.8.8,8.8.4.4']);
    console.log('✓ DHCP server ether2: 172.33.1.2-10');

    // IP ether4 (pelanggan)
    await conn.write('/ip/address/add', ['=address=10.10.0.1/24', '=interface=ether4']);
    console.log('✓ IP ether4: 10.10.0.1/24');

    // DHCP pool pelanggan
    await conn.write('/ip/pool/add', ['=name=pool-pelanggan', '=ranges=10.10.0.201-10.10.0.254']);
    await conn.write('/ip/dhcp-server/add', ['=name=dhcp-pelanggan', '=interface=ether4', '=address-pool=pool-pelanggan', '=disabled=no']);
    await conn.write('/ip/dhcp-server/network/add', ['=address=10.10.0.0/24', '=gateway=10.10.0.1', '=dns-server=8.8.8.8,8.8.4.4']);
    console.log('✓ DHCP server ether4');

    // DHCP client ether1 (WAN)
    await conn.write('/ip/dhcp-client/add', ['=interface=ether1', '=disabled=no', '=add-default-route=yes', '=use-peer-dns=yes']);
    console.log('✓ DHCP client ether1 (WAN)');

    // NAT masquerade
    await conn.write('/ip/firewall/nat/add', ['=chain=srcnat', '=out-interface=ether1', '=action=masquerade', '=comment=nat-internet']);
    console.log('✓ NAT masquerade ether1');

    // Firewall pelanggan
    await conn.write('/ip/firewall/filter/add', ['=chain=forward', '=in-interface=ether4', '=src-address-list=pelanggan-aktif', '=action=accept', '=comment=izin-pelanggan-aktif']);
    await conn.write('/ip/firewall/filter/add', ['=chain=forward', '=in-interface=ether4', '=action=drop', '=comment=blokir-pelanggan-nonaktif']);
    console.log('✓ Firewall ether4');

    // User panel-api
    const existingUsers = await conn.write('/user/print', ['?name=panel-api']);
    if (existingUsers.length === 0) {
        await conn.write('/user/add', ['=name=panel-api', '=password=Jorlex22', '=group=full']);
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

    const conn = new RouterOSAPI({ host, user, password, port });
    await conn.connect();
    console.log(`Terhubung ke MikroTik ${host}\n`);

    try {
        await cleanup(conn);
        await setup(conn);
        console.log('\nSetup selesai.');
    } finally {
        await conn.close();
    }
}

run().catch(err => {
    console.error('Gagal:', err);
    process.exit(1);
});
