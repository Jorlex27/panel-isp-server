# Mikrotik Setup — Panel ISP

## Jaringan Pelanggan (ether4)

Interface ether4 digunakan khusus untuk pelanggan. Mikrotik sebagai gateway di 192.168.2.1/24.

### 1. Bridge / Interface

```
/interface bridge add name=bridge-pelanggan
/interface bridge port add bridge=bridge-pelanggan interface=ether4
/ip address add address=192.168.2.1/24 interface=bridge-pelanggan
```

Atau kalau langsung pakai ether4 tanpa bridge:
```
/ip address add address=192.168.2.1/24 interface=ether4
```

---

### 2. DHCP Server — Static Leases Only

**PENTING:** Pool harus kosong. Hanya static lease. Perangkat yang belum didaftarkan tidak dapat IP → tidak bisa internet.

```
# Buat DHCP server tanpa pool (kosong)
/ip dhcp-server add name=dhcp-pelanggan interface=ether4 address-pool=none
```

Atau lewat Winbox:
- **IP → DHCP Server → Add**
- Interface: `ether4`
- Address Pool: `none` (jangan pilih pool dynamic)

Static lease dibuat otomatis oleh app saat admin daftarkan pelanggan.

---

### 3. NAT Masquerade

Agar pelanggan bisa internet:

```
/ip firewall nat add chain=srcnat action=masquerade \
    src-address=192.168.2.0/24 out-interface=<WAN_INTERFACE>
```

Ganti `<WAN_INTERFACE>` dengan nama interface WAN (ether1, pppoe-out1, dll).

---

### 4. RouterOS API

App berkomunikasi dengan Mikrotik via API port 8728. Harus diaktifkan:

```
/ip service enable api
/ip service set api port=8728
```

Lewat Winbox: **IP → Services → api → centang Enable**

Buat user khusus untuk API (jangan pakai admin):

```
/user add name=panel-api password=Jorlex22 group=full
```

---

### 5. Simple Queue — Speed Limit

App membuat simple queue otomatis saat pelanggan didaftarkan:

```
# Contoh hasil yang dibuat app:
/queue simple add name="Budi" target=192.168.2.5 max-limit=10M/5M
```

Format: `max-limit=<speedDown>M/<speedUp>M`

Suspend: app set ke `256k/256k`.
Aktif kembali: app set ke speed paket semula.

---

### 6. IP Pool Pelanggan

Range IP yang dipakai: `192.168.2.2` – `192.168.2.254` (253 pelanggan).

IP di-assign otomatis oleh app (tidak perlu input manual). App cari IP pertama yang belum terpakai di DB.

Konfigurasi di `.env`:
```env
IP_POOL_NETWORK=192.168.2.0
IP_POOL_START=2
IP_POOL_END=254
```

---

### Checklist Setup Mikrotik

- [ ] IP address 192.168.2.1/24 di ether4
- [ ] DHCP server tanpa dynamic pool di ether4
- [ ] NAT masquerade dari 192.168.2.0/24 ke WAN
- [ ] API service enabled (port 8728)
- [ ] User `panel-api` dibuat dengan akses full
- [ ] Tidak ada firewall rule yang block koneksi dari server ke port 8728
