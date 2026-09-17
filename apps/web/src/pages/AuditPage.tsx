import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

const ACTION_LABELS: Record<string, string> = {
  'table.create': '建表',
  'table.schema.update': '改 schema',
  'options.update': '改选项集',
  'row.create': '新建行',
  'row.update': '修改行',
  'row.delete': '删除行',
  'image.upload': '上传图片',
};

export function AuditPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['audit'],
    queryFn: () => api.listAudit(),
    refetchInterval: 5000,
  });

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>审计日志</h2>
      {isLoading && <div className="muted">加载中...</div>}
      <div className="audit-log">
        {(data?.entries ?? []).map((e, idx) => (
          <div key={idx} className="row">
            <span className="muted">{new Date(e.ts).toLocaleString('zh-CN')}</span>
            <span className="action">{ACTION_LABELS[e.action] ?? e.action}</span>
            <span>by {e.actor}</span>
            {e.tableId && <span> · 表 {e.tableId}</span>}
            {e.rowId && <span> · 行 {e.rowId}</span>}
            {e.details && (
              <span style={{ color: 'var(--text-muted)' }}>
                {' '}
                · {JSON.stringify(e.details)}
              </span>
            )}
          </div>
        ))}
        {!isLoading && (data?.entries?.length ?? 0) === 0 && (
          <div className="muted">还没有任何记录。</div>
        )}
      </div>
    </div>
  );
}