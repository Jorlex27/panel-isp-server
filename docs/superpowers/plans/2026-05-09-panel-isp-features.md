# panel-isp-server Feature Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add JWT auth, Discord webhook notifications, request logger, dashboard summary, and ganti-paket endpoint to the existing Hono + MongoDB + Bun server.

**Architecture:** Single-admin JWT auth protects all existing routes via middleware; public `/auth/login` sits outside. Discord replaces WhatsApp using native `fetch` to a webhook URL. All new modules follow the existing pattern: `modules/<name>/index.ts` re-exports router, service is a plain function module, routes use Zod + `ApiError`.

**Tech Stack:** Bun, Hono 4.x, MongoDB native driver, `jsonwebtoken`, `bcrypt`, Discord Incoming Webhook (native fetch), `zod`, `node-cron`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| New | `src/modules/auth/auth.service.ts` | bcrypt compare + JWT sign |
| New | `src/modules/auth/auth.routes.ts` | POST /login |
| New | `src/modules/auth/index.ts` | re-export authRouter |
| New | `src/middleware/auth.middleware.ts` | verify Bearer JWT |
| New | `src/services/discord.service.ts` | kirimDiscord via webhook |
| New | `src/modules/dashboard/dashboard.service.ts` | getSummary aggregation |
| New | `src/modules/dashboard/dashboard.routes.ts` | GET /summary |
| New | `src/modules/dashboard/index.ts` | re-export dashboardRouter |
| Modify | `src/index.ts` | add request logger middleware |
| Modify | `src/routes.ts` | split public/protected, add auth + dashboard |
| Modify | `src/modules/pelanggan/pelanggan.schema.ts` | add gantiPaketBodySchema |
| Modify | `src/modules/pelanggan/pelanggan.routes.ts` | add PATCH /:id/ganti-paket |
| Modify | `src/modules/pelanggan/pelanggan.service.ts` | add gantiPaket() |
| Modify | `src/modules/langganan/langganan.service.ts` | add updatePaketId() |
| Modify | `src/services/mikrotik.service.ts` | add gantiPaketMikrotik() |
| Modify | `src/jobs/cron.ts` | replace kirimWA with kirimDiscord |
| Modify | `.env` | add JWT_SECRET, ADMIN_*, DISCORD_WEBHOOK_URL |
| Delete | `src/services/whatsapp.service.ts` | removed — replaced by discord |

---

## Task 1: Install Dependencies + Configure .env

**Files:**
- Modify: `package.json` (via bun add)
- Modify: `.env`

- [ ] **Step 1: Install runtime packages**

```bash
cd /Users/alexveros/Documents/app/mikrotik/panel-isp-server
bun add jsonwebtoken bcrypt
```

- [ ] **Step 2: Install type packages**

```bash
bun add -d @types/jsonwebtoken @types/bcrypt
```

- [ ] **Step 3: Generate JWT_SECRET**

```bash
openssl rand -hex 32
```

Copy the output — use it as `JWT_SECRET` below.

- [ ] **Step 4: Generate ADMIN_PASSWORD_HASH**

Replace `GANTI_PASSWORD_KAMU` with password yang ingin dipakai:

```bash
bun -e "import bcrypt from 'bcrypt'; const hash = await bcrypt.hash('GANTI_PASSWORD_KAMU', 10); console.log(hash);"
```

Copy the `$2b$...` output — use it as `ADMIN_PASSWORD_HASH` below.

- [ ] **Step 5: Add new env vars to .env**

Append these lines to `.env` (replace placeholder values):

```env
JWT_SECRET=<output dari step 3>
JWT_EXPIRES_IN=7d
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=<output dari step 4>

DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_ID/YOUR_TOKEN
```

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock
git commit -m "chore: add jsonwebtoken and bcrypt dependencies"
```

---

## Task 2: Auth Service

**Files:**
- Create: `src/modules/auth/auth.service.ts`
- Create: `src/modules/auth/index.ts`

- [ ] **Step 1: Create auth service**

Create `src/modules/auth/auth.service.ts`:

```typescript
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { ApiError } from '@shared/errors/api-error';

