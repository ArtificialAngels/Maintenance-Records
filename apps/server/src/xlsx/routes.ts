import type { FastifyInstance } from 'fastify';
import { getTable } from '../tables/service.js';
import { importRows, listRows } from '../rows/service.js';
import { isSchemaEditAllowed } from '../permissions/check.js';
import {
  FORBIDDEN_TABLE_MESSAGE,
  getTableAccess,
  READONLY_TABLE_MESSAGE,
} from '../permissions/table-access.js';
import { buildExportWorkbook, parseImportWorkbook } from './service.js';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** RFC 6266 / 5987 filename with an ASCII fallback for old clients. */
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function xlsxRoutes(app: FastifyInstance): Promise<void> {
  // Export one table as a single-sheet .xlsx (image columns omitted).
  app.get(
    '/api/tables/:id/export.xlsx',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      if ((await getTableAccess(req.user, id)) === 'none') {
        return reply.code(403).send({ code: 'forbidden', message: FORBIDDEN_TABLE_MESSAGE });
      }
      const schema = await getTable(id);
      if (!schema) {
        return reply.code(404).send({ code: 'not_found', message: '表不存在' });
      }
      const rows = await listRows(id, req.user);
      const buffer = buildExportWorkbook(schema, rows, req.user.role);
      const stamp = new Date().toISOString().slice(0, 10);
      return reply
        .header('Content-Type', XLSX_MIME)
        .header('Content-Disposition', contentDisposition(`${schema.name}-${stamp}.xlsx`))
        .header('Content-Length', buffer.byteLength)
        .send(buffer);
    },
  );

  // Append rows from an uploaded .xlsx. Headers are matched against column
  // names (then ids), so an exported file round-trips unchanged.
  app.post(
    '/api/tables/:id/import.xlsx',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      if (!isSchemaEditAllowed(req.user.role)) {
        return reply.code(403).send({ code: 'forbidden', message: '仅管理员可导入' });
      }
      const { id } = req.params as { id: string };
      const schema = await getTable(id);
      if (!schema) {
        return reply.code(404).send({ code: 'not_found', message: '表不存在' });
      }

      let part;
      try {
        part = await req.file();
      } catch {
        return reply
          .code(400)
          .send({ code: 'bad_request', message: '请使用 multipart/form-data 上传文件' });
      }
      if (!part) {
        return reply.code(400).send({ code: 'bad_request', message: '未收到文件' });
      }
      const filename = part.filename ?? '';
      if (filename && !/\.xlsx?$/i.test(filename)) {
        return reply
          .code(400)
          .send({ code: 'bad_request', message: '仅支持 .xlsx / .xls 文件' });
      }

      const buffer = await part.toBuffer();
      const parsed = parseImportWorkbook(buffer, schema, req.user.role);
      if (parsed.records.length === 0) {
        return reply.code(400).send({
          code: 'bad_request',
          message: `文件中没有可导入的数据行。请确认表头与列名一致，当前可识别的列：${parsed.expectedHeaders.join('、') || '（无）'}`,
        });
      }

      const result = await importRows(id, parsed.records, req.user);
      if (result.rows.length > 0) {
        // One event for the whole batch; clients refetch rather than patching.
        app.io.to(`table:${id}`).emit('rows.imported', {
          count: result.rows.length,
        });
      }

      return {
        imported: result.rows.length,
        skipped: result.skipped,
        unmatchedHeaders: parsed.unmatchedHeaders,
      };
    },
  );
}
