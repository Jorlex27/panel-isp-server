import { ObjectId } from 'mongodb';
import { Hono } from 'hono';
import { ApiError } from '@shared/errors/api-error';
import { objectIdString } from '@shared/schemas/object-id.schema';
import { paketCreateSchema, paketUpdateSchema } from './paket.schema';
import * as paketService from './paket.service';

function parseObjectId(param: string, label: string): ObjectId {
    const parsed = objectIdString.safeParse(param);
    if (!parsed.success) throw ApiError.badRequest(`${label} tidak valid`, 'INVALID_ID');
    return new ObjectId(parsed.data);
}

export const paketRouter = new Hono()
    .get('/', async c => {
        const data = await paketService.listPaket();
        return c.json({ success: true, data });
    })
    .get('/:id', async c => {
        const id = parseObjectId(c.req.param('id'), 'ID paket');
        const data = await paketService.getPaket(id);
        return c.json({ success: true, data });
    })
    .post('/', async c => {
        const body = paketCreateSchema.parse(await c.req.json());
        const data = await paketService.createPaket(body);
        return c.json({ success: true, data }, 201);
    })
    .patch('/:id', async c => {
        const id = parseObjectId(c.req.param('id'), 'ID paket');
        const body = paketUpdateSchema.parse(await c.req.json());
        const data = await paketService.updatePaket(id, body);
        return c.json({ success: true, data });
    })
    .delete('/:id', async c => {
        const id = parseObjectId(c.req.param('id'), 'ID paket');
        await paketService.deletePaket(id);
        return c.json({ success: true });
    });
