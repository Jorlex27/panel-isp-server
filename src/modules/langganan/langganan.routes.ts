import { ObjectId } from 'mongodb';
import { Hono } from 'hono';
import { ApiError } from '@shared/errors/api-error';
import { objectIdString } from '@shared/schemas/object-id.schema';
import { langgananCreateSchema } from './langganan.schema';
import * as langgananService from './langganan.service';

function parseObjectId(param: string, label: string): ObjectId {
    const parsed = objectIdString.safeParse(param);
    if (!parsed.success) throw ApiError.badRequest(`${label} tidak valid`, 'INVALID_ID');
    return new ObjectId(parsed.data);
}

export const langgananRouter = new Hono()
    .get('/', async c => {
        const data = await langgananService.listLangganan();
        return c.json({ success: true, data });
    })
    .post('/', async c => {
        const body = langgananCreateSchema.parse(await c.req.json());
        const data = await langgananService.createLanggananManual({
            pelangganId: new ObjectId(body.pelangganId),
            paketId: new ObjectId(body.paketId),
            tanggalMulai: body.tanggalMulai,
            tanggalExpire: body.tanggalExpire,
            statusBayar: body.statusBayar ?? 'belum_bayar',
        });
        return c.json({ success: true, data }, 201);
    })
    .get('/by-pelanggan/:pelangganId', async c => {
        const id = parseObjectId(c.req.param('pelangganId'), 'ID pelanggan');
        const data = await langgananService.requireByPelangganId(id);
        return c.json({ success: true, data });
    })
    .get('/:id', async c => {
        const id = parseObjectId(c.req.param('id'), 'ID langganan');
        const data = await langgananService.getLangganan(id);
        return c.json({ success: true, data });
    });