export async function login(
    username: string,
    password: string
): Promise<{ token: string; expiresAt: Date }> {
    const adminUsername = process.env.ADMIN_USERNAME ?? '';
    const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH ?? '';
    const secret = process.env.JWT_SECRET ?? '';
    const expiresIn = (process.env.JWT_EXPIRES_IN ?? '7d') as jwt.SignOptions['expiresIn'];

    if (username !== adminUsername) {
        throw new ApiError('Username atau password salah', 401, 'INVALID_CREDENTIALS');
    }

    const valid = await bcrypt.compare(password, adminPasswordHash);
    if (!valid) {
        throw new ApiError('Username atau password salah', 401, 'INVALID_CREDENTIALS');
    }

    const token = jwt.sign({ sub: username }, secret, { expiresIn });
    const decoded = jwt.decode(token) as { exp: number };
    const expiresAt = new Date(decoded.exp * 1000);

    return { token, expiresAt };
}
```

- [ ] **Step 2: Create auth routes**

Create `src/modules/auth/auth.routes.ts`:

```typescript
import { Hono } from 'hono';
import { z } from 'zod';
import * as authService from './auth.service';

const loginSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(1),
});

export const authRouter = new Hono().post('/login', async c => {
    const body = loginSchema.parse(await c.req.json());
    const data = await authService.login(body.username, body.password);
    return c.json({ success: true, data });
});
```

- [ ] **Step 3: Create auth index**

Create `src/modules/auth/index.ts`:

```typescript
export { authRouter } from './auth.routes';
```

- [ ] **Step 4: Verify TypeScript — no errors**

```bash
bun run --bun tsc --noEmit
```

Expected: no output (zero errors).

- [ ] **Step 5: Commit**

```bash
git add src/modules/auth/
git commit -m "feat: add auth service with bcrypt + JWT login"
```

---

## Task 3: Auth Middleware

**Files:**
- Create: `src/middleware/auth.middleware.ts`

- [ ] **Step 1: Create auth middleware**

Create `src/middleware/auth.middleware.ts`:

```typescript
import jwt from 'jsonwebtoken';
import { createMiddleware } from 'hono/factory';
import { ApiError } from '@shared/errors/api-error';

export const authMiddleware = createMiddleware(async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        throw new ApiError('Token tidak ditemukan', 401, 'UNAUTHORIZED');
    }
    const token = authHeader.slice(7);
    const secret = process.env.JWT_SECRET ?? '';
    try {
        jwt.verify(token, secret);
    } catch {
        throw new ApiError('Token tidak valid atau sudah expired', 401, 'UNAUTHORIZED');
    }
    await next();
});
```

- [ ] **Step 2: Verify TypeScript**

```bash
bun run --bun tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/middleware/auth.middleware.ts
git commit -m "feat: add JWT auth middleware"
```

---

## Task 4: Update routes.ts — Split Public/Protected + Wire Auth

**Files:**
- Modify: `src/routes.ts`

- [ ] **Step 1: Replace routes.ts content**

Overwrite `src/routes.ts`:

```typescript
import { Hono } from 'hono';
import { authMiddleware } from '@/middleware/auth.middleware';
import { authRouter } from '@modules/auth';
import { paketRouter } from '@modules/paket';
import { pelangganRouter } from '@modules/pelanggan';
import { langgananRouter } from '@modules/langganan';
import { dashboardRouter } from '@modules/dashboard';

const protectedRouters = new Hono()
    .use('*', authMiddleware)
    .route('/paket', paketRouter)
    .route('/pelanggan', pelangganRouter)
    .route('/langganan', langgananRouter)
    .route('/dashboard', dashboardRouter);

export const routers = new Hono()
    .route('/auth', authRouter)
    .route('/', protectedRouters);
