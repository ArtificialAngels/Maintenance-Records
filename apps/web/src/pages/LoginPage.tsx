import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import type { User } from '../lib/types';

const ROLE_LABEL: Record<string, string> = {
  admin: '管理员',
  user: '录入员',
};

const ROLE_COLOR: Record<string, string> = {
  admin: 'linear-gradient(135deg, #fef3c7 0%, #fbbf24 100%)',
  user: 'linear-gradient(135deg, #d1fae5 0%, #10b981 100%)',
};

export function LoginPage() {
  const navigate = useNavigate();
  const loginAs = useAuthStore((s) => s.loginAs);
  const [error, setError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.listUsers(),
  });

  useEffect(() => {
    if (useAuthStore.getState().user) navigate('/tables', { replace: true });
  }, [navigate]);

  async function pick(u: User) {
    setError(null);
    setLoadingId(u.id);
    try {
      await loginAs(u.id);
      navigate('/tables', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="center-card">
      <h2>维修记录 Demo</h2>
      <p className="muted">选择一个身份进入 — 演示阶段免密码</p>
      {error && <div className="error-msg">{error}</div>}
      {isLoading && (
        <div className="muted" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="spinner" /> 加载用户列表...
        </div>
      )}
      {users && (
        <div className="user-picker stagger">
          {users.map((u) => (
            <button
              key={u.id}
              onClick={() => pick(u)}
              disabled={loadingId !== null}
              data-testid={`login-${u.id}`}
              style={loadingId === u.id ? { borderColor: 'var(--primary)' } : undefined}
            >
              <span
                aria-hidden
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: ROLE_COLOR[u.role] ?? 'var(--bg-2)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  fontWeight: 600,
                  color: u.role === 'admin' ? '#92400e' : '#065f46',
                  flexShrink: 0,
                }}
              >
                {u.name.slice(0, 1)}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
                <span style={{ fontWeight: 500 }}>{u.name}</span>
                <span className="role">{ROLE_LABEL[u.role]}</span>
              </span>
              {loadingId === u.id && (
                <span className="spinner" style={{ marginLeft: 'auto' }} />
              )}
            </button>
          ))}
        </div>
      )}
      <p className="muted footer-hint">
        Tip: 同时打开两个浏览器窗口(或一个普通窗口 + 一个无痕窗口),选不同身份,可演示实时同步。
      </p>
    </div>
  );
}