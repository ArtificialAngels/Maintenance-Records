/**
 * Set or clear a user's password.
 *
 *   pnpm set-password <userId> [newPassword]
 *
 * When newPassword is omitted, an interactive prompt is used (the typed
 * password is not echoed). Pass "clear" as the password to remove it.
 */
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { listUsers, setUserPassword } from '../users/store.js';

const [, , userId, maybePassword] = process.argv;

if (!userId) {
  console.error('用法: pnpm set-password <userId> [newPassword]');
  console.error('示例: pnpm set-password u_admin 新密码');
  process.exit(1);
}

async function promptPassword(): Promise<string> {
  const rl = createInterface({ input, output });
  // Hide input by replacing each typed character with '*'
  const hidden = () => {
    process.stdout.write('\x1B[8m');
  };
  hidden();
  const pwd = await rl.question('请输入新密码: ');
  process.stdout.write('\x1B[0m\n');
  rl.close();
  return pwd.trim();
}

const users = await listUsers();
const user = users.find((u) => u.id === userId);
if (!user) {
  console.error(`用户不存在: ${userId}`);
  console.error(`现有用户: ${users.map((u) => u.id).join(', ')}`);
  process.exit(1);
}

const password =
  maybePassword === undefined
    ? await promptPassword()
    : maybePassword === 'clear'
      ? undefined
      : maybePassword;

if (password !== undefined && password.length < 6) {
  console.error('密码至少 6 位。');
  process.exit(1);
}

const ok = await setUserPassword(userId, password);
if (!ok) {
  console.error('写入失败：users.json 不存在。');
  process.exit(1);
}
console.log(
  password === undefined
    ? `已清除 ${user.name}（${userId}）的密码。`
    : `已为 ${user.name}（${userId}）设置新密码。`,
);