```

Note: `dashboardRouter` does not exist yet — TypeScript will error on this file until Task 7 (dashboard module) is done. Do NOT run `tsc` yet.

- [ ] **Step 2: Commit**

```bash
git add src/routes.ts
git commit -m "feat: split routes into public/protected, wire auth middleware"
```

---

## Task 5: Discord Service

**Files:**
- Create: `src/services/discord.service.ts`
- Delete: `src/services/whatsapp.service.ts`

- [ ] **Step 1: Create discord service**

Create `src/services/discord.service.ts`:

```typescript
export async function kirimDiscord(
    pesan: string,
    title: string = 'Panel ISP Notifikasi',
    color: number = 0x5865f2
): Promise<void> {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return;

    await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            embeds: [{ title, description: pesan, color }],
        }),
    });
}
```

- [ ] **Step 2: Delete whatsapp service**

```bash
rm /Users/alexveros/Documents/app/mikrotik/panel-isp-server/src/services/whatsapp.service.ts
```

- [ ] **Step 3: Verify TypeScript**

```bash
bun run --bun tsc --noEmit
```

Expected errors (both fixed later):
- `cron.ts`: `kirimWA` not found — fixed in Task 6
- `routes.ts`: `@modules/dashboard` not found — fixed in Task 7

- [ ] **Step 4: Commit**

```bash
git add src/services/discord.service.ts
git rm src/services/whatsapp.service.ts
git commit -m "feat: add Discord webhook service, remove WhatsApp service"
```

---

## Task 6: Update Cron Jobs — Use Discord

**Files:**
- Modify: `src/jobs/cron.ts`

- [ ] **Step 1: Replace cron.ts content**

Overwrite `src/jobs/cron.ts`:

```typescript
import cron from 'node-cron';
import { ObjectId } from 'mongodb';
import { db } from '@shared/utils/db.util';
import { logger } from '@shared/utils/logger.util';
import { suspendPelanggan } from '@/services/mikrotik.service';
import { kirimDiscord } from '@/services/discord.service';

async function suspendExpiredUnpaid(): Promise<void> {
    const langCol = db.getCollection('langganan');
    const pelCol = db.getCollection('pelanggan');
    const now = new Date();
    const rows = await langCol
        .find({
            tanggalExpire: { $lte: now },
            statusBayar: { $ne: 'lunas' },
        })
        .toArray();

    for (const row of rows) {
        const pelangganId = row.pelangganId as ObjectId;
        const pel = await pelCol.findOne({ _id: pelangganId });
        if (!pel || typeof pel.ipAddress !== 'string' || typeof pel.nama !== 'string') continue;
        try {
            await suspendPelanggan(pel.ipAddress);
            await pelCol.updateOne(
                { _id: pelangganId },
                { $set: { status: 'suspend', updatedAt: new Date() } }
            );
            await kirimDiscord(
                `**${String(pel.nama)}** (${typeof pel.noHp === 'string' ? pel.noHp : '-'}) telah di-suspend karena paket habis masa berlakunya.`,
                'Pelanggan Di-suspend',
                0xe74c3c
            );
        } catch (error: unknown) {
            logger.error('Cron suspend gagal', error);
        }
    }
}

