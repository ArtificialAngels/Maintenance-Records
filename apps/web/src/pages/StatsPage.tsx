import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { Icon, type IconName } from '../components/Icons';

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

/** Animated number that eases from 0 to the target value. */
function useCountUp(target: number, duration = 700): number {
  const [value, setValue] = useState(0);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    const prefersReduced =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (prefersReduced) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const from = 0;
    function tick(now: number) {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(from + (target - from) * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    }
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, [target, duration]);
  return value;
}

function StatNumber({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const v = useCountUp(value);
  return <>{v.toFixed(decimals)}</>;
}

export function StatsPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);

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

  const dimLabel = (dimId: string): string => {
    const col = schemaQ.data?.columns.find((c) => c.id === dimId);
    return DIM_LABELS[dimId] ?? col?.name ?? dimId;
  };

  if (role !== 'admin') {
    return (
      <div className="empty-state">
        <span className="empty-icon"><Icon name="alert-triangle" size={24} /></span>
        <span className="empty-title">仅管理员可查看统计聚合</span>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>
          <Icon name="bar-chart-3" size={20} style={{ color: 'var(--primary-600)' }} />
          统计聚合
        </h2>
        <div className="subtitle">按维度统计报修次数与工时分布。</div>
      </div>

      <div className="toolbar" style={{ marginTop: -4 }}>
        <div className="seg-tabs">
          {(tablesQ.data?.tables ?? []).map((t) => (
            <Link key={t.id} to={`/tables/${t.id}/stats`}>
              <button className={t.id === id ? 'active' : ''}>{t.name}</button>
            </Link>
          ))}
        </div>
        <span className="spacer" />
        <Link to={`/tables/${id}`}>
          <button className="ghost"><Icon name="chevron-left" size={14} /> 返回表格</button>
        </Link>
      </div>

      {statsQ.isLoading && (
        <div className="card-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 96, borderRadius: 12 }} />
          ))}
        </div>
      )}
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
            <SummaryCard label="总行数" icon="layers" value={<StatNumber value={statsQ.data.totalRows} />} />
            <SummaryCard label="总工时" icon="clock" value={<StatNumber value={statsQ.data.totalHours} decimals={1} />} unit="小时" />
            <SummaryCard label="维度数" icon="sliders" value={<StatNumber value={statsQ.data.aggregations.length} />} unit="个" />
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
              <div key={agg.groupBy} className="panel">
                <div className="panel-head">
                  <Icon name="bar-chart-3" size={15} style={{ color: 'var(--primary-600)' }} />
                  <span>{dimLabel(agg.groupBy)}</span>
                  <span className="muted" style={{ fontWeight: 400, fontSize: 11.5 }}>
                    ({agg.buckets.length} 个分组)
                  </span>
                </div>
                <div className="panel-body">
                  <BarList buckets={agg.buckets} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  unit,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  icon: IconName;
}) {
  return (
    <div className="summary-card">
      <div className="label">
        <span className="sum-icon">
          <Icon name={icon} size={14} />
        </span>
        {label}
      </div>
      <div className="value">
        {value}
        {unit && <span>{unit}</span>}
      </div>
    </div>
  );
}

function BarList({ buckets }: { buckets: Bucket[] }) {
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  if (buckets.length === 0) {
    return (
      <div className="empty-state" style={{ borderStyle: 'solid', borderColor: 'transparent', padding: '24px 12px' }}>
        <span className="empty-icon"><Icon name="inbox" size={20} /></span>
        暂无数据
      </div>
    );
  }
  const max = Math.max(...buckets.map((b) => b.count), 1);
  return (
    <div className="bar-list">
      {buckets.slice(0, 15).map((b, i) => (
        <div
          key={b.key}
          className="bar-row"
          onMouseEnter={() => setHoverKey(b.key)}
          onMouseLeave={() => setHoverKey(null)}
          style={{ background: hoverKey === b.key ? 'var(--primary-50)' : 'transparent' }}
        >
          <span className="label-cell" title={b.key}>{b.key}</span>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{ width: `${(b.count / max) * 100}%`, animationDelay: `${i * 45}ms` }}
            />
          </div>
          <span className="count">
            {b.count} 次 · {b.totalHours.toFixed(1)}h
          </span>
        </div>
      ))}
      {buckets.length > 15 && (
        <div className="muted" style={{ textAlign: 'center', padding: 4, fontSize: 11.5 }}>
          … +{buckets.length - 15} 个
        </div>
      )}
    </div>
  );
}
