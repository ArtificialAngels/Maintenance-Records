import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import { config } from './config.js';
import { logger } from './logger.js';
import { ensureDir } from './storage/fs.js';
import { paths } from './storage/paths.js';
import { registerAuthMiddleware } from './auth/middleware.js';
import { authRoutes } from './auth/routes.js';
import { tablesRoutes } from './tables/routes.js';
import { rowsRoutes } from './rows/routes.js';
import { imagesRoutes } from './images/routes.js';
import { auditRoutes } from './audit/routes.js';
import { formulaRoutes } from './formulas/routes.js';
import { statsRoutes } from './stats/routes.js';
import { setupSocketIO } from './ws/server.js';

async function buildApp() {
  const app = Fastify({
    loggerInstance: logger,
    bodyLimit: 5 * 1024 * 1024,
  }) as unknown as Awaited<ReturnType<typeof Fastify>>;

  await app.register(cors, { origin: true, credentials: true });
  await app.register(jwt, { secret: config.jwtSecret });
  await app.register(multipart, {
    limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  });

  registerAuthMiddleware(app);

  app.get('/api/health', async () => ({
    ok: true,
    dataDir: paths.root(),
    time: new Date().toISOString(),
  }));

  await app.register(authRoutes);
  await app.register(tablesRoutes);
  await app.register(rowsRoutes);
  await app.register(imagesRoutes);
  await app.register(auditRoutes);
  await app.register(formulaRoutes);
  await app.register(statsRoutes);

  setupSocketIO(app);

  return app;
}

async function main() {
  await ensureDir(paths.root());
  const app = await buildApp();
  try {
    await app.listen({ host: config.host, port: config.port });
    logger.info(
      { url: `http://${config.host}:${config.port}`, dataDir: paths.root() },
      'maintenance-records server started',
    );
  } catch (err) {
    logger.error(err, 'failed to start');
    process.exit(1);
  }
}

main();