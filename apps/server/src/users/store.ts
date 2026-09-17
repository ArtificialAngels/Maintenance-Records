import { paths } from '../storage/paths.js';
import { readJson, writeJson, ensureDir } from '../storage/fs.js';
import type { User, UsersFile } from '../types.js';

const DEFAULT_USERS: UsersFile = {
  users: [
    { id: 'u_admin', name: '管理员', role: 'admin' },
    { id: 'u_alice', name: 'Alice', role: 'user' },
    { id: 'u_bob', name: 'Bob', role: 'user' },
  ],
};

export async function listUsers(): Promise<User[]> {
  let data = await readJson<UsersFile>(paths.usersFile());
  if (!data) {
    await ensureDir(paths.root());
    await writeJson(paths.usersFile(), DEFAULT_USERS);
    data = DEFAULT_USERS;
  }
  return data.users;
}

export async function getUser(id: string): Promise<User | null> {
  const users = await listUsers();
  return users.find((u) => u.id === id) ?? null;
}