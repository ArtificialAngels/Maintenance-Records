import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { listUsers } from '../users/store.js';
import type { JwtPayload } from '../types.js';

const loginSchema = z.object({ userId: z.string().min(1) });

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Public: list users available for the picker (demo: no password)
  app.get('/api/auth/users', async () => {
    const users = await listUsers();
    return { users };
  });

  // Demo: pick a user, get a JWT (no password check).
  app.post('/api/auth/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: 'bad_request', message: parsed.error.message });
    }
    const users = await listUsers();
    const user = users.find((u) => u.id === parsed.data.userId);
    if (!user) {
      return reply.code(404).send({ code: 'not_found', message: '用户不存在' });
    }
    const payload: JwtPayload = { sub: user.id, role: user.role, name: user.name };
    const token = app.jwt.sign(payload, {
      expiresIn: '12h',
    });
    return { token, user };
  });

  app.get('/api/me', { onRequest: [app.authenticate] }, async (req) => {
    return { user: req.user };
  });
}