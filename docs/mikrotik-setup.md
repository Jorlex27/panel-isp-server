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

### 4. REST API (RouterOS v7.1+)

Panel memakai **HTTP REST** (`/rest/...`), bukan binary API port 8728. Layanan yang dipakai: **`www`** (HTTP) atau **`www-ssl`** (HTTPS)—lihat **IP → Services**.

Contoh mengaktifkan akses HTTP (hanya jaringan terpercaya):

```
/ip service set www disabled=no port=80
```

Disarankan produksi: aktifkan **`www-ssl`** dengan sertifikat, lalu di `.env` server set `MIKROTIK_REST_SCHEME=https` dan `MIKROTIK_REST_PORT=443` (atau sesuai port layanan).

Variabel lingkungan:

```env
MIKROTIK_HOST=192.168.1.1
MIKROTIK_REST_SCHEME=http
MIKROTIK_REST_PORT=80
MIKROTIK_REST_TLS_INSECURE=true
MIKROTIK_USER=panel-api
MIKROTIK_PASS=...
```

`MIKROTIK_REST_TLS_INSECURE=true` hanya untuk HTTPS dengan sertifikat self-signed; set `false` jika CA sudah dipercaya.

User untuk autentikasi Basic (sama seperti login Winbox/API user):

```
/user add name=panel-api password=... group=full
```

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
- [ ] Layanan **www** atau **www-ssl** enabled; port cocok dengan `MIKROTIK_REST_*` di `.env`
- [ ] User `panel-api` dibuat dengan akses full
- [ ] Firewall mengizinkan koneksi dari server panel ke port REST (80/443 dst.)
