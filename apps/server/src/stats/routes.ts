import type { FastifyInstance } from 'fastify';
import { computeStats } from './service.js';
import { FORBIDDEN_TABLE_MESSAGE, getTableAccess } from '../permissions/table-access.js';

export async function statsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/stats/:tableId', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { tableId } = req.params as { tableId: string };
    if ((await getTableAccess(req.user, tableId)) === 'none') {
      return reply.code(403).send({ code: 'forbidden', message: FORBIDDEN_TABLE_MESSAGE });
    }
    try {
      const result = await computeStats(tableId);
      return result;
    } catch (err) {
      return reply.code(404).send({ code: 'not_found', message: (err as Error).message });
    }
  });

  app.get('/api/stats/:tableId/summary', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { tableId } = req.params as { tableId: string };
    if ((await getTableAccess(req.user, tableId)) === 'none') {
      return reply.code(403).send({ code: 'forbidden', message: FORBIDDEN_TABLE_MESSAGE });
    }
    try {
      const result = await computeStats(tableId);
      // Slim down: just totals + per-dim top 5.
      return {
        tableId,
        totalRows: result.totalRows,
        totalHours: result.totalHours,
        topByDim: Object.fromEntries(
          result.aggregations.map((a) => [a.groupBy, a.buckets.slice(0, 5)]),
        ),
      };
    } catch (err) {
      return reply.code(404).send({ code: 'not_found', message: (err as Error).message });
    }
  });
}
