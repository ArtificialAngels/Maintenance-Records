import { useState, type CSSProperties, type ReactNode } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { LoginPage } from './pages/LoginPage';
import { TablesListPage } from './pages/TablesListPage';
import { TablePage } from './pages/TablePage';
import { SchemaEditorPage } from './pages/SchemaEditorPage';
import { OptionsPage } from './pages/OptionsPage';
import { AuditPage } from './pages/AuditPage';
import { StatsPage } from './pages/StatsPage';
import { UsersPage } from './pages/UsersPage';
import { Sidebar, SIDEBAR_WIDTHS } from './components/Sidebar';

/** Admin-only route guard: non-admins (including anyone who hand-types the
 * URL) are silently redirected to the table list. The backend enforces the
 * same check on every admin API, so data is unreachable even if the UI is
 * tampered with. */
function RequireAdmin({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user || user.role !== 'admin') {
    return <Navigate to="/tables" replace />;
  }
  return <>{children}</>;
}

export function App() {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const sidebarWidth = sidebarExpanded ? SIDEBAR_WIDTHS.expanded : SIDEBAR_WIDTHS.collapsed;
  const layoutStyle = { '--sidebar-w': `${sidebarWidth}px` } as CSSProperties;

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <div className="app-with-sidebar" style={layoutStyle}>
      <Sidebar expanded={sidebarExpanded} onExpandedChange={setSidebarExpanded} />
      <main className="page" key={location.pathname}>
        <Routes>
          <Route path="/" element={<Navigate to="/tables" replace />} />
          <Route path="/tables" element={<TablesListPage />} />
          <Route path="/tables/:id" element={<TablePage />} />
          <Route path="/tables/:id/schema" element={<SchemaEditorPage />} />
          <Route path="/tables/:id/options" element={<OptionsPage />} />
          <Route path="/tables/:id/stats" element={<StatsPage />} />
          <Route
            path="/audit"
            element={
              <RequireAdmin>
                <AuditPage />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/users"
            element={
              <RequireAdmin>
                <UsersPage />
              </RequireAdmin>
            }
          />
          <Route path="*" element={<Navigate to="/tables" replace />} />
        </Routes>
      </main>
    </div>
  );
}