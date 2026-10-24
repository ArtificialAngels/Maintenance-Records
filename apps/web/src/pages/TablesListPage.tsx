import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Icon } from '../components/Icons';

export function TablesListPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['tables'],
    queryFn: () => api.listTables(),
  });

  const tables = data?.tables ?? [];

  return (
    <div>
      <div className="page-header">
        <h2>表格</h2>
        <div className="subtitle">
          选择一张表开始填报{!isLoading && tables.length > 0 ? `，共 ${tables.length} 张表。` : '。'}
        </div>
      </div>
      {isLoading && (
        <div className="card-grid">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton skeleton-card" />
          ))}
        </div>
      )}
      <div className="card-grid stagger">
        {tables.map((t) => (
          <Link
            key={t.id}
            to={`/tables/${t.id}`}
            className="table-card"
            data-testid={`table-card-${t.id}`}
          >
            <div className="title">
              <span className="card-icon">
                <Icon name="columns-3" size={18} />
              </span>
              {t.name}
            </div>
            <div className="meta">
              <span className="mono">{t.id}</span>
              <span className="badge-soft">v{t.schemaVersion}</span>
              <span>{t.columnCount} 列</span>
              <span className="go-arrow">
                <Icon name="arrow-right" size={14} />
              </span>
            </div>
          </Link>
        ))}
        {!isLoading && tables.length === 0 && (
          <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
            <span className="empty-icon"><Icon name="inbox" size={24} /></span>
            <span className="empty-title">还没有任何表</span>
            <span>
              请运行 <code>pnpm seed</code> 创建默认表。
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
