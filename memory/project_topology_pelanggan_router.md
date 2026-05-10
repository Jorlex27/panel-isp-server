---
name: Topologi Router Pelanggan RT/RW WiFi
description: Cara kerja dan setup router pelanggan (TP-Link dll) yang konek ke distribusi MikroTik ether4
type: project
---

Pelanggan pakai router sendiri (TP-Link dll) yang konek ke jaringan distribusi ether4.

**Topologi:** ether4 MikroTik → switch/kabel → WAN port router pelanggan → LAN/WiFi pelanggan

**Yang didaftarkan ke sistem:** MAC address WAN port router pelanggan (bukan LAN, bukan WiFi)

**Setting router pelanggan:** WAN mode = DHCP. Itu saja. LAN/WiFi bebas.

**Why:** MikroTik assign static DHCP lease ke MAC WAN router → router dapat IP 10.10.0.x → IP masuk pelanggan-aktif address-list → internet jalan. Suspend/aktifkan dari panel, tidak perlu sentuh router pelanggan.

**How to apply:** Saat tambah pelanggan baru, ambil MAC WAN dari label bawah router, masukkan ke field macAddress di POST /pelanggan. Pastikan WAN router di-set DHCP (ubah sekali jika masih PPPoE/static).
