import { getUser } from '../users/store.js';
import type { JwtPayload, Role, TableAccess, User } from '../types.js';

/**
 * Table-level permission resolution.
 *
 * Rules:
 *   - admin                        → 所有表 'write'
 *   - user, tablePermissions 缺失  → 所有表 'write'（旧版账号，保持原行为）
 *   - user, tablePermissions 存在  → 只看 map 里列出的表；没有 key = 无权限
 *
 * 权限每次请求都从 users.json 现读，所以管理员改完立刻生效，不需要用户重新登录。
 */

export type AccessLevel = TableAccess | 'none';

export interface AccessSource {
  role: Role;
  tablePermissions?: Record<string, TableAccess>;
}

/** Pure function: what can this user do with this table? */
export function accessFor(source: AccessSource | null, tableId: string): AccessLevel {
  if (!source) return 'none';
  if (source.role === 'admin') return 'write';
  const perms = source.tablePermissions;
  if (!perms) return 'write'; // legacy account: unrestricted
  const v = perms[tableId];
  return v === 'write' ? 'write' : v === 'read' ? 'read' : 'none';
}

/**
 * Resolve the whole permission map for one request.
 * Returns null when the account is unrestricted (admin / legacy), which lets
 * callers skip filtering entirely.
 */
export async function resolveAccessMap(
  actor: JwtPayload,
): Promise<Record<string, TableAccess> | null> {
  if (actor.role === 'admin') return null;
  const user: User | null = await getUser(actor.sub);
  if (!user) return {};
  if (!user.tablePermissions) return null;
  const out: Record<string, TableAccess> = {};
  for (const [tableId, level] of Object.entries(user.tablePermissions)) {
    if (level === 'read' || level === 'write') out[tableId] = level;
  }
  return out;
}

export function accessFromMap(
  map: Record<string, TableAccess> | null,
  tableId: string,
): AccessLevel {
  if (map === null) return 'write';
  return map[tableId] ?? 'none';
}

/** Convenience for a single table. */
export async function getTableAccess(
  actor: JwtPayload,
  tableId: string,
): Promise<AccessLevel> {
  return accessFromMap(await resolveAccessMap(actor), tableId);
}

export const FORBIDDEN_TABLE_MESSAGE = '没有这张表格的访问权限，请联系管理员分配';
export const READONLY_TABLE_MESSAGE = '这张表格对你是只读的，不能新增或修改记录';
