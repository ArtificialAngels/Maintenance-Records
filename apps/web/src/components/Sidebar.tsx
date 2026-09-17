import { useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { Icon } from './Icons';
import { toast } from './Toaster';

const COLLAPSED_WIDTH = 64;
const EXPANDED_WIDTH = 232;
/** Delay before auto-collapse on mouseleave, so a brief cursor gap (e.g. hovering
 *  a menu item that's slightly outside the aside box) doesn't snap the sidebar shut. */
const COLLAPSE_DELAY_MS = 180;

export interface SidebarProps {
  expanded: boolean;
  onExpandedChange: (next: boolean) => void;
}

export function Sidebar({ expanded, onExpandedChange }: SidebarProps) {
  const collapseTimer = useRef<number | null>(null);
  const user = useAuthStore((s) => s.user)!;
  const logout = useAuthStore((s) => s.logout);
  const location = useLocation();

  const { data } = useQuery({
    queryKey: ['tables'],
    queryFn: () => api.listTables(),
  });
  const tables = data?.tables ?? [];
  const isActive = (path: string): boolean => {
    if (path === '/tables' && location.pathname === '/tables') return true;
    return location.pathname.startsWith(path) && path !== '/tables';
  };

  function onEnter() {
    if (collapseTimer.current !== null) {
      window.clearTimeout(collapseTimer.current);
      collapseTimer.current = null;
    }
    if (!expanded) onExpandedChange(true);
  }

  function onLeave() {
    if (collapseTimer.current !== null) {
      window.clearTimeout(collapseTimer.current);
    }
    collapseTimer.current = window.setTimeout(() => {
      onExpandedChange(false);
      collapseTimer.current = null;
    }, COLLAPSE_DELAY_MS);
  }

  const width = expanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH;

  return (
    <aside
      className="sidebar"
      data-expanded={expanded ? 'true' : 'false'}
      style={{ width }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      aria-label="侧边导航"
    >
      <div className="sidebar-header">
        <div className="logo" aria-hidden>
          <Icon name="layout-grid" size={20} />
        </div>
        <div className="brand">
          <div className="brand-title">维修记录</div>
          <div className="brand-sub">Maintenance Demo</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section">总览</div>
        <Link
          to="/tables"
          className={`nav-item ${location.pathname === '/tables' ? 'active' : ''}`}
          data-testid="nav-tables"
        >
          <Icon name="layout-grid" size={16} />
          <span className="nav-label">全部表格</span>
          {tables.length > 0 && <span className="badge-soft">{tables.length}</span>}
        </Link>

        {tables.length > 0 && <div className="nav-section">表格</div>}
        {tables.map((t) => (
          <Link
            key={t.id}
            to={`/tables/${t.id}`}
            className={`nav-item table-item ${isActive(`/tables/${t.id}`) ? 'active' : ''}`}
            data-testid={`nav-table-${t.id}`}
            title={t.name}
          >
            <Icon name="columns-3" size={16} />
            <span className="nav-label">{t.name}</span>
            <span className="nav-meta">{t.columnCount}</span>
          </Link>
        ))}

        {user.role === 'admin' && (
          <>
            <div className="nav-section">管理</div>
            <Link
              to="/audit"
              className={`nav-item ${isActive('/audit') ? 'active' : ''}`}
            >
              <Icon name="history" size={16} />
              <span className="nav-label">审计日志</span>
            </Link>
          </>
        )}
      </nav>

      <div className="sidebar-footer">
        <div
          className="user-card"
          title={`${user.name} · ${user.role === 'admin' ? '管理员' : '录入员'}`}
        >
          <div className="avatar" aria-hidden>
            {user.name.slice(0, 1)}
          </div>
          <div className="user-info">
            <div className="user-name">{user.name}</div>
            <span className={`role-tag ${user.role}`}>
              {user.role === 'admin' ? '管理员' : '录入员'}
            </span>
          </div>
          <button
            className="ghost icon-btn"
            onClick={() => {
              logout();
              toast.info('已退出登录');
            }}
            title="切换用户"
          >
            <Icon name="log-out" size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}

/** Shared with the wrapper element so it can apply matching `margin-left` / spacing. */
export const SIDEBAR_WIDTHS = { collapsed: COLLAPSED_WIDTH, expanded: EXPANDED_WIDTH };