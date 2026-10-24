import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import type { User } from '../lib/types';
import { Icon } from '../components/Icons';

const ROLE_LABEL: Record<string, string> = {
  admin: '管理员',
  user: '录入员',
};

const ROLE_GRADIENT: Record<string, string> = {
  admin: 'linear-gradient(135deg, #fde68a 0%, #f59e0b 100%)',
  user: 'linear-gradient(135deg, #6ee7b7 0%, #059669 100%)',
};

const ROLE_TEXT: Record<string, string> = {
  admin: '#92400e',
  user: '#065f46',
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
    <div className="login-screen">
      <span className="bg-orb o1" aria-hidden />
      <span className="bg-orb o2" aria-hidden />
      <span className="bg-orb o3" aria-hidden />

      <div className="center-card">
        <div className="login-brand">
          <div className="logo-lg" aria-hidden>
            <Icon name="layout-grid" size={28} />
          </div>
          <h2>维修记录系统</h2>
          <p className="muted" style={{ margin: '2px 0 0' }}>
            选择一个身份进入 · 演示阶段免密码
          </p>
        </div>

        {error && <div className="error-msg"><Icon name="alert-triangle" size={14} /> {error}</div>}
        {isLoading && (
          <div className="loading-inline" style={{ justifyContent: 'center', padding: '18px 0' }}>
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
              >
                <span
                  aria-hidden
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: '50%',
                    background: ROLE_GRADIENT[u.role] ?? 'var(--bg-2)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    fontWeight: 700,
                    color: ROLE_TEXT[u.role] ?? '#334155',
                    flexShrink: 0,
                  }}
                >
                  {u.name.slice(0, 1)}
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
                  <span style={{ fontWeight: 600, fontSize: 13.5 }}>{u.name}</span>
                  <span className="role">{ROLE_LABEL[u.role]}</span>
                </span>
                <span style={{ marginLeft: 'auto', display: 'inline-flex' }}>
                  {loadingId === u.id ? (
                    <span className="spinner" />
                  ) : (
                    <Icon name="chevron-right" size={16} style={{ color: 'var(--text-muted)' }} />
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
        <p className="muted footer-hint">
          同时打开两个浏览器窗口（或一个普通窗口 + 一个无痕窗口），选择不同身份，可演示多人实时同步。
        </p>
      </div>
    </div>
  );
}
