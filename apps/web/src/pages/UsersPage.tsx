import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Icon } from '../components/Icons';
import { toast } from '../components/Toaster';
import { useAuthStore } from '../stores/authStore';
import type { User } from '../lib/types';

const ROLE_LABEL: Record<string, string> = {
  admin: '管理员',
  user: '录入员',
};

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

export function UsersPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.listUsers(),
  });
  const [dialog, setDialog] = useState<{ mode: DialogMode; target: User } | null>(null);

  const users = data ?? [];
  const me = useAuthStore((s) => s.user);

  function openFor(u: User) {
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

  return (
    <div>
      <div className="page-header">
        <h2>
          <Icon name="users" size={20} style={{ color: 'var(--primary-600)' }} />
          用户管理
        </h2>
        <div className="subtitle">
          录入员密码忘了可以直接重置；自己的密码可以随时修改（需要当前密码）。管理员之间不能互相重置，请各自登录修改或在服务器上运行「设置密码.bat」。
        </div>
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
            const canChange = isSelf || !isAdmin;
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
                    <span
                      className={`um-pwd ${u.hasPassword === false ? 'unset' : 'set'}`}
                    >
                      {u.hasPassword === false ? '未设置密码' : '密码已设置'}
                    </span>
                  </span>
                </span>
                <button
                  className="um-reset"
                  title={
                    isSelf
                      ? '修改我自己的登录密码'
                      : canChange
                        ? '重置该账号密码'
                        : '管理员账号不能由别人重置'
                  }
                  onClick={() => openFor(u)}
                >
                  <Icon name="lock" size={14} />
                  {isSelf
                    ? '修改我的密码'
                    : u.hasPassword === false
                      ? '设置密码'
                      : '重置密码'}
                </button>
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
    </div>
  );
}
