import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createRow,
  deleteRow,
  listRows,
  updateRow,
} from './service.js';

const valuesSchema = z.record(z.string(), z.unknown());

export async function rowsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/tables/:id/rows', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const rows = await listRows(id, req.user);
    return { rows };
  });

  app.post('/api/tables/:id/rows', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = valuesSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: 'bad_request', message: parsed.error.message });
    }
    try {
      const row = await createRow(id, parsed.data, req.user);
      app.io.to(`table:${id}`).emit('row.upserted', { row });
      return { row };
    } catch (err) {
      return reply
        .code(400)
        .send({ code: 'bad_request', message: (err as Error).message });
    }
  });

  app.patch(
    '/api/tables/:id/rows/:rowId',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const { id, rowId } = req.params as { id: string; rowId: string };
      const parsed = valuesSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ code: 'bad_request', message: parsed.error.message });
      }
      try {
        const row = await updateRow(id, rowId, parsed.data, req.user);
        app.io.to(`table:${id}`).emit('row.upserted', { row });
        return { row };
      } catch (err) {
        return reply
          .code(400)
          .send({ code: 'bad_request', message: (err as Error).message });
      }
    },
  );

  app.delete(
    '/api/tables/:id/rows/:rowId',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const { id, rowId } = req.params as { id: string; rowId: string };
      try {
        await deleteRow(id, rowId, req.user);
        app.io.to(`table:${id}`).emit('row.deleted', { rowId });
        return { ok: true };
      } catch (err) {
        return reply
          .code(400)
          .send({ code: 'bad_request', message: (err as Error).message });
      }
    },
  );
}