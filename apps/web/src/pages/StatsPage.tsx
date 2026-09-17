import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';

const DIM_LABELS: Record<string, string> = {
  department: '按单位',
  urgency: '按紧急程度',
  product: '按产品',
  product_type: '按类型',
  repair_content: '按报修内容',
  week_num: '按周',
  month_num: '按月',
};

interface Bucket {
  key: string;
  count: number;
  totalHours: number;
}

export function StatsPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const [highlight, setHighlight] = useState<string | null>(null);

  const tablesQ = useQuery({
    queryKey: ['tables'],
    queryFn: () => api.listTables(),
  });
  const statsQ = useQuery({
    queryKey: ['stats', id],
    queryFn: () => api.getStats(id),
    enabled: !!id,
  });

  useEffect(() => {
    if (!id && tablesQ.data?.tables?.[0]) {
      navigate(`/tables/${tablesQ.data.tables[0].id}/stats`, { replace: true });
    }
  }, [id, tablesQ.data, navigate]);

  const schemaQ = useQuery({
    queryKey: ['schema', id],
    queryFn: () => api.getTable(id).then((r) => r.schema),
    enabled: !!id,
  });

  const dimLabel = (id: string): string => {
    const col = schemaQ.data?.columns.find((c) => c.id === id);
    return DIM_LABELS[id] ?? col?.name ?? id;
  };

  if (role !== 'admin') {
    return <div className="empty-state">仅管理员可查看统计聚合。</div>;
  }

  return (
    <div>
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>统计聚合</h2>
        <span className="spacer" />
        <Link to={`/tables/${id}`}>
          <button>返回表格</button>
        </Link>
      </div>

      {/* Table picker */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {(tablesQ.data?.tables ?? []).map((t) => (
          <Link key={t.id} to={`/tables/${t.id}/stats`}>
            <button
              style={{
                background: t.id === id ? 'var(--accent)' : 'var(--bg-elevated)',
                color: t.id === id ? '#fff' : 'var(--text)',
                borderColor: t.id === id ? 'var(--accent)' : 'var(--border)',
              }}
            >
              {t.name}
            </button>
          </Link>
        ))}
      </div>

      {statsQ.isLoading && <div className="muted">加载中...</div>}
      {statsQ.data && (
        <>
          <div
            className="stagger"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
              marginBottom: 24,
            }}
          >
            <SummaryCard label="总行数" value={statsQ.data.totalRows} />
            <SummaryCard label="总工时" value={statsQ.data.totalHours.toFixed(1)} unit="小时" />
            <SummaryCard
              label="维度数"
              value={statsQ.data.aggregations.length}
              unit="个"
            />
          </div>

          <div
            className="stagger"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
              gap: 16,
            }}
          >
            {statsQ.data.aggregations.map((agg) => (
              <div
                key={agg.groupBy}
                className="grid-wrap"
                style={{ padding: 0 }}
              >
                <div
                  style={{
                    padding: '12px 18px',
                    borderBottom: '1px solid var(--border)',
                    fontWeight: 600,
                    fontSize: 13,
                    background: 'linear-gradient(180deg, #fafafa 0%, #f5f5f5 100%)',
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span style={{ color: 'var(--text)' }}>{dimLabel(agg.groupBy)}</span>
                  <span className="muted" style={{ fontWeight: 400 }}>
                    ({agg.buckets.length} 个分组)
                  </span>
                </div>
                <div style={{ padding: 12 }}>
                  <BarList
                    buckets={agg.buckets}
                    highlight={highlight}
                    onHover={setHighlight}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="summary-card">
      <div className="label">{label}</div>
      <div className="value">
        {value}
        {unit && <span style={{ fontSize: 14, color: 'var(--text-muted)', marginLeft: 6, fontWeight: 500 }}>{unit}</span>}
      </div>
    </div>
  );
}

function BarList({
  buckets,
  highlight,
  onHover,
}: {
  buckets: Bucket[];
  highlight: string | null;
  onHover: (key: string | null) => void;
}) {
  if (buckets.length === 0) {
    return <div className="muted" style={{ padding: 12 }}>暂无数据</div>;
  }
  const max = Math.max(...buckets.map((b) => b.count), 1);
  return (
    <div className="bar-list">
      {buckets.slice(0, 15).map((b) => (
        <div
          key={b.key}
          className="bar-row"
          onMouseEnter={() => onHover(b.key)}
          onMouseLeave={() => onHover(null)}
          style={{
            background: highlight === b.key ? 'var(--primary-50)' : 'transparent',
          }}
        >
          <span className="label-cell">{b.key}</span>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{ width: `${(b.count / max) * 100}%` }}
            />
          </div>
          <span className="count">
            {b.count} 次 · {b.totalHours.toFixed(1)}h
          </span>
        </div>
      ))}
      {buckets.length > 15 && (
        <div className="muted" style={{ textAlign: 'center', padding: 4 }}>
          … +{buckets.length - 15} 个
        </div>
      )}
    </div>
  );
}