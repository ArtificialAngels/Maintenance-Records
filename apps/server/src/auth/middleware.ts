import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import type { JwtPayload } from '../types.js';

// Note: @fastify/jwt already decorates `user` on requests, so we only register
// the `authenticate` instance decorator here. Type augmentation lives in
// src/fastify.d.ts (auto-loaded for type-checking, no runtime import needed).
let registered = false;

export function registerAuthMiddleware(app: FastifyInstance): void {
  if (registered) return;
  registered = true;
  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const payload = await req.jwtVerify<JwtPayload>({ secret: config.jwtSecret } as Parameters<typeof req.jwtVerify>[0]);
      req.user = payload;
    } catch {
      return reply.code(401).send({ code: 'unauthorized', message: '请先登录' });
    }
  });
}