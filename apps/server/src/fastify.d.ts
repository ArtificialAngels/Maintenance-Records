import type { FastifyReply, FastifyRequest } from 'fastify';
import type { JwtPayload } from './types.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: JwtPayload;
  }
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export {};