# Panel ISP — Panduan Admin

Base URL: `http://localhost:3000/api/v1`

Semua endpoint (kecuali login) wajib header:
```
Authorization: Bearer <token>
```

---

## 1. Login

```http
POST /auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```

Response: `{ "token": "eyJ..." }`

---

## 2. Paket Internet

### Buat paket
```http
POST /paket
Content-Type: application/json

{
  "nama": "Paket 10Mbps",
  "hargaBulanan": 100000,
  "speedDown": 10,
  "speedUp": 10,
  "deskripsi": "Paket standar"
}
```

### List semua paket
```http
GET /paket
```

### Update paket
```http
PATCH /paket/:id
Content-Type: application/json

{
  "hargaBulanan": 120000,
  "speedDown": 15,
  "speedUp": 15
}
```
> Semua field opsional — hanya field yang dikirim yang diupdate.

### Hapus paket
```http
DELETE /paket/:id
```

---

## 3. Pelanggan

### Tambah pelanggan baru

Otomatis: assign IP, buat DHCP static lease + queue di MikroTik, aktifkan internet.

```http
POST /pelanggan
Content-Type: application/json

{
  "nama": "Budi Santoso",
  "noHp": "08123456789",
  "alamat": "Jl. Mawar No. 5",
  "macAddress": "AA:BB:CC:DD:EE:FF",
  "paketId": "<id paket>",

  // opsional:
  "status": "aktif",           // default: aktif
  "statusBayar": "belum_bayar", // default: belum_bayar
  "tanggalMulai": "2026-05-01",
  "tanggalExpire": "2026-06-01"
}
```

> MAC address format: `AA:BB:CC:DD:EE:FF` atau `AA-BB-CC-DD-EE-FF` (otomatis dinormalisasi).

### List semua pelanggan
```http
GET /pelanggan
```

### Detail pelanggan
```http
GET /pelanggan/:id
```

### Suspend pelanggan (blokir internet)

Internet langsung terputus. Queue diturunkan ke 256k/256k dan IP dikeluarkan dari whitelist.

```http
PATCH /pelanggan/:id/suspend
```

### Aktifkan internet pelanggan

Internet langsung aktif kembali. Queue dikembalikan ke kecepatan paket, IP masuk whitelist.

```http
PATCH /pelanggan/:id/aktifkan
```

### Catat pembayaran

Jika pelanggan dalam status suspend, internet otomatis diaktifkan setelah bayar.

```http
POST /pelanggan/:id/bayar
Content-Type: application/json

{
  "jumlah": 100000,
  "metode": "Transfer BCA"
}
```

### Ganti paket
```http
PATCH /pelanggan/:id/ganti-paket
Content-Type: application/json

{
  "paketId": "<id paket baru>"
}
```
> Kecepatan di MikroTik langsung berubah.

### Hapus pelanggan

Menghapus DHCP lease, queue, dan whitelist dari MikroTik sekaligus data dari DB.

```http
DELETE /pelanggan/:id
```

---

## 4. Langganan

### List semua langganan
```http
GET /langganan
```

### Detail langganan berdasarkan pelanggan
```http
GET /langganan/by-pelanggan/:pelangganId
```

---

## 5. Dashboard
```http
GET /dashboard/summary
```

---

## 6. Alur Kerja Harian

### Tambah pelanggan baru (dengan router TP-Link / router rumahan)
1. Pastikan paket sudah ada → `GET /paket`
2. Ambil **MAC WAN port** router pelanggan:
   - Cek label bawah router, cari tulisan **"WAN MAC"**
   - Kalau tidak ada label WAN MAC → buka admin router → **Status** atau **Network → WAN → MAC Address**
   - > **Jangan pakai MAC LAN** — MAC yang tercetak besar di label biasanya adalah MAC LAN. WAN MAC biasanya beda 1 angka terakhir dari LAN MAC, tapi lebih aman cek langsung di admin router.
3. Daftarkan via panel dengan MAC WAN:
   ```http
   POST /pelanggan
   {
     "nama": "Budi Santoso",
     "macAddress": "MAC WAN router pelanggan",
     "paketId": "<id paket>"
   }
   ```
   → MikroTik otomatis buat static lease untuk MAC itu, assign IP `10.10.0.x`, internet aktif
4. Setting router pelanggan (sekali saja):
   - WAN mode: **DHCP** (bukan static, bukan PPPoE)
   - Operation mode: **Wireless Router** (bukan Access Point / Bridge)
   - LAN/WiFi: bebas, terserah pelanggan
5. Reboot router → WAN dapat IP `10.10.0.x` → internet aktif untuk semua device di balik router

### Pelanggan belum bayar → suspend
1. `PATCH /pelanggan/:id/suspend`
2. Internet langsung terputus

### Pelanggan bayar → aktifkan
1. Catat pembayaran: `POST /pelanggan/:id/bayar`
2. Jika sebelumnya suspend, internet otomatis aktif kembali
3. Atau aktifkan manual: `PATCH /pelanggan/:id/aktifkan`

### Pelanggan pindah / berhenti
1. `DELETE /pelanggan/:id`
2. Semua konfigurasi MikroTik otomatis dibersihkan

---

## 7. Catatan Teknis

| Komponen | Detail |
|----------|--------|
| Interface WAN | ether1 (IP dari ISP via gateway 192.168.1.1) |
| Interface Admin | ether2 (192.168.88.1/24, DHCP 192.168.88.2–10) |
| Interface Pelanggan | ether4 (10.10.0.1/24) |
| IP Pelanggan (static lease) | 10.10.0.2 – 10.10.0.200 |
| IP Device Tak Terdaftar | 10.10.0.201 – 10.10.0.254 (tidak dapat internet) |
| Kontrol Akses | Firewall address-list `pelanggan-aktif` |
