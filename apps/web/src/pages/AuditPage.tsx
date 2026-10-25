import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Icon } from '../components/Icons';

const ACTION_LABELS: Record<string, string> = {
  'table.create': '建表',
  'table.schema.update': '改 schema',
  'options.update': '改选项集',
  'row.create': '新建行',
  'row.import': '导入行',
  'row.update': '修改行',
  'row.delete': '删除行',
  'image.upload': '上传图片',
  'user.password.reset': '重置密码',
};

export function AuditPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['audit'],
    queryFn: () => api.listAudit(),
    refetchInterval: 5000,
  });

  const entries = data?.entries ?? [];

  return (
    <div>
      <div className="page-header">
        <h2>
          <Icon name="history" size={20} style={{ color: 'var(--primary-600)' }} />
          审计日志
        </h2>
        <div className="subtitle">记录所有数据变更操作，每 5 秒自动刷新。</div>
      </div>

      {isLoading && (
        <div className="audit-log">
          {Array.from({ length: 6 }).map((_, i) => (
            <div className="skeleton-row" key={i}>
              <div className="skeleton" style={{ width: 140, height: 12 }} />
              <div className="skeleton" style={{ width: 70, height: 16, borderRadius: 999 }} />
              <div className="skeleton" style={{ width: 220, height: 12 }} />
            </div>
          ))}
        </div>
      )}

      {!isLoading && (
        <div className="audit-log">
          {entries.map((e, idx) => (
            <div key={idx} className="row" style={{ ['--i' as string]: idx }}>
              <span className="muted mono" style={{ fontSize: 11.5 }}>
                {new Date(e.ts).toLocaleString('zh-CN')}
              </span>
              <span className="action">{ACTION_LABELS[e.action] ?? e.action}</span>
              <span>
                by <b>{e.actor}</b>
              </span>
              {e.tableId && <span className="muted">· 表 {e.tableId}</span>}
              {e.rowId && <span className="muted mono">· 行 {e.rowId.slice(-6)}</span>}
              {e.details && Object.keys(e.details).length > 0 && (
                <span className="muted" style={{ fontSize: 11.5 }}>
                  · {JSON.stringify(e.details)}
                </span>
              )}
            </div>
          ))}
          {entries.length === 0 && (
            <div className="empty-state" style={{ border: 'none' }}>
              <span className="empty-icon"><Icon name="history" size={24} /></span>
              <span className="empty-title">还没有任何记录</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
