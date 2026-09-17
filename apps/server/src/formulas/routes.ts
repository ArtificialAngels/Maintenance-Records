import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { validateFormulaSyntax, evaluateFormula } from './functions.js';

const checkSchema = z.object({ formula: z.string(), refs: z.record(z.string(), z.unknown()) });

export async function formulaRoutes(app: FastifyInstance): Promise<void> {
  // Live syntax check used by the formula editor (admin-only)
  app.post('/api/formulas/validate', { onRequest: [app.authenticate] }, async (req, reply) => {
    if (req.user.role !== 'admin') {
      return reply.code(403).send({ code: 'forbidden', message: '仅管理员可校验公式' });
    }
    const parsed = z.object({ formula: z.string() }).safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: 'bad_request', message: parsed.error.message });
    }
    return validateFormulaSyntax(parsed.data.formula);
  });

  // Dry-run: evaluate against a sample of refs to show a preview.
  app.post('/api/formulas/preview', { onRequest: [app.authenticate] }, async (req, reply) => {
    if (req.user.role !== 'admin') {
      return reply.code(403).send({ code: 'forbidden', message: '仅管理员可预览公式' });
    }
    const parsed = checkSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: 'bad_request', message: parsed.error.message });
    }
    try {
      const result = evaluateFormula(parsed.data.formula, parsed.data.refs);
      return { result };
    } catch (err) {
      return { error: (err as Error).message };
    }
  });
}