async function remindExpiring(): Promise<void> {
    const langCol = db.getCollection('langganan');
    const pelCol = db.getCollection('pelanggan');
    const start = new Date();
    const end = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const rows = await langCol
        .find({
            tanggalExpire: { $lte: end, $gte: start },
        })
        .toArray();

    for (const row of rows) {
        const pelangganId = row.pelangganId as ObjectId;
        const expire =
            row.tanggalExpire instanceof Date ? row.tanggalExpire : new Date(row.tanggalExpire);
        const pel = await pelCol.findOne({ _id: pelangganId });
        if (!pel) continue;
        const sisa = Math.max(
            0,
            Math.ceil((expire.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
        );
        try {
            await kirimDiscord(
                `**${String(pel.nama)}** (${typeof pel.noHp === 'string' ? pel.noHp : '-'}) masa aktifnya tersisa **${sisa} hari**. Segera lakukan pembayaran.`,
                'Reminder Expire',
                0xf39c12
            );
        } catch (error: unknown) {
            logger.error('Cron reminder gagal', error);
        }
    }
}

export function startCronJobs(): void {
    cron.schedule('0 0 * * *', async () => {
        try {
            await suspendExpiredUnpaid();
        } catch (error: unknown) {
            logger.error('Cron harian suspend gagal', error);
        }
    });
    cron.schedule('0 8 * * *', async () => {
        try {
            await remindExpiring();
        } catch (error: unknown) {
            logger.error('Cron reminder pagi gagal', error);
        }
    });
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
bun run --bun tsc --noEmit
```

Expected error: `routes.ts` — `@modules/dashboard` not found. Fixed in Task 7.

- [ ] **Step 3: Commit**

```bash
git add src/jobs/cron.ts
git commit -m "feat: replace WhatsApp notifications with Discord embeds in cron jobs"
```

---

## Task 7: Dashboard Module

**Files:**
- Create: `src/modules/dashboard/dashboard.service.ts`
- Create: `src/modules/dashboard/dashboard.routes.ts`
- Create: `src/modules/dashboard/index.ts`

- [ ] **Step 1: Create dashboard service**

Create `src/modules/dashboard/dashboard.service.ts`:

```typescript
import { db } from '@shared/utils/db.util';

export interface DashboardSummary {
    totalPelanggan: number;
    aktif: number;
    suspend: number;
    revenueBulanIni: number;
    akanExpire3Hari: number;
}

export async function getSummary(): Promise<DashboardSummary> {
    const pelCol = db.getCollection('pelanggan');
    const langCol = db.getCollection('langganan');

    const firstDayOfMonth = new Date();
    firstDayOfMonth.setDate(1);
    firstDayOfMonth.setHours(0, 0, 0, 0);

    const now = new Date();
    const threeDaysLater = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    const [totalPelanggan, aktif, suspend, revenueAgg, akanExpire3Hari] = await Promise.all([
        pelCol.countDocuments(),
        pelCol.countDocuments({ status: 'aktif' }),
        pelCol.countDocuments({ status: 'suspend' }),
        langCol
            .aggregate<{ total: number }>([
                { $unwind: '$historyPembayaran' },
                {
                    $match: {
                        'historyPembayaran.tanggal': { $gte: firstDayOfMonth },
                    },
                },
                {
                    $group: {
                        _id: null,
                        total: { $sum: '$historyPembayaran.jumlah' },
                    },
                },
            ])
            .toArray(),
        langCol.countDocuments({
            tanggalExpire: { $gte: now, $lte: threeDaysLater },
        }),
    ]);

    return {
        totalPelanggan,
        aktif,
        suspend,
        revenueBulanIni: revenueAgg[0]?.total ?? 0,
        akanExpire3Hari,
    };
}
```

- [ ] **Step 2: Create dashboard routes**

Create `src/modules/dashboard/dashboard.routes.ts`:

```typescript
import { Hono } from 'hono';
import * as dashboardService from './dashboard.service';

export const dashboardRouter = new Hono().get('/summary', async c => {
    const data = await dashboardService.getSummary();
    return c.json({ success: true, data });
});
```

- [ ] **Step 3: Create dashboard index**

Create `src/modules/dashboard/index.ts`:

```typescript
export { dashboardRouter } from './dashboard.routes';
```

- [ ] **Step 4: Verify TypeScript — zero errors**

```bash
bun run --bun tsc --noEmit
```

Expected: no output. All modules now resolve including `dashboardRouter` in `routes.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/
git commit -m "feat: add dashboard summary endpoint"
```

---

## Task 8: Request Logger — Update index.ts

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add request logger middleware**

In `src/index.ts`, add the logger middleware **after** the CORS use and **before** `app.get('/health', ...)`. Replace the entire file:

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { db } from '@shared/utils/db.util';
import { ApiError } from '@shared/errors/api-error';
import { logger } from '@shared/utils/logger.util';
import { routers } from './routes';
import { startCronJobs } from './jobs/cron';

const app = new Hono();

app.use(
    '/*',
    cors({
        origin: '*',
        credentials: true,
    })
);

app.use('*', async (c, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    logger.info(`[${c.req.method}] ${c.req.path} → ${c.res.status} (${ms}ms)`);
});

app.get('/health', c => c.json({ status: 'OK' }));

app.route('/api/v1', routers);

app.onError((err, c) => ApiError.handle(err, c, 'Server'));

const shutdown = async () => {
    logger.warn('Shutting down server...');
    await db.disconnect();
    process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

try {
    await db.connect();
    await db.ensureIndexes();
    logger.db('Database connected successfully');
} catch (error: unknown) {
    logger.error('Database connection error:', error);
    process.exit(1);
}

startCronJobs();

const port = Number(process.env.PORT ?? '3000');

logger.server(`Server is running at http://localhost:${port}`);

export default {
    port,
    idleTimeout: 255,
    fetch: app.fetch,
};
```

- [ ] **Step 2: Verify TypeScript**

```bash
bun run --bun tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Manual smoke test — start server and verify logger**

```bash
bun run --watch src/index.ts &
sleep 2
curl http://localhost:3000/health
```

Expected: `{"status":"OK"}` in terminal, and console shows a request log line like:
```
[info] [GET] /health → 200 (3ms)
```

Kill dev server: `kill %1`

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: add request logger middleware"
```

---

## Task 9: Test Auth Endpoints

No automated tests — verify manually.

- [ ] **Step 1: Start server**

```bash
bun run --watch src/index.ts &
sleep 2
```

- [ ] **Step 2: Test login with wrong credentials**

```bash
curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"wrong"}' | jq
```

Expected:
```json
{ "success": false, "errorCode": "INVALID_CREDENTIALS", "message": "Username atau password salah" }
```

- [ ] **Step 3: Test login with correct credentials**

Replace `GANTI_PASSWORD_KAMU` with the password you used when generating the hash:

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"GANTI_PASSWORD_KAMU"}' | jq -r '.data.token')
echo $TOKEN
```

Expected: a JWT string (three base64 segments separated by dots).

- [ ] **Step 4: Test protected route without token**

```bash
curl -s http://localhost:3000/api/v1/pelanggan | jq
```

Expected:
```json
{ "success": false, "errorCode": "UNAUTHORIZED", "message": "Token tidak ditemukan" }
```

- [ ] **Step 5: Test protected route with valid token**

```bash
curl -s http://localhost:3000/api/v1/pelanggan \
  -H "Authorization: Bearer $TOKEN" | jq
```

Expected: `{"success": true, "data": [...]}` (pelanggan list, may be empty array).

- [ ] **Step 6: Test dashboard**

```bash
curl -s http://localhost:3000/api/v1/dashboard/summary \
  -H "Authorization: Bearer $TOKEN" | jq
```

Expected:
```json
{
  "success": true,
  "data": {
    "totalPelanggan": 0,
    "aktif": 0,
    "suspend": 0,
    "revenueBulanIni": 0,
    "akanExpire3Hari": 0
  }
}
```

- [ ] **Step 7: Kill dev server**

```bash
kill %1
```

---

## Task 10: Ganti Paket — Service + MikroTik

**Files:**
- Modify: `src/modules/langganan/langganan.service.ts` (add `updatePaketId`)
- Modify: `src/services/mikrotik.service.ts` (add `gantiPaketMikrotik`)
- Modify: `src/modules/pelanggan/pelanggan.schema.ts` (add `gantiPaketBodySchema`)
- Modify: `src/modules/pelanggan/pelanggan.service.ts` (add `gantiPaket`)
- Modify: `src/modules/pelanggan/pelanggan.routes.ts` (add route)

- [ ] **Step 1: Add updatePaketId to langganan.service.ts**

Append this function at the end of `src/modules/langganan/langganan.service.ts`:

```typescript
export async function updatePaketId(pelangganId: ObjectId, paketId: ObjectId): Promise<void> {
    await col().updateOne(
        { pelangganId },
        { $set: { paketId, updatedAt: new Date() } }
    );
}
```

- [ ] **Step 2: Add gantiPaketMikrotik to mikrotik.service.ts**

Append this function at the end of `src/services/mikrotik.service.ts`:

```typescript
export async function gantiPaketMikrotik(
    nama: string,
    speedDown: number,
    speedUp: number
): Promise<void> {
    await withRos(async conn => {
        const res = await conn.write('/queue/simple/print', [`?name=${nama}`]);
        const id = res[0] ? rosStr(res[0] as Record<string, unknown>, '.id') : undefined;
        if (id) {
            await conn.write('/queue/simple/set', [
                `=.id=${id}`,
                `=max-limit=${speedDown}M/${speedUp}M`,
            ]);
        }
    });
}
```

- [ ] **Step 3: Add gantiPaketBodySchema to pelanggan.schema.ts**

Append after `bayarBodySchema` in `src/modules/pelanggan/pelanggan.schema.ts`:

```typescript
export const gantiPaketBodySchema = z.object({
    paketId: objectIdString,
});

export type GantiPaketBodyInput = z.infer<typeof gantiPaketBodySchema>;
```

- [ ] **Step 4: Add gantiPaket to pelanggan.service.ts**

Add imports at the top of `src/modules/pelanggan/pelanggan.service.ts` — `gantiPaketMikrotik` must be imported. The existing import block is:

```typescript
import {
    aktifkanPelanggan,
    hapusPelanggan,
    suspendPelanggan,
    tambahPelanggan,
} from '@/services/mikrotik.service';
```

Replace it with:

```typescript
import {
    aktifkanPelanggan,
    gantiPaketMikrotik,
    hapusPelanggan,
    suspendPelanggan,
    tambahPelanggan,
} from '@/services/mikrotik.service';
```

Then also update the schema import — existing:

```typescript
import type { BayarBodyInput, PelangganCreateInput } from './pelanggan.schema';
```

Replace with:

```typescript
import type { BayarBodyInput, GantiPaketBodyInput, PelangganCreateInput } from './pelanggan.schema';
```

Then append `gantiPaket` at the end of the file:

```typescript
export async function gantiPaket(
    id: ObjectId,
    input: GantiPaketBodyInput
): Promise<PelangganPopulated> {
    const paketId = new ObjectId(input.paketId);
    const pel = await getPelanggan(id);
    const paket = await paketService.getPaket(paketId);
    await gantiPaketMikrotik(pel.nama, paket.speedDown, paket.speedUp);
    await langgananService.updatePaketId(id, paketId);
    return getPelanggan(id);
}
```

- [ ] **Step 5: Add route to pelanggan.routes.ts**

Update imports at top of `src/modules/pelanggan/pelanggan.routes.ts` — existing:

```typescript
import { bayarBodySchema, pelangganCreateSchema } from './pelanggan.schema';
```

Replace with:

```typescript
import { bayarBodySchema, gantiPaketBodySchema, pelangganCreateSchema } from './pelanggan.schema';
```

Then add route before `.delete('/:id', ...)`:

```typescript
    .patch('/:id/ganti-paket', async c => {
        const id = parseObjectId(c.req.param('id'), 'ID pelanggan');
        const body = gantiPaketBodySchema.parse(await c.req.json());
        const data = await pelangganService.gantiPaket(id, body);
        return c.json({ success: true, data });
    })
```

The full `pelangganRouter` declaration in `pelanggan.routes.ts` should now be:

```typescript
export const pelangganRouter = new Hono()
    .get('/', async c => {
        const data = await pelangganService.listPelanggan();
        return c.json({ success: true, data });
    })
    .get('/:id', async c => {
        const id = parseObjectId(c.req.param('id'), 'ID pelanggan');
        const data = await pelangganService.getPelanggan(id);
        return c.json({ success: true, data });
    })
    .post('/', async c => {
        const body = pelangganCreateSchema.parse(await c.req.json());
        const data = await pelangganService.createPelanggan(body);
        return c.json({ success: true, data }, 201);
    })
    .patch('/:id/suspend', async c => {
        const id = parseObjectId(c.req.param('id'), 'ID pelanggan');
        const data = await pelangganService.suspendPelangganDb(id);
        return c.json({ success: true, data });
    })
    .patch('/:id/aktifkan', async c => {
        const id = parseObjectId(c.req.param('id'), 'ID pelanggan');
        const data = await pelangganService.aktifkanPelangganDb(id);
        return c.json({ success: true, data });
    })
    .post('/:id/bayar', async c => {
        const id = parseObjectId(c.req.param('id'), 'ID pelanggan');
        const body = bayarBodySchema.parse(await c.req.json());
        const result = await pelangganService.bayarPelanggan(id, body);
        return c.json({ success: true, data: result });
    })
    .patch('/:id/ganti-paket', async c => {
        const id = parseObjectId(c.req.param('id'), 'ID pelanggan');
        const body = gantiPaketBodySchema.parse(await c.req.json());
        const data = await pelangganService.gantiPaket(id, body);
        return c.json({ success: true, data });
    })
    .delete('/:id', async c => {
        const id = parseObjectId(c.req.param('id'), 'ID pelanggan');
        await pelangganService.deletePelangganDb(id);
        return c.json({ success: true });
    });
```

- [ ] **Step 6: Verify TypeScript — zero errors**

```bash
bun run --bun tsc --noEmit
```

Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/modules/langganan/langganan.service.ts \
        src/services/mikrotik.service.ts \
        src/modules/pelanggan/pelanggan.schema.ts \
        src/modules/pelanggan/pelanggan.service.ts \
        src/modules/pelanggan/pelanggan.routes.ts
git commit -m "feat: add ganti-paket endpoint — updates MikroTik queue and langganan"
```

---

## Task 11: Final Verification

- [ ] **Step 1: TypeScript clean build**

```bash
bun run --bun tsc --noEmit
```

Expected: no output.

- [ ] **Step 2: Start server and run full smoke test**

```bash
bun run --watch src/index.ts &
sleep 2

# Get token
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"GANTI_PASSWORD_KAMU"}' | jq -r '.data.token')

# Dashboard
curl -s http://localhost:3000/api/v1/dashboard/summary \
  -H "Authorization: Bearer $TOKEN" | jq

# Pelanggan list
curl -s http://localhost:3000/api/v1/pelanggan \
  -H "Authorization: Bearer $TOKEN" | jq

# Paket list
curl -s http://localhost:3000/api/v1/paket \
  -H "Authorization: Bearer $TOKEN" | jq

kill %1
```

Expected: all return `{ "success": true, "data": ... }`, request logs appear in console.

- [ ] **Step 3: Final commit**

```bash
git add .
git commit -m "chore: complete feature implementation — auth, discord, dashboard, ganti-paket"
```

---

## Summary of API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/auth/login` | No | Login admin, dapat JWT |
| GET | `/api/v1/dashboard/summary` | Yes | Statistik panel |
| GET | `/api/v1/pelanggan` | Yes | List pelanggan |
| POST | `/api/v1/pelanggan` | Yes | Tambah pelanggan + setup MikroTik |
| GET | `/api/v1/pelanggan/:id` | Yes | Detail pelanggan |
| PATCH | `/api/v1/pelanggan/:id/suspend` | Yes | Suspend pelanggan |
| PATCH | `/api/v1/pelanggan/:id/aktifkan` | Yes | Aktifkan pelanggan |
| POST | `/api/v1/pelanggan/:id/bayar` | Yes | Catat pembayaran |
| PATCH | `/api/v1/pelanggan/:id/ganti-paket` | Yes | Ganti paket + update MikroTik |
| DELETE | `/api/v1/pelanggan/:id` | Yes | Hapus pelanggan + MikroTik |
| GET | `/api/v1/paket` | Yes | List paket |
| POST | `/api/v1/paket` | Yes | Tambah paket |
| PATCH | `/api/v1/paket/:id` | Yes | Update paket |
| DELETE | `/api/v1/paket/:id` | Yes | Hapus paket |
| GET | `/api/v1/langganan` | Yes | List langganan |
| GET | `/api/v1/langganan/:id` | Yes | Detail langganan |
