import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export function TablesListPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['tables'],
    queryFn: () => api.listTables(),
  });

  return (
    <div>
      <div className="page-header">
        <h2>表格</h2>
        <div className="subtitle">
          选择一张表开始填报。共 {(data?.tables ?? []).length} 张表。
        </div>
      </div>
      {isLoading && <div className="muted">加载中...</div>}
      <div className="card-grid stagger">
        {(data?.tables ?? []).map((t) => (
          <Link
            key={t.id}
            to={`/tables/${t.id}`}
            className="table-card"
            data-testid={`table-card-${t.id}`}
          >
            <div className="title">{t.name}</div>
            <div className="meta">
              <span>{t.id}</span>
              <span className="badge-soft">v{t.schemaVersion}</span>
              <span>·</span>
              <span>{t.columnCount} 列</span>
            </div>
          </Link>
        ))}
        {!isLoading && (data?.tables ?? []).length === 0 && (
          <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
            还没有任何表。请运行 <code>pnpm seed</code> 创建默认表。
          </div>
        )}
      </div>
    </div>
  );
}