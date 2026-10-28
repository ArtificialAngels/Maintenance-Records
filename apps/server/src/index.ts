import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import process from 'node:process';
import { writeFile } from 'node:fs/promises';
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
import { xlsxRoutes } from './xlsx/routes.js';
import { setupSocketIO } from './ws/server.js';
import { registerStatic } from './static.js';

async function buildApp() {
  const app = Fastify({
    loggerInstance: logger,
    bodyLimit: 5 * 1024 * 1024,
  }) as unknown as Awaited<ReturnType<typeof Fastify>>;

  await app.register(cors, {
    origin: true,
    credentials: true,
    // The Excel export sets Content-Disposition; the browser needs to read it
    // to pick a download filename when the API is called cross-origin.
    exposedHeaders: ['Content-Disposition'],
  });
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
  await app.register(xlsxRoutes);

  setupSocketIO(app);

  // Last: serve the built frontend (same-origin) with SPA fallback.
  await registerStatic(app);

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
    // Optional: record our own PID so launchers that do not manage the
    // process themselves (e.g. the PowerShell-free start path) can stop it.
    const pidFile = process.env.MR_PID_FILE;
    if (pidFile) {
      try {
        await writeFile(pidFile, String(process.pid), 'utf8');
      } catch (err) {
        logger.warn(err, 'could not write pid file');
      }
    }
  } catch (err) {
    logger.error(err, 'failed to start');
    process.exit(1);
  }
}

main();