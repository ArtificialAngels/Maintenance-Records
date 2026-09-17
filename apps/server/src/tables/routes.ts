import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { listTables, getTable, createTable, updateSchema } from './service.js';
import { listOptionSets, setOptionSet, listOptionSetKeys } from '../options/service.js';
import type { TableSchema } from '../types.js';
import { isSchemaEditAllowed } from '../permissions/check.js';

const baseShape = {
  id: z.string().min(1),
  name: z.string().min(1),
  visible: z.boolean(),
  required: z.boolean().optional(),
  editableByRoles: z.array(z.enum(['admin', 'user'])),
};

const columnSchema = z.discriminatedUnion('type', [
  z.object({ ...baseShape, type: z.literal('text'), maxLength: z.number().optional() }),
  z.object({
    ...baseShape,
    type: z.literal('number'),
    min: z.number().optional(),
    max: z.number().optional(),
  }),
  z.object({ ...baseShape, type: z.literal('date') }),
  z.object({
    ...baseShape,
    type: z.literal('image'),
    multiple: z.boolean().optional(),
    maxCount: z.number().optional(),
    maxSizeMB: z.number().optional(),
  }),
  z.object({
    ...baseShape,
    type: z.literal('option'),
    optionSetId: z.string(),
    multiple: z.boolean().optional(),
  }),
  z.object({
    ...baseShape,
    type: z.literal('formula'),
    formula: z.string(),
    dependsOn: z.array(z.string()),
    output: z.enum(['text', 'number', 'date']).optional(),
  }),
]);

const createTableSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]+$/i),
  name: z.string().min(1),
  columns: z.array(columnSchema),
  optionSets: z.record(z.string(), z.array(z.string())).default({}),
});

const patchSchema = z.object({
  name: z.string().optional(),
  columns: z.array(columnSchema).optional(),
  optionSets: z.record(z.string(), z.array(z.string())).optional(),
});

export async function tablesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/tables', { onRequest: [app.authenticate] }, async () => {
    const tables = await listTables();
    return { tables };
  });

  app.get('/api/tables/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const schema = await getTable(id);
    if (!schema) return reply.code(404).send({ code: 'not_found', message: '表不存在' });
    return { schema };
  });

  app.post('/api/tables', { onRequest: [app.authenticate] }, async (req, reply) => {
    if (!isSchemaEditAllowed(req.user.role)) {
      return reply.code(403).send({ code: 'forbidden', message: '仅管理员可建表' });
    }
    const parsed = createTableSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: 'bad_request', message: parsed.error.message });
    }
    const schema: TableSchema = { ...parsed.data, schemaVersion: 1 };
    const created = await createTable(schema, req.user);
    return { schema: created };
  });

  app.patch('/api/tables/:id/schema', { onRequest: [app.authenticate] }, async (req, reply) => {
    if (!isSchemaEditAllowed(req.user.role)) {
      return reply.code(403).send({ code: 'forbidden', message: '仅管理员可改 schema' });
    }
    const { id } = req.params as { id: string };
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: 'bad_request', message: parsed.error.message });
    }
    try {
      const next = await updateSchema(id, parsed.data, req.user);
      app.io.to(`table:${id}`).emit('schema.updated', { schema: next });
      return { schema: next };
    } catch (err) {
      return reply.code(404).send({ code: 'not_found', message: (err as Error).message });
    }
  });

  // Option sets nested under table
  app.get('/api/tables/:id/option-sets', { onRequest: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    const sets = await listOptionSets(id);
    return { optionSets: sets };
  });

  app.patch(
    '/api/tables/:id/option-sets/:key',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      if (!isSchemaEditAllowed(req.user.role)) {
        return reply.code(403).send({ code: 'forbidden', message: '仅管理员可改选项集' });
      }
      const { id, key } = req.params as { id: string; key: string };
      const body = z.object({ values: z.array(z.string()) }).safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send({ code: 'bad_request', message: body.error.message });
      }
      const next = await setOptionSet(id, key, body.data.values, req.user);
      app.io.to(`table:${id}`).emit('schema.updated', { optionSets: { [key]: next } });
      return { key, values: next };
    },
  );

  app.get('/api/tables/:id/option-set-keys', { onRequest: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    const keys = await listOptionSetKeys(id);
    return { keys };
  });
}