import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createRow,
  deleteRow,
  listRowPage,
  updateRow,
} from './service.js';
import {
  FORBIDDEN_TABLE_MESSAGE,
  getTableAccess,
  READONLY_TABLE_MESSAGE,
} from '../permissions/table-access.js';

const valuesSchema = z.record(z.string(), z.unknown());

/** Query params for the paginated row list. Out-of-range page/pageSize are
 * clamped in the service (pageSize is capped at MAX_PAGE_SIZE). */
const pageQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
  sort: z.string().min(1).optional(),
  dir: z.enum(['asc', 'desc']).optional(),
});

export async function rowsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/tables/:id/rows', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if ((await getTableAccess(req.user, id)) === 'none') {
      return reply.code(403).send({ code: 'forbidden', message: FORBIDDEN_TABLE_MESSAGE });
    }
    const parsed = pageQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ code: 'bad_request', message: parsed.error.message });
    }
    return listRowPage(id, req.user, parsed.data);
  });

  app.post('/api/tables/:id/rows', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const access = await getTableAccess(req.user, id);
    if (access === 'none') {
      return reply.code(403).send({ code: 'forbidden', message: FORBIDDEN_TABLE_MESSAGE });
    }
    if (access !== 'write') {
      return reply.code(403).send({ code: 'forbidden', message: READONLY_TABLE_MESSAGE });
    }
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
      const access = await getTableAccess(req.user, id);
      if (access === 'none') {
        return reply.code(403).send({ code: 'forbidden', message: FORBIDDEN_TABLE_MESSAGE });
      }
      if (access !== 'write') {
        return reply.code(403).send({ code: 'forbidden', message: READONLY_TABLE_MESSAGE });
      }
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
      if ((await getTableAccess(req.user, id)) === 'none') {
        return reply.code(403).send({ code: 'forbidden', message: FORBIDDEN_TABLE_MESSAGE });
      }
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