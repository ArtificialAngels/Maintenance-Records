import type { FastifyInstance } from 'fastify';
import { saveImageAsset, readImageFile } from './service.js';
import fs from 'node:fs';

export async function imagesRoutes(app: FastifyInstance): Promise<void> {
  // Multipart upload: client sends form-data with fields rowId, colId, file.
  app.post(
    '/api/tables/:id/uploads/:rowId/:colId',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const { id, rowId, colId } = req.params as {
        id: string;
        rowId: string;
        colId: string;
      };
      const part = await req.file();
      if (!part) {
        return reply.code(400).send({ code: 'bad_request', message: '未收到文件' });
      }
      const buf = await part.toBuffer();
      try {
        const ref = await saveImageAsset(
          id,
          rowId,
          colId,
          buf,
          part.mimetype,
          part.filename ?? 'unnamed',
          req.user,
        );
        return { asset: ref };
      } catch (err) {
        return reply
          .code(400)
          .send({ code: 'bad_request', message: (err as Error).message });
      }
    },
  );

  // Asset GET is public: the 64-bit assetId (12-char nanoid) is itself the
  // "secret". For a private internal tool this is sufficient; for a public
  // deployment we'd switch to signed URLs with TTL.
  app.get(
    '/api/tables/:id/assets/:rowId/:colId/:assetId',
    async (req, reply) => {
      const { id, rowId, colId, assetId } = req.params as {
        id: string;
        rowId: string;
        colId: string;
        assetId: string;
      };
      const found = await readImageFile(id, rowId, colId, assetId);
      if (!found) {
        return reply.code(404).send({ code: 'not_found', message: '图片不存在' });
      }
      reply.header('Content-Type', found.mime);
      reply.header('Cache-Control', 'public, max-age=3600');
      return reply.send(fs.createReadStream(found.path));
    },
  );
}