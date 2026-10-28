import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from './logger.js';

/**
 * Resolve the built frontend directory.
 *
 * Both run layouts land on apps/web/dist:
 *   - tsx (dev):       apps/server/src  -> ../../web/dist
 *   - compiled (prod): apps/server/dist -> ../../web/dist
 */
export function webDistDir(): string {
  // Works both for the plain ESM build (dist/index.js: import.meta.url) and
  // for a bundled CJS build (dist/index.cjs: __dirname).
  const here =
    typeof __dirname === 'string' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', '..', 'web', 'dist');
}

/**
 * Serve the built frontend (vite build -> apps/web/dist) from the same origin
 * as the API and WebSocket. Registered AFTER all API routes; when the dist
 * directory does not exist (e.g. dev mode using the Vite server) it is skipped.
 */
export async function registerStatic(app: FastifyInstance): Promise<void> {
  const dist = webDistDir();
  if (!existsSync(path.join(dist, 'index.html'))) {
    logger.warn(
      { dist },
      'frontend build not found, skipping static serving (dev mode uses Vite)',
    );
    return;
  }

  await app.register(fastifyStatic, {
    root: dist,
    // Index route is handled manually below so index.html is never cached.
    index: false,
    wildcard: false,
    // Content-hashed assets (and other hashed files) are immutable.
    maxAge: 31_536_000_000,
    immutable: true,
  });

  // Always serve index.html with revalidation so deployed updates take effect.
  app.get('/', async (_req, reply) => {
    reply.header('Cache-Control', 'no-cache');
    return reply.sendFile('index.html', { cacheControl: false });
  });

  // SPA fallback: any non-API GET that did not match a file returns index.html
  // so client-side routes (e.g. /tables/equipment) survive a refresh.
  app.setNotFoundHandler((req, reply) => {
    if (
      req.method === 'GET' &&
      !req.url.startsWith('/api/') &&
      !req.url.startsWith('/socket.io/')
    ) {
      reply.header('Cache-Control', 'no-cache');
      return reply.sendFile('index.html', { cacheControl: false });
    }
    return reply.code(404).send({ code: 'not_found', message: '资源不存在' });
  });

  logger.info({ dist }, 'serving frontend static files');
}
