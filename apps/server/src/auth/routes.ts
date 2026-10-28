import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  createUser,
  deleteUser,
  getUser,
  listUsers,
  publicUser,
  setUserPassword,
  setUserTablePermissions,
  UserExistsError,
  verifyPassword,
} from '../users/store.js';
import { listTables } from '../tables/service.js';
import { audit } from '../audit/log.js';
import type { JwtPayload, TableAccess } from '../types.js';

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

  // ---- User management (admin only) ----
  const tablePermissionsSchema = z.record(z.string().min(1), z.enum(['read', 'write']));

  const createUserSchema = z.object({
    id: z
      .string()
      .regex(
        /^[A-Za-z0-9][A-Za-z0-9_.-]{1,31}$/,
        '账号只能用字母、数字、下划线、点、横线，2–32 位，并以字母或数字开头',
      ),
    name: z.string().trim().min(1, '请填写姓名').max(32),
    role: z.enum(['admin', 'user']),
    password: z.string().min(6, '密码至少 6 位').max(128),
    tablePermissions: tablePermissionsSchema.optional(),
  });

  /** Reject permission maps that reference tables which don't exist (e.g. deleted). */
  async function unknownTableId(perms: Record<string, TableAccess>): Promise<string | null> {
    const known = new Set((await listTables()).map((t) => t.id));
    for (const id of Object.keys(perms)) {
      if (!known.has(id)) return id;
    }
    return null;
  }

  function writeFailed(reply: FastifyReply, err: unknown) {
    return reply.code(500).send({
      code: 'write_failed',
      message: `保存 users.json 失败：${(err as Error).message}`,
    });
  }

  /**
   * 权限变更/删号后，把该账号的实时连接踢掉：socket 重连时会重新校验权限，
   * 避免已经被收回权限的页面继续收到别的表格的推送。
   */
  function evictSockets(userId: string): void {
    try {
      for (const socket of app.io.sockets.sockets.values()) {
        const u = (socket.data as { user?: JwtPayload }).user;
        if (u?.sub === userId) socket.disconnect(true);
      }
    } catch (err) {
      app.log.warn({ err, user: userId }, 'could not evict sockets');
    }
  }

  app.post('/api/auth/users', { onRequest: [app.authenticate] }, async (req, reply) => {
    if (req.user.role !== 'admin') {
      return reply.code(403).send({ code: 'forbidden', message: '仅管理员可新增用户' });
    }
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        code: 'bad_request',
        message: parsed.error.issues[0]?.message ?? '参数不正确',
      });
    }
    const { id, name, role, password } = parsed.data;
    const perms = role === 'user' ? (parsed.data.tablePermissions ?? {}) : undefined;
    if (perms) {
      const bad = await unknownTableId(perms);
      if (bad) {
        return reply.code(400).send({ code: 'bad_request', message: `表格「${bad}」不存在` });
      }
    }
    try {
      const user = await createUser({ id, name, role, password, tablePermissions: perms });
      await audit({
        actor: req.user.sub,
        role: req.user.role,
        action: 'user.create',
        rowId: id,
        details: { target: id, name, role, tables: perms ? Object.keys(perms).length : 'all' },
      });
      app.log.info({ actor: req.user.sub, target: id, role }, 'user created');
      return { user: publicUser(user) };
    } catch (err) {
      if (err instanceof UserExistsError) {
        return reply.code(409).send({ code: 'conflict', message: err.message });
      }
      req.log.error({ err, target: id }, 'create user failed');
      return writeFailed(reply, err);
    }
  });

  app.delete(
    '/api/auth/users/:id',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      if (req.user.role !== 'admin') {
        return reply.code(403).send({ code: 'forbidden', message: '仅管理员可删除用户' });
      }
      const { id } = req.params as { id: string };
      if (id === req.user.sub) {
        return reply
          .code(400)
          .send({ code: 'bad_request', message: '不能删除当前登录的账号' });
      }
      const target = await getUser(id);
      if (!target) {
        return reply.code(404).send({ code: 'not_found', message: '用户不存在' });
      }
      try {
        const ok = await deleteUser(id);
        if (!ok) return reply.code(404).send({ code: 'not_found', message: '用户不存在' });
      } catch (err) {
        req.log.error({ err, target: id }, 'delete user failed');
        return writeFailed(reply, err);
      }
      await audit({
        actor: req.user.sub,
        role: req.user.role,
        action: 'user.delete',
        rowId: id,
        details: { target: id, name: target.name, role: target.role },
      });
      app.log.info({ actor: req.user.sub, target: id }, 'user deleted');
      evictSockets(id);
      return { ok: true };
    },
  );

  // Replace a non-admin user's per-table access map.
  const tablesBodySchema = z.object({ tablePermissions: tablePermissionsSchema });
  app.put(
    '/api/auth/users/:id/tables',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      if (req.user.role !== 'admin') {
        return reply.code(403).send({ code: 'forbidden', message: '仅管理员可配置表格权限' });
      }
      const { id } = req.params as { id: string };
      const target = await getUser(id);
      if (!target) {
        return reply.code(404).send({ code: 'not_found', message: '用户不存在' });
      }
      if (target.role === 'admin') {
        return reply.code(400).send({
          code: 'bad_request',
          message: '管理员默认拥有全部表格的查看和编辑权限，无需单独配置',
        });
      }
      const parsed = tablesBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ code: 'bad_request', message: '权限格式不正确（只支持 read / write）' });
      }
      const perms = parsed.data.tablePermissions;
      const bad = await unknownTableId(perms);
      if (bad) {
        return reply.code(400).send({ code: 'bad_request', message: `表格「${bad}」不存在` });
      }
      try {
        const ok = await setUserTablePermissions(id, perms);
        if (!ok) return reply.code(404).send({ code: 'not_found', message: '用户不存在' });
      } catch (err) {
        req.log.error({ err, target: id }, 'save table permissions failed');
        return writeFailed(reply, err);
      }
      await audit({
        actor: req.user.sub,
        role: req.user.role,
        action: 'user.tables.update',
        rowId: id,
        details: { target: id, tables: perms },
      });
      app.log.info({ actor: req.user.sub, target: id }, 'table permissions updated');
      evictSockets(id);
      return { ok: true, tablePermissions: perms };
    },
  );

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
