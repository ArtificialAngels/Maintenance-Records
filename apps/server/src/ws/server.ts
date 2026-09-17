import type { FastifyInstance } from 'fastify';
import { Server as IOServer } from 'socket.io';
import { config } from '../config.js';
import { listRows } from '../rows/service.js';
import { getTable } from '../tables/service.js';
import { logger } from '../logger.js';
import type { JwtPayload } from '../types.js';

declare module 'fastify' {
  interface FastifyInstance {
    io: IOServer;
  }
}

export function setupSocketIO(app: FastifyInstance): IOServer {
  const io = new IOServer(app.server, {
    cors: { origin: true, credentials: true },
  });

  app.decorate('io', io);

  // Per-socket JWT auth handshake.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('unauthorized'));
    try {
      const payload = app.jwt.verify<JwtPayload>(token, { secret: config.jwtSecret } as Parameters<typeof app.jwt.verify>[1]);
      (socket.data as { user: JwtPayload }).user = payload;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const user = (socket.data as { user: JwtPayload }).user;
    logger.info({ user: user.sub }, 'socket connected');

    socket.on('subscribe', async (payload: { tableId: string }, ack?: (data: unknown) => void) => {
      const { tableId } = payload;
      const schema = await getTable(tableId);
      if (!schema) {
        ack?.({ ok: false, error: '表不存在' });
        return;
      }
      socket.join(`table:${tableId}`);
      const rows = await listRows(tableId, user);
      ack?.({ ok: true, schema, rows });
      socket.emit('presence', { userId: user.sub, name: user.name });
    });

    socket.on('disconnect', () => {
      logger.info({ user: user.sub }, 'socket disconnected');
    });
  });

  return io;
}