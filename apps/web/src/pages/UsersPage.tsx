import { useMemo, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Icon } from '../components/Icons';
import { toast } from '../components/Toaster';
import { confirmDialog } from '../components/ConfirmDialog';
import { useAuthStore } from '../stores/authStore';
import type { TableAccess, User } from '../lib/types';

const ROLE_LABEL: Record<string, string> = {
  admin: '管理员',
  user: '录入员',
};

type PermMap = Record<string, TableAccess>;
type AccessChoice = 'none' | 'read' | 'write';

const CHOICE_LABEL: Record<AccessChoice, string> = {
  none: '无权限',
  read: '只读',
  write: '可编辑',
};

interface TableOption {
  id: string;
  name: string;
}

/** 权限摘要：列表里那行小字。 */
function summarizePermissions(u: User, tables: TableOption[]): string {
  if (u.role === 'admin') return '全部表格 · 可编辑';
  if (!u.tablePermissions) return '全部表格 · 默认权限';
  const granted = tables.filter((t) => u.tablePermissions?.[t.id]);
  if (granted.length === 0) return '未分配任何表格';
  const write = granted.filter((t) => u.tablePermissions?.[t.id] === 'write').length;
  const read = granted.length - write;
  return `${granted.length} 张表 · ${write} 可编辑${read > 0 ? ` / ${read} 只读` : ''}`;
}

/** 初始值：旧版账号（无 tablePermissions）按「全部可编辑」展示，与后端一致。 */
function initialPermissions(u: User, tables: TableOption[]): PermMap {
  if (u.tablePermissions) {
    const out: PermMap = {};
    for (const [id, level] of Object.entries(u.tablePermissions)) {
      if (level === 'read' || level === 'write') out[id] = level;
    }
    return out;
  }
  const all: PermMap = {};
  for (const t of tables) all[t.id] = 'write';
  return all;
}

/**
 * 每张表一个三档选择：无权限 / 只读 / 可编辑。
 * 新增用户和单独配置权限共用这一个组件。
 */
