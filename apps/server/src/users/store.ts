import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import { paths } from '../storage/paths.js';
import { readJson, writeJson, ensureDir } from '../storage/fs.js';
import type { TableAccess, User, UsersFile } from '../types.js';

/**
 * Default credentials for the first-time bootstrap users file.
 * Change them immediately with the set-password CLI after deployment.
 */
const DEFAULT_PASSWORDS: Record<string, string> = {
  u_admin: 'admin123',
  u_alice: 'alice123',
  u_bob: 'bob123',
};

const DEFAULT_USERS: UsersFile = {
  users: [
    { id: 'u_admin', name: '管理员', role: 'admin' },
    { id: 'u_alice', name: 'Alice', role: 'user' },
    { id: 'u_bob', name: 'Bob', role: 'user' },
  ],
};

// scrypt parameters (interactive login is infrequent; favor safety).
const SCRYPT_KEYLEN = 32;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;

/**
 * Produce a self-contained scrypt hash string:
 *   scrypt$<N>$<r>$<p>$<saltHex>$<hashHex>
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_PARAMS);
  return [
    'scrypt',
    SCRYPT_PARAMS.N,
    SCRYPT_PARAMS.r,
    SCRYPT_PARAMS.p,
    salt.toString('hex'),
    derived.toString('hex'),
  ].join('$');
}

/** Verify a password against a stored scrypt hash. Never throws. */
export function verifyPassword(password: string, stored: string | undefined): boolean {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltHex, hashHex] = parts as [
    string, string, string, string, string, string,
  ];
  try {
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const derived = scryptSync(password, salt, expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    });
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** Strip secrets before sending user objects to clients. */
export function publicUser(u: User): Omit<User, 'passwordHash'> & {
  hasPassword: boolean;
} {
  return {
    id: u.id,
    name: u.name,
    role: u.role,
    tablePermissions: u.tablePermissions,
    hasPassword: !!u.passwordHash,
  };
}

export async function listUsers(): Promise<User[]> {
  let data = await readJson<UsersFile>(paths.usersFile());
  if (!data) {
    await ensureDir(paths.root());
    // Seed with default passwords so the first login works out of the box.
    data = {
      users: DEFAULT_USERS.users.map((u) => ({
        ...u,
        passwordHash: DEFAULT_PASSWORDS[u.id]
          ? hashPassword(DEFAULT_PASSWORDS[u.id]!)
          : undefined,
      })),
    };
    await writeJson(paths.usersFile(), data);
  }
  return data.users;
}

export async function getUser(id: string): Promise<User | null> {
  const users = await listUsers();
  return users.find((u) => u.id === id) ?? null;
}

/** Set (or clear with undefined) a user's password. Returns false if no such user. */
export async function setUserPassword(
  id: string,
  password: string | undefined,
): Promise<boolean> {
  const data = await readJson<UsersFile>(paths.usersFile());
  if (!data) return false;
  const idx = data.users.findIndex((u) => u.id === id);
  if (idx < 0) return false;
  const current = data.users[idx]!;
  // Spread first: table permissions (and any future fields) must survive a
  // password change. Rebuilding the object here used to wipe them.
  const next: User = { ...current };
  if (password) {
    next.passwordHash = hashPassword(password);
  } else {
    delete next.passwordHash;
  }
  data.users[idx] = next;
  await writeJson(paths.usersFile(), data);
  return true;
}

export class UserExistsError extends Error {
  constructor(id: string) {
    super(`账号「${id}」已存在`);
    this.name = 'UserExistsError';
  }
}

export interface NewUserInput {
  id: string;
  name: string;
  role: 'admin' | 'user';
  password: string;
  tablePermissions?: Record<string, TableAccess>;
}

/** Create a new account (admin UI). Throws UserExistsError on duplicate id. */
export async function createUser(input: NewUserInput): Promise<User> {
  // listUsers() also seeds users.json on a fresh data directory.
  const existing = await listUsers();
  if (existing.some((u) => u.id === input.id)) throw new UserExistsError(input.id);

  const data = (await readJson<UsersFile>(paths.usersFile())) ?? { users: [] };
  const user: User = {
    id: input.id,
    name: input.name,
    role: input.role,
    passwordHash: hashPassword(input.password),
  };
  // Admins always have every table; only non-admins carry an explicit map.
  if (input.role === 'user') user.tablePermissions = input.tablePermissions ?? {};
  data.users.push(user);
  await writeJson(paths.usersFile(), data);
  return user;
}

/** Delete an account. Returns false when the id does not exist. */
export async function deleteUser(id: string): Promise<boolean> {
  const data = await readJson<UsersFile>(paths.usersFile());
  if (!data) return false;
  const before = data.users.length;
  data.users = data.users.filter((u) => u.id !== id);
  if (data.users.length === before) return false;
  await writeJson(paths.usersFile(), data);
  return true;
}

/**
 * Replace a user's table permission map.
 * `undefined` restores the legacy "all tables" behaviour.
 */
export async function setUserTablePermissions(
  id: string,
  permissions: Record<string, TableAccess> | undefined,
): Promise<boolean> {
  const data = await readJson<UsersFile>(paths.usersFile());
  if (!data) return false;
  const idx = data.users.findIndex((u) => u.id === id);
  if (idx < 0) return false;
  const next: User = { ...data.users[idx]! };
  if (permissions === undefined) delete next.tablePermissions;
  else next.tablePermissions = permissions;
  data.users[idx] = next;
  await writeJson(paths.usersFile(), data);
  return true;
}
