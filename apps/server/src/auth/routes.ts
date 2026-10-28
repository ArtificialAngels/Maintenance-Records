import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  getUser,
  listUsers,
  publicUser,
  setUserPassword,
  verifyPassword,
} from '../users/store.js';
import { audit } from '../audit/log.js';
import type { JwtPayload } from '../types.js';

const loginSchema = z.object({
  userId: z.string().min(1),
  password: z.string().min(1),
});

/**
 * Minimal in-memory login throttling: keyed by IP + userId. After
 * MAX_FAILURES failures within WINDOW_MS the key is blocked until the window
 * rolls over. State resets on restart (single-process deployment).
 */
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; firstAt: number }>();

function throttleKey(ip: string, userId: string): string {
  return `${ip}::${userId}`;
}

function checkThrottle(key: string): number {
  const now = Date.now();
  const rec = failures.get(key);
  if (!rec) return 0;
  if (now - rec.firstAt > WINDOW_MS) {
    failures.delete(key);
    return 0;
  }
  if (rec.count >= MAX_FAILURES) {
    return Math.ceil((WINDOW_MS - (now - rec.firstAt)) / 1000);
  }
  return 0;
}

function recordFailure(key: string): void {
  const now = Date.now();
  const rec = failures.get(key);
  if (!rec || now - rec.firstAt > WINDOW_MS) {
    failures.set(key, { count: 1, firstAt: now });
  } else {
    rec.count += 1;
  }
}

function clearFailures(key: string): void {
  failures.delete(key);
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Authenticated user list (admin only; password hashes stripped).
  app.get('/api/auth/users', { onRequest: [app.authenticate] }, async (req, reply) => {
    if (req.user.role !== 'admin') {
      return reply.code(403).send({ code: 'forbidden', message: '仅管理员可查看用户列表' });
    }
    const users = await listUsers();
    return { users: users.map(publicUser) };
  });

  // Admin resets a non-admin user's password.
  const resetSchema = z.object({ password: z.string().min(6).max(128) });
  app.post(
    '/api/auth/users/:id/password',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      if (req.user.role !== 'admin') {
        return reply.code(403).send({ code: 'forbidden', message: '仅管理员可重置密码' });
      }
      const { id } = req.params as { id: string };
      const target = await getUser(id);
      if (!target) {
        return reply.code(404).send({ code: 'not_found', message: '用户不存在' });
      }
      if (target.role === 'admin') {
        return reply.code(403).send({
          code: 'forbidden',
          message:
            '管理员账号的密码不能由别人重置。请让该账号自己登录后在「用户管理」里修改，或在服务器上运行「设置密码.bat」',
        });
      }
      const parsed = resetSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ code: 'bad_request', message: '密码至少 6 位' });
      }
      let ok = false;
      try {
        ok = await setUserPassword(id, parsed.data.password);
      } catch (err) {
        // users.json 写在共享盘上时，杀软/占用会让 rename 失败：给出可读原因，
        // 而不是让前端只看到 "Internal Server Error"。
        req.log.error({ err, target: id }, 'password reset write failed');
        return reply.code(500).send({
          code: 'write_failed',
          message: `保存 users.json 失败：${(err as Error).message}`,
        });
      }
      if (!ok) {
        return reply.code(404).send({ code: 'not_found', message: '用户不存在' });
      }
      await audit({
        actor: req.user.sub,
        role: req.user.role,
        action: 'user.password.reset',
        rowId: id,
        details: { target: id },
      });
      app.log.info({ actor: req.user.sub, target: id }, 'password reset by admin');
      return { ok: true };
    },
  );

  // Change MY OWN password (any logged-in role). Requires the current password,
  // so a stolen/left-open session cannot silently lock the owner out.
  const selfSchema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(6).max(128),
  });
  app.post('/api/auth/me/password', { onRequest: [app.authenticate] }, async (req, reply) => {
    const parsed = selfSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: 'bad_request', message: '新密码至少 6 位' });
    }
    const me = req.user as JwtPayload;
    const user = await getUser(me.sub);
    if (!user) {
      return reply.code(404).send({ code: 'not_found', message: '用户不存在' });
    }
    if (!verifyPassword(parsed.data.currentPassword, user.passwordHash)) {
      return reply.code(400).send({ code: 'bad_credentials', message: '当前密码不正确' });
    }
    if (parsed.data.currentPassword === parsed.data.newPassword) {
      return reply.code(400).send({ code: 'bad_request', message: '新密码不能与当前密码相同' });
    }
    try {
      const ok = await setUserPassword(user.id, parsed.data.newPassword);
      if (!ok) {
        return reply.code(404).send({ code: 'not_found', message: '用户不存在' });
      }
    } catch (err) {
      req.log.error({ err, user: user.id }, 'self password change write failed');
      return reply.code(500).send({
        code: 'write_failed',
        message: `保存 users.json 失败：${(err as Error).message}`,
      });
    }
    await audit({
      actor: me.sub,
      role: me.role,
      action: 'user.password.change',
      rowId: user.id,
      details: { target: user.id },
    });
    app.log.info({ user: user.id }, 'password changed by owner');
    return { ok: true };
  });

  // Password login.
  app.post('/api/auth/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: 'bad_request', message: '请输入账号和密码' });
    }
    const { userId, password } = parsed.data;
    const ip = req.ip;
    const key = throttleKey(ip, userId);
    const waitSec = checkThrottle(key);
    if (waitSec > 0) {
      return reply.code(429).send({
        code: 'too_many_attempts',
        message: `失败次数过多，请 ${waitSec} 秒后再试`,
      });
    }

    const users = await listUsers();
    const user = users.find((u) => u.id === userId);
    // Run a scrypt comparison even when the user is missing to reduce timing leak.
    const dummyHash =
      'scrypt$16384$8$1$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000';
    const ok = verifyPassword(password, user?.passwordHash ?? dummyHash);

    if (!user || !ok) {
      recordFailure(key);
      const rec = failures.get(key);
      const left = rec ? Math.max(0, MAX_FAILURES - rec.count) : MAX_FAILURES;
      return reply.code(401).send({
        code: 'bad_credentials',
        message: left > 0 ? `账号或密码错误，还可尝试 ${left} 次` : '账号或密码错误',
      });
    }
    clearFailures(key);

    const payload: JwtPayload = { sub: user.id, role: user.role, name: user.name };
    const token = app.jwt.sign(payload, { expiresIn: '12h' });
    app.log.info({ user: user.id }, 'user logged in');
    return { token, user: publicUser(user) };
  });

  app.get('/api/me', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = await getUser((req.user as JwtPayload).sub);
    if (!user) {
      return reply.code(404).send({ code: 'not_found', message: '用户不存在' });
    }
    return { user: publicUser(user) };
  });
}
