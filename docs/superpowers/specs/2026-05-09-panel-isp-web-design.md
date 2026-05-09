# Design: panel-isp-web

**Date:** 2026-05-09  
**Status:** Approved

---

## Overview

Panel admin berbasis web untuk mengelola pelanggan ISP RT/RW. Berkomunikasi dengan `panel-isp-server` via REST API. Single admin, JWT auth (7 hari, tanpa refresh token).

---

## Stack

| | |
|--|--|
| Framework | Next.js 15 (App Router) |
| React | 19 |
| Styling | Tailwind CSS v4 |
| UI Components | shadcn/ui |
| Language | TypeScript (strict) |
| Package Manager | Yarn |
| HTTP Client | Axios |
| Data Fetching | TanStack Query v5 |
| Forms | React Hook Form + Zod |
| Icons | Lucide React |
| Toast | Sonner |
| Auth Storage | js-cookie (JWT 7 hari) |

---

## Direktori

```
panel-isp-web/
├── app/
│   ├── login/
│   │   └── page.tsx              # Halaman login
│   ├── (panel)/                  # Route group — semua butuh auth
│   │   ├── layout.tsx            # Auth guard + Sidebar + Header
│   │   ├── page.tsx              # Dashboard — stats summary
│   │   ├── pelanggan/
│   │   │   ├── page.tsx          # List pelanggan + search
│   │   │   ├── baru/
│   │   │   │   └── page.tsx      # Form tambah pelanggan
│   │   │   └── [id]/
│   │   │       └── page.tsx      # Detail: info + suspend/aktifkan/bayar/ganti paket
│   │   ├── paket/
│   │   │   └── page.tsx          # CRUD paket — list + modal tambah/edit/hapus
│   │   └── langganan/
│   │       └── page.tsx          # List langganan + history pembayaran
├── components/
│   ├── layout/
│   │   ├── sidebar.tsx           # Navigasi kiri: icon + label
│   │   └── header.tsx            # Bar atas: judul halaman + logout
│   └── ui/                       # shadcn/ui components (auto-generated)
├── lib/
│   ├── api/
│   │   ├── client.ts             # Axios instance + JWT interceptor + 401 handler
│   │   ├── auth.api.ts           # login()
│   │   ├── dashboard.api.ts      # getSummary()
│   │   ├── pelanggan.api.ts      # list, get, create, suspend, aktifkan, bayar, gantiPaket, delete
│   │   ├── paket.api.ts          # list, create, update, delete
│   │   └── langganan.api.ts      # list, get
│   ├── query/
│   │   ├── pelanggan.query.ts    # useListPelanggan, useGetPelanggan, useSuspend, dsb
│   │   ├── paket.query.ts        # useListPaket, useCreatePaket, dsb
│   │   ├── langganan.query.ts    # useListLangganan
│   │   └── dashboard.query.ts    # useDashboardSummary
│   ├── storage/
│   │   └── auth-storage.ts       # getToken, saveToken, clear — pakai js-cookie
│   └── utils/
│       └── format.ts             # formatRupiah, formatDate, formatStatus
├── .env.local
├── next.config.ts
├── tailwind.config.ts
├── components.json               # shadcn config
└── package.json
```

---

## Halaman & Fitur

### Login `/login`
- Form: username + password
- POST `/api/v1/auth/login` → simpan token ke cookie
- Redirect ke `/` setelah berhasil
- Error: tampilkan pesan dari API

### Dashboard `/`
- Stat cards: Total Pelanggan, Aktif, Suspend, Revenue Bulan Ini, Akan Expire 3 Hari
- Auto-refresh setiap 60 detik (React Query `refetchInterval`)

### Pelanggan `/pelanggan`
- Table: nama, IP, paket, status (badge), tanggal expire, aksi
- Search by nama
- Link ke detail per pelanggan

### Tambah Pelanggan `/pelanggan/baru`
- Form: nama, no HP, alamat, MAC address, IP address, pilih paket, status bayar, tanggal mulai/expire (opsional)
- Submit → POST `/api/v1/pelanggan` → redirect ke detail

### Detail Pelanggan `/pelanggan/[id]`
- Info lengkap pelanggan + langganan aktif
- Tombol aksi:
  - **Suspend** (confirm dialog) → PATCH `/:id/suspend`
  - **Aktifkan** → PATCH `/:id/aktifkan`
  - **Catat Pembayaran** (dialog: jumlah + metode) → POST `/:id/bayar`
  - **Ganti Paket** (dialog: pilih paket) → PATCH `/:id/ganti-paket`
  - **Hapus** (confirm dialog) → DELETE `/:id` → redirect ke list
- History pembayaran (tabel kecil)

### Paket `/paket`
- Table: nama, harga, speed down/up, jumlah pelanggan
- Tambah paket (Dialog form)
- Edit paket (Dialog form)
- Hapus paket (confirm — blocked jika ada pelanggan aktif)

### Langganan `/langganan`
- Table: nama pelanggan, paket, status bayar, tanggal mulai, expire
- Klik baris → ke detail pelanggan terkait

---

## Auth Flow

```
GET / (semua halaman panel)
  → layout.tsx cek cookie JWT
  → tidak ada → redirect /login
  → ada → render halaman

POST /login
  → berhasil → simpan token → redirect /
  → gagal → tampilkan error

Axios response interceptor
  → status 401 → clear cookie → window.location.href = /login
```

Tidak ada refresh token — JWT 7 hari. Setelah expired, user login ulang.

---

## UI / Visual

- **Sidebar** gelap (slate-900), icon + label, highlight halaman aktif
- **Content area** putih/slate-50
- **Status badge**: hijau (aktif), merah (suspend)
- **Aksi destruktif** (hapus, suspend) selalu pakai confirm dialog
- **Toast** (Sonner) untuk feedback sukses/error setiap aksi

---

## Environment

```env
# .env.local
NEXT_PUBLIC_API_URL=http://localhost:3000
```

---

## Out of Scope

- Multi-user / role management
- Grafik/chart statistik lanjutan
- Export PDF/Excel
- Dark mode toggle
- Mobile-first responsive (prioritas desktop)
