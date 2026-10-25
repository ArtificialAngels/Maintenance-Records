import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { Icon } from '../components/Icons';

export function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const loading = useAuthStore((s) => s.loading);
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (useAuthStore.getState().user) navigate('/tables', { replace: true });
  }, [navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    if (!userId.trim() || !password) {
      setError('请输入账号和密码');
      return;
    }
    try {
      await login(userId.trim(), password);
      navigate('/tables', { replace: true });
    } catch (err) {
      setError((err as Error).message);
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
            请使用账号登录
          </p>
        </div>

        <form className="login-form stagger" onSubmit={handleSubmit} noValidate>
          {error && (
            <div className="error-msg login-error" role="alert">
              <Icon name="alert-triangle" size={14} /> {error}
            </div>
          )}

          <label className="login-field">
            <span className="login-field-label">账号</span>
            <span className="login-input-wrap">
              <Icon name="user" size={15} className="login-input-icon" />
              <input
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="请输入账号，如 u_admin"
                autoComplete="username"
                autoFocus
                disabled={loading}
              />
            </span>
          </label>

          <label className="login-field">
            <span className="login-field-label">密码</span>
            <span className="login-input-wrap">
              <Icon name="lock" size={15} className="login-input-icon" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                autoComplete="current-password"
                disabled={loading}
              />
              <button
                type="button"
                className="login-eye"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
              >
                <Icon name={showPassword ? 'eye-off' : 'eye'} size={15} />
              </button>
            </span>
          </label>

          <button type="submit" className="login-submit" disabled={loading}>
            {loading ? (
              <>
                <span className="spinner" /> 登录中...
              </>
            ) : (
              <>
                登录 <Icon name="arrow-right" size={15} />
              </>
            )}
          </button>
        </form>

        <p className="muted footer-hint">
          首次部署默认管理员账号 u_admin / admin123，登录后请尽快修改密码。
        </p>
      </div>
    </div>
  );
}