function TablePermissionEditor({
  tables,
  value,
  onChange,
  disabled,
}: {
  tables: TableOption[];
  value: PermMap;
  onChange: (next: PermMap) => void;
  disabled?: boolean;
}) {
  const choiceOf = (id: string): AccessChoice => value[id] ?? 'none';

  function setOne(id: string, choice: AccessChoice) {
    const next = { ...value };
    if (choice === 'none') delete next[id];
    else next[id] = choice;
    onChange(next);
  }

  function setAll(choice: 'read' | 'write') {
    const next: PermMap = {};
    for (const t of tables) next[t.id] = choice;
    onChange(next);
  }

  return (
    <div className="um-perms">
      <div className="um-perms-head">
        <span className="um-label">表格权限</span>
        <span className="spacer" />
        <button
          type="button"
          className="ghost um-mini"
          onClick={() => setAll('read')}
          disabled={disabled || tables.length === 0}
        >
          全部只读
        </button>
        <button
          type="button"
          className="ghost um-mini"
          onClick={() => setAll('write')}
          disabled={disabled || tables.length === 0}
        >
          全部可编辑
        </button>
        <button
          type="button"
          className="ghost um-mini"
          onClick={() => onChange({})}
          disabled={disabled || Object.keys(value).length === 0}
        >
          清空
        </button>
      </div>
      {tables.length === 0 ? (
        <div className="um-perms-empty">系统里还没有任何表格，创建表格后再来分配。</div>
      ) : (
        <div className="um-perms-list">
          {tables.map((t) => (
            <div className="um-perm-row" key={t.id}>
              <span className="um-perm-name" title={`${t.name}（${t.id}）`}>
                <span className="um-perm-title">{t.name}</span>
                <span className="um-perm-id mono">{t.id}</span>
              </span>
              <div className="um-seg" role="group" aria-label={`${t.name} 的权限`}>
                {(['none', 'read', 'write'] as AccessChoice[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`um-seg-btn ${choiceOf(t.id) === c ? 'on' : ''} ${c}`}
                    aria-pressed={choiceOf(t.id) === c}
                    onClick={() => setOne(t.id, c)}
                    disabled={disabled}
                  >
                    {CHOICE_LABEL[c]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type DialogMode = 'reset' | 'self';

function PasswordDialog({
  mode,
  target,
  onClose,
}: {
  mode: DialogMode;
  target: User;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isSelf = mode === 'self';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (isSelf && !current) {
      setError('请输入当前密码');
      return;
    }
    if (password.length < 6) {
      setError('密码至少 6 位');
      return;
    }
    if (password !== confirm) {
      setError('两次输入的密码不一致');
      return;
    }
    if (isSelf && current === password) {
      setError('新密码不能与当前密码相同');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isSelf) {
        await api.changeMyPassword(current, password);
        toast.success('密码已修改，下次登录请使用新密码');
      } else {
        await api.resetUserPassword(target.id, password);
        toast.success(`已为 ${target.name} 重置密码`);
      }
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        className="um-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={isSelf ? '修改我的密码' : '重置密码'}
      >
        <div className="um-dialog-head">
          <span className="um-dialog-icon" aria-hidden>
            <Icon name="lock" size={17} />
          </span>
          <div>
            <div className="um-dialog-title">{isSelf ? '修改我的密码' : '重置密码'}</div>
            <div className="um-dialog-sub">
              {isSelf
                ? `为当前登录账号 ${target.name}（${target.id}）设置新密码`
                : `为 ${target.name}（${target.id}）设置新密码`}
            </div>
          </div>
          <button className="ghost icon-btn um-close" onClick={onClose} title="关闭" aria-label="关闭">
            <Icon name="x" size={15} />
          </button>
        </div>

        <form className="um-form" onSubmit={handleSubmit} noValidate>
          {error && (
            <div className="error-msg um-error" role="alert">
              <Icon name="alert-triangle" size={14} /> {error}
            </div>
          )}
          {isSelf && (
            <label className="um-field">
              <span className="um-label">当前密码</span>
              <span className="um-input-wrap">
                <Icon name="lock" size={14} className="um-input-icon" />
                <input
                  type={show ? 'text' : 'password'}
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  placeholder="请输入当前密码"
                  autoComplete="current-password"
                  autoFocus
                  disabled={saving}
                />
              </span>
            </label>
          )}
          <label className="um-field">
            <span className="um-label">新密码</span>
            <span className="um-input-wrap">
              <Icon name="lock" size={14} className="um-input-icon" />
              <input
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 6 位"
                autoComplete="new-password"
                autoFocus={!isSelf}
                disabled={saving}
              />
              <button
                type="button"
                className="um-eye"
                tabIndex={-1}
                onClick={() => setShow((v) => !v)}
                aria-label={show ? '隐藏密码' : '显示密码'}
              >
                <Icon name={show ? 'eye-off' : 'eye'} size={14} />
              </button>
            </span>
          </label>
          <label className="um-field">
            <span className="um-label">确认新密码</span>
            <span className="um-input-wrap">
              <Icon name="lock" size={14} className="um-input-icon" />
              <input
                type={show ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="再次输入新密码"
                autoComplete="new-password"
                disabled={saving}
              />
            </span>
          </label>

          <div className="um-actions">
            <button type="button" className="ghost um-btn" onClick={onClose} disabled={saving}>
              取消
            </button>
            <button type="submit" className="um-btn primary" disabled={saving}>
              {saving ? (
                <>
                  <span className="spinner" /> 提交中...
                </>
              ) : isSelf ? (
                '保存新密码'
              ) : (
                '确认重置'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NewUserDialog({
  tables,
  onClose,
}: {
  tables: TableOption[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'admin' | 'user'>('user');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [perms, setPerms] = useState<PermMap>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const cleanId = id.trim();
    const cleanName = name.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{1,31}$/.test(cleanId)) {
      setError('账号只能用字母、数字、下划线、点、横线，2–32 位，并以字母或数字开头');
      return;
    }
    if (!cleanName) {
      setError('请填写姓名');
      return;
    }
    if (password.length < 6) {
      setError('密码至少 6 位');
      return;
    }
    if (password !== confirm) {
      setError('两次输入的密码不一致');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.createUser({
        id: cleanId,
        name: cleanName,
        role,
        password,
        tablePermissions: role === 'user' ? perms : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(
        role === 'user'
          ? `已创建录入员 ${cleanName}（${cleanId}），权限已保存`
          : `已创建管理员 ${cleanName}（${cleanId}）`,
      );
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="um-dialog wide" role="dialog" aria-modal="true" aria-label="新增用户">
        <div className="um-dialog-head">
          <span className="um-dialog-icon" aria-hidden>
            <Icon name="users" size={17} />
          </span>
          <div>
            <div className="um-dialog-title">新增用户</div>
            <div className="um-dialog-sub">创建后立即生效，对方用这个账号和密码登录。</div>
          </div>
          <button className="ghost icon-btn um-close" onClick={onClose} title="关闭" aria-label="关闭">
            <Icon name="x" size={15} />
          </button>
        </div>

        <form className="um-form" onSubmit={handleSubmit} noValidate>
          {error && (
            <div className="error-msg um-error" role="alert">
              <Icon name="alert-triangle" size={14} /> {error}
            </div>
          )}

          <div className="um-grid2">
            <label className="um-field">
              <span className="um-label">账号（登录用）</span>
              <span className="um-input-wrap">
                <Icon name="user" size={14} className="um-input-icon" />
                <input
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  placeholder="例如 u_zhang"
                  autoComplete="off"
                  autoFocus
                  disabled={saving}
                />
              </span>
            </label>
            <label className="um-field">
              <span className="um-label">姓名</span>
              <span className="um-input-wrap">
                <Icon name="user" size={14} className="um-input-icon" />
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如 张三"
                  autoComplete="off"
                  disabled={saving}
                />
              </span>
            </label>
          </div>

          <label className="um-field">
            <span className="um-label">角色</span>
            <div className="um-seg role">
              {(['user', 'admin'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`um-seg-btn ${role === r ? 'on' : ''}`}
                  aria-pressed={role === r}
                  onClick={() => setRole(r)}
                  disabled={saving}
                >
                  {r === 'user' ? '录入员' : '管理员'}
                </button>
              ))}
            </div>
            <span className="um-hint">
              {role === 'admin'
                ? '管理员拥有全部表格的查看/编辑权限，也可以管理用户。'
                : '录入员只能看到下面勾选的表格。'}
            </span>
          </label>

          <div className="um-grid2">
            <label className="um-field">
              <span className="um-label">初始密码</span>
              <span className="um-input-wrap">
                <Icon name="lock" size={14} className="um-input-icon" />
                <input
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="至少 6 位"
                  autoComplete="new-password"
                  disabled={saving}
                />
                <button
                  type="button"
                  className="um-eye"
                  tabIndex={-1}
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? '隐藏密码' : '显示密码'}
                >
                  <Icon name={show ? 'eye-off' : 'eye'} size={14} />
                </button>
              </span>
            </label>
            <label className="um-field">
              <span className="um-label">确认密码</span>
              <span className="um-input-wrap">
                <Icon name="lock" size={14} className="um-input-icon" />
                <input
                  type={show ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="再次输入"
                  autoComplete="new-password"
                  disabled={saving}
                />
              </span>
            </label>
          </div>

          {role === 'user' && (
            <TablePermissionEditor
              tables={tables}
              value={perms}
              onChange={setPerms}
              disabled={saving}
            />
          )}

          <div className="um-actions">
            <button type="button" className="ghost um-btn" onClick={onClose} disabled={saving}>
              取消
            </button>
            <button type="submit" className="um-btn primary" disabled={saving}>
              {saving ? (
                <>
                  <span className="spinner" /> 创建中...
                </>
              ) : (
                '创建用户'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PermissionsDialog({
  target,
  tables,
  onClose,
}: {
  target: User;
  tables: TableOption[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState<PermMap>(() => initialPermissions(target, tables));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const legacy = !target.tablePermissions;

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.setUserTables(target.id, value);
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(`已保存 ${target.name} 的表格权限`);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="um-dialog wide" role="dialog" aria-modal="true" aria-label="表格权限">
        <div className="um-dialog-head">
          <span className="um-dialog-icon" aria-hidden>
            <Icon name="settings" size={17} />
          </span>
          <div>
            <div className="um-dialog-title">表格权限</div>
            <div className="um-dialog-sub">
              {target.name}（{target.id}）· 保存后立即生效，对方刷新页面即可
            </div>
          </div>
          <button className="ghost icon-btn um-close" onClick={onClose} title="关闭" aria-label="关闭">
            <Icon name="x" size={15} />
          </button>
        </div>

        <div className="um-form">
          {error && (
            <div className="error-msg um-error" role="alert">
              <Icon name="alert-triangle" size={14} /> {error}
            </div>
          )}
          {legacy && (
            <div className="um-note">
              <Icon name="info" size={14} />
              这是升级前创建的账号，目前默认拥有全部表格权限。保存一次后会改成下面勾选的明确权限。
            </div>
          )}
          <TablePermissionEditor
            tables={tables}
            value={value}
            onChange={setValue}
            disabled={saving}
          />
          <div className="um-actions">
            <button type="button" className="ghost um-btn" onClick={onClose} disabled={saving}>
              取消
            </button>
            <button type="button" className="um-btn primary" onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <span className="spinner" /> 保存中...
                </>
              ) : (
                '保存权限'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function UsersPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.listUsers(),
  });
  const tablesQ = useQuery({ queryKey: ['tables'], queryFn: () => api.listTables() });
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<{ mode: DialogMode; target: User } | null>(null);
  const [creating, setCreating] = useState(false);
  const [permTarget, setPermTarget] = useState<User | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const users = data ?? [];
  const me = useAuthStore((s) => s.user);
  const tables: TableOption[] = useMemo(
    () => (tablesQ.data?.tables ?? []).map((t) => ({ id: t.id, name: t.name })),
    [tablesQ.data],
  );

  function openPassword(u: User) {
    if (me?.id === u.id) {
      setDialog({ mode: 'self', target: u });
      return;
    }
    if (u.role === 'admin') {
      // 别人不能重置管理员的密码：明确说出来，而不是让按钮灰着点不动。
      toast.info(
        `管理员账号（${u.name}）的密码不能由别人重置。请让该账号自己登录后在「用户管理」里点「修改我的密码」，或在服务器上运行「设置密码.bat」。`,
        7000,
      );
      return;
    }
    setDialog({ mode: 'reset', target: u });
  }

  async function handleDelete(u: User) {
    const ok = await confirmDialog({
      title: `删除账号「${u.name}」？`,
      body: (
        <>
          账号 <span className="mono">{u.id}</span> 将无法再登录，该操作不可撤销。
          他填写的历史记录和审计日志会保留。
        </>
      ),
      confirmText: '删除账号',
      danger: true,
    });
    if (!ok) return;
    setDeleting(u.id);
    try {
      await api.deleteUser(u.id);
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(`已删除账号 ${u.name}（${u.id}）`);
    } catch (err) {
      toast.error((err as Error).message, 8000);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div>
      <div className="page-header page-header-row">
        <div>
          <h2>
            <Icon name="users" size={20} style={{ color: 'var(--primary-600)' }} />
            用户管理
          </h2>
          <div className="subtitle">
            新增/删除账号，并按表格分配「只读」或「可编辑」权限。自己的密码可以随时修改（需要当前密码）；管理员之间不能互相重置密码。
          </div>
        </div>
        <button className="primary" onClick={() => setCreating(true)} data-testid="new-user-button">
          <Icon name="plus" size={15} strokeWidth={2.5} /> 新增用户
        </button>
      </div>

      {isLoading && (
        <div className="um-list">
          {Array.from({ length: 3 }).map((_, i) => (
            <div className="um-row" key={i} style={{ ['--i' as string]: i }}>
              <div className="skeleton" style={{ width: 36, height: 36, borderRadius: '50%' }} />
              <div className="skeleton" style={{ width: 220, height: 14 }} />
              <div className="skeleton" style={{ width: 70, height: 22, marginLeft: 'auto' }} />
            </div>
          ))}
        </div>
      )}

      {isError && (
        <div className="error-msg" role="alert" style={{ marginBottom: 12 }}>
          <Icon name="alert-triangle" size={14} /> 读取用户列表失败：{(error as Error).message}
          <button
            className="ghost um-btn"
            style={{ marginLeft: 10 }}
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            {isFetching ? '重试中...' : '重试'}
          </button>
        </div>
      )}

      {!isLoading && !isError && (
        <div className="um-list">
          {users.map((u, i) => {
            const isAdmin = u.role === 'admin';
            const isSelf = me?.id === u.id;
            return (
              <div className="um-row" key={u.id} style={{ ['--i' as string]: i }}>
                <span className={`um-avatar ${u.role}`} aria-hidden>
                  {u.name.slice(0, 1)}
                </span>
                <span className="um-info">
                  <span className="um-name">
                    {u.name}
                    {isSelf && <span className="um-self">（当前账号）</span>}
                  </span>
                  <span className="um-meta">
                    {u.id}
                    <span className={`um-role ${u.role}`}>{ROLE_LABEL[u.role] ?? u.role}</span>
                    <span className={`um-pwd ${u.hasPassword === false ? 'unset' : 'set'}`}>
                      {u.hasPassword === false ? '未设置密码' : '密码已设置'}
                    </span>
                    <span className="um-tables" title="表格权限">
                      {summarizePermissions(u, tables)}
                    </span>
                  </span>
                </span>
                <span className="um-row-actions">
                  {!isAdmin && (
                    <button
                      className="um-reset"
                      title="配置这个账号能看/能改哪些表格"
                      onClick={() => setPermTarget(u)}
                    >
                      <Icon name="settings" size={14} /> 权限
                    </button>
                  )}
                  <button
                    className="um-reset"
                    title={
                      isSelf
                        ? '修改我自己的登录密码'
                        : isAdmin
                          ? '管理员账号不能由别人重置'
                          : '重置该账号密码'
                    }
                    onClick={() => openPassword(u)}
                  >
                    <Icon name="lock" size={14} />
                    {isSelf
                      ? '修改我的密码'
                      : u.hasPassword === false
                        ? '设置密码'
                        : '重置密码'}
                  </button>
                  {!isSelf && (
                    <button
                      className="um-reset danger"
                      title="删除该账号"
                      onClick={() => void handleDelete(u)}
                      disabled={deleting === u.id}
                    >
                      <Icon name="trash" size={14} />
                      {deleting === u.id ? '删除中...' : '删除'}
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {dialog && (
        <PasswordDialog
          mode={dialog.mode}
          target={dialog.target}
          onClose={() => setDialog(null)}
        />
      )}

      {creating && <NewUserDialog tables={tables} onClose={() => setCreating(false)} />}

      {permTarget && (
        <PermissionsDialog
          target={permTarget}
          tables={tables}
          onClose={() => setPermTarget(null)}
        />
      )}
    </div>
  );
}
