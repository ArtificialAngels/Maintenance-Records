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

function ResetDialog({
  target,
  onClose,
}: {
  target: User;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
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
      await api.resetUserPassword(target.id, password);
      toast.success(`已为 ${target.name} 重置密码`);
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
      <div className="um-dialog" role="dialog" aria-modal="true" aria-label="重置密码">
        <div className="um-dialog-head">
          <span className="um-dialog-icon" aria-hidden>
            <Icon name="lock" size={17} />
          </span>
          <div>
            <div className="um-dialog-title">重置密码</div>
            <div className="um-dialog-sub">
              为 {target.name}（{target.id}）设置新密码
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
                autoFocus
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
  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.listUsers(),
  });
  const [resetTarget, setResetTarget] = useState<User | null>(null);

  const users = data ?? [];
  const me = useAuthStore((s) => s.user);

  return (
    <div>
      <div className="page-header">
        <h2>
          <Icon name="users" size={20} style={{ color: 'var(--primary-600)' }} />
          用户管理
        </h2>
        <div className="subtitle">
          为非管理员账号设置或重置密码。管理员账号密码请在服务器上运行「设置密码.bat」修改。
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

      {!isLoading && (
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
                    <span className={`um-role ${u.role}`}>{ROLE_LABEL[u.role]}</span>
                    <span
                      className={`um-pwd ${u.hasPassword === false ? 'unset' : 'set'}`}
                    >
                      {u.hasPassword === false ? '未设置密码' : '密码已设置'}
                    </span>
                  </span>
                </span>
                <button
                  className="um-reset"
                  disabled={isAdmin}
                  title={isAdmin ? '管理员账号请在服务器修改' : '重置该账号密码'}
                  onClick={() => setResetTarget(u)}
                >
                  <Icon name="lock" size={14} />
                  {u.hasPassword === false ? '设置密码' : '重置密码'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {resetTarget && (
        <ResetDialog target={resetTarget} onClose={() => setResetTarget(null)} />
      )}
    </div>
  );
}
