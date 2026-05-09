# Design: panel-isp-server — Auth, Discord, Dashboard, Ganti Paket

**Date:** 2026-05-09  
**Status:** Approved

---

## Scope

Add 5 features to the existing Hono + MongoDB + Bun server:

1. JWT authentication (single admin)
2. Discord webhook notifications (replace WhatsApp)
3. Request logger middleware
4. Dashboard summary endpoint
5. Ganti paket endpoint

---

## 1. Auth — JWT, Single Admin

### Decision

Credentials stored in `.env` — no DB user collection needed.  
Single admin: `ADMIN_USERNAME` + `ADMIN_PASSWORD_HASH` (bcrypt).  
JWT expires in 7 days. Token stored client-side (header: `Authorization: Bearer <token>`).

### Endpoints

```
POST /api/v1/auth/login   → { token, expiresAt }   (public, no auth required)
```

### Files

- `src/modules/auth/auth.routes.ts` — POST /login handler
- `src/modules/auth/auth.service.ts` — bcrypt compare, JWT sign/verify
- `src/modules/auth/index.ts` — re-export `authRouter`
- `src/middleware/auth.middleware.ts` — verify Bearer JWT on every protected request

### Route structure change in `src/routes.ts`

```ts
// public
const publicRouters = new Hono().route('/auth', authRouter)

// protected — all existing + new modules
const protectedRouters = new Hono()
  .use('*', authMiddleware)
  .route('/paket', paketRouter)
  .route('/pelanggan', pelangganRouter)
  .route('/langganan', langgananRouter)
  .route('/dashboard', dashboardRouter)

export const routers = new Hono()
  .route('/', publicRouters)
  .route('/', protectedRouters)
```

### Error responses

- Missing/invalid token → 401 `UNAUTHORIZED`
- Wrong credentials → 401 `INVALID_CREDENTIALS`

### .env additions

```env
JWT_SECRET=<random 64-char hex>
JWT_EXPIRES_IN=7d
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=<bcrypt hash of password>
```

---

## 2. Discord Webhook Notifications

### Decision

Replace `whatsapp.service.ts` with `discord.service.ts`.  
Uses Discord Incoming Webhook — HTTP POST, no bot token, no extra library (native `fetch`).  
Messages use Discord embed format for readability in channel.

### Interface

```ts
export async function kirimDiscord(pesan: string, title?: string): Promise<void>
```

Called by: `src/jobs/cron.ts` (auto-suspend, expiry reminder).

### Embed structure

- **color**: red for suspend, yellow for reminder
- **title**: e.g. "Pelanggan Di-suspend" / "Reminder Expire"
- **description**: nama + no HP + tanggal expire / sisa hari

### .env additions

```env
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

### Files

- `src/services/discord.service.ts` — new
- `src/services/whatsapp.service.ts` — deleted
- `src/jobs/cron.ts` — import `kirimDiscord`, remove `kirimWA`

---

## 3. Request Logger Middleware

### Decision

Inline middleware in `src/index.ts` — no separate file needed (simple enough).  
Uses existing `logger` util. Logs: method, path, status code, duration (ms).

### Format

```
[GET] /api/v1/pelanggan → 200 (45ms)
[POST] /api/v1/auth/login → 401 (12ms)
```

Added via `app.use('*', requestLogger)` before routes.

---

## 4. Dashboard Summary

### Endpoint

```
GET /api/v1/dashboard/summary
```

### Response

```json
{
  "success": true,
  "data": {
    "totalPelanggan": 15,
    "aktif": 12,
    "suspend": 3,
    "revenueBulanIni": 1500000,
    "akanExpire3Hari": 2
  }
}
```

### Implementation

Single parallel `Promise.all` with 5 MongoDB queries:
1. `countDocuments()` total
2. `countDocuments({ status: 'aktif' })`
3. `countDocuments({ status: 'suspend' })`
4. Aggregate `historyPembayaran` where `tanggal >= first day of current month`
5. `countDocuments` langganan where `tanggalExpire <= now+3days && tanggalExpire >= now`

### Files

- `src/modules/dashboard/dashboard.routes.ts`
- `src/modules/dashboard/dashboard.service.ts`
- `src/modules/dashboard/index.ts`

---

## 5. Ganti Paket

### Endpoint

```
PATCH /api/v1/pelanggan/:id/ganti-paket
Body: { paketId: string }
```

### Logic (in order)

1. Fetch pelanggan by id (throw 404 if not found)
2. Fetch new paket by paketId (throw 404 if not found)
3. Update Simple Queue on MikroTik: `max-limit = speedDown/speedUp` by queue name (pelanggan.nama)
4. Update `langganan.paketId` in MongoDB via `langgananService.updatePaketId(pelangganId, paketId)`

MikroTik update uses existing `withRos` pattern in `mikrotik.service.ts`.  
Add new exported function: `gantiPaketMikrotik(nama, speedDown, speedUp)`.

### Files

- `src/modules/pelanggan/pelanggan.routes.ts` — add PATCH `/:id/ganti-paket`
- `src/modules/pelanggan/pelanggan.service.ts` — add `gantiPaket(id, paketId)`
- `src/services/mikrotik.service.ts` — add `gantiPaketMikrotik(nama, speedDown, speedUp)`

---

## File Change Summary

| Action | File |
|--------|------|
| New | `src/modules/auth/auth.routes.ts` |
| New | `src/modules/auth/auth.service.ts` |
| New | `src/modules/auth/index.ts` |
| New | `src/middleware/auth.middleware.ts` |
| New | `src/services/discord.service.ts` |
| New | `src/modules/dashboard/dashboard.routes.ts` |
| New | `src/modules/dashboard/dashboard.service.ts` |
| New | `src/modules/dashboard/index.ts` |
| Modify | `src/routes.ts` |
| Modify | `src/index.ts` |
| Modify | `src/modules/pelanggan/pelanggan.routes.ts` |
| Modify | `src/modules/pelanggan/pelanggan.service.ts` |
| Modify | `src/services/mikrotik.service.ts` |
| Modify | `src/jobs/cron.ts` |
| Delete | `src/services/whatsapp.service.ts` |
| Modify | `.env` |

---

## Dependencies

No new npm packages needed:
- JWT: `jsonwebtoken` (already in ranting-server pattern — add to package.json)
- bcrypt: `bcrypt` (add to package.json)
- Discord: native `fetch` (built into Bun)

### packages to add

```bash
bun add jsonwebtoken bcrypt
bun add -d @types/jsonwebtoken @types/bcrypt
```

---

## Out of Scope

- WhatsApp integration (removed, replaced by Discord)
- Multi-user / role management
- Refresh token flow (7-day expiry, personal panel)
- Discord bot (webhook only)
- Frontend / UI
