import { ObjectId } from 'mongodb';
import { Hono } from 'hono';
import { ApiError } from '@shared/errors/api-error';
import { objectIdString } from '@shared/schemas/object-id.schema';
import { bayarBodySchema, gantiPaketBodySchema, pelangganCreateSchema } from './pelanggan.schema';
import * as pelangganService from './pelanggan.service';

function parseObjectId(param: string, label: string): ObjectId {
    const parsed = objectIdString.safeParse(param);
    if (!parsed.success) throw ApiError.badRequest(`${label} tidak valid`, 'INVALID_ID');
    return new ObjectId(parsed.data);
}

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
