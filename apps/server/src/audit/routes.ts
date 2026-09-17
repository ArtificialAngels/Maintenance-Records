import type { FastifyInstance } from 'fastify';
import { readAudit } from './log.js';

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/audit', { onRequest: [app.authenticate] }, async (req) => {
    if (req.user.role !== 'admin') {
      // non-admins get a sanitized last 20 entries
      const all = await readAudit(200);
      return { entries: all.filter((e) => e.action.startsWith('row.')).slice(0, 20) };
    }
    const entries = await readAudit(500);
    return { entries };
  });
}