import { useState, type CSSProperties } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { LoginPage } from './pages/LoginPage';
import { TablesListPage } from './pages/TablesListPage';
import { TablePage } from './pages/TablePage';
import { SchemaEditorPage } from './pages/SchemaEditorPage';
import { OptionsPage } from './pages/OptionsPage';
import { AuditPage } from './pages/AuditPage';
import { StatsPage } from './pages/StatsPage';
import { Sidebar, SIDEBAR_WIDTHS } from './components/Sidebar';

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
          <Route path="/audit" element={<AuditPage />} />
          <Route path="*" element={<Navigate to="/tables" replace />} />
        </Routes>
      </main>
    </div>
  );
}