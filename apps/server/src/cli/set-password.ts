/**
 * Set or clear a user's password.
 *
 *   node dist/cli/set-password.js <userId> [newPassword]
 *
 * When newPassword is omitted, an interactive prompt is used. Pass "clear"
 * as the password to remove it.
 *
 * Everything lives inside main() on purpose: the release ships this file as a
 * CJS bundle (esbuild), and CJS cannot contain top-level await.
 */
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { listUsers, setUserPassword } from '../users/store.js';

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

async function main(): Promise<void> {
  const [, , userId, maybePassword] = process.argv;

  if (!userId) {
    console.error('用法: set-password <账号ID> [新密码|clear]');
    console.error('示例: set-password u_admin 新密码');
    process.exit(1);
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
}

main().catch((err: unknown) => {
  console.error('改密码失败:', err);
  process.exit(1);
});
