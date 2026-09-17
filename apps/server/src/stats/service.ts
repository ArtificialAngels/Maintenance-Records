import { loadSchema } from '../tables/service.js';
import { loadRows, recomputeFormulas } from '../rows/service.js';
import type { Column, Row } from '../types.js';

export interface Aggregation {
  groupBy: string;
  buckets: { key: string; count: number; totalHours: number }[];
}

export interface StatsResult {
  tableId: string;
  totalRows: number;
  totalHours: number;
  aggregations: Aggregation[];
}

function totalHoursOfRow(row: Row, hourColumns: string[]): number {
  let sum = 0;
  for (const col of hourColumns) {
    const v = row.values[col];
    if (typeof v === 'number' && Number.isFinite(v)) sum += v;
  }
  return sum;
}

function isHourColumn(col: Column): boolean {
  return col.type === 'number' && /^hours_/.test(col.id);
}

export async function computeStats(tableId: string): Promise<StatsResult> {
  const schema = await loadSchema(tableId);
  if (!schema) throw new Error('表不存在');

  const hourColumns = schema.columns.filter(isHourColumn).map((c) => c.id);
  const data = await loadRows(tableId);
  // Recompute formulas so aggregations see fresh derived values (week/month/etc).
  const rows = data.rows.map((r) => ({
    ...r,
    values: recomputeFormulas(schema, r.values),
  }));

  const totalHours = rows.reduce((sum, r) => sum + totalHoursOfRow(r, hourColumns), 0);

  // Build aggregations for the canonical dimensions.
  const dimensions = [
    { id: 'department', label: 'department' },
    { id: 'urgency', label: 'urgency' },
    { id: 'product', label: 'product' },
    { id: 'product_type', label: 'product_type' },
    { id: 'repair_content', label: 'repair_content' },
    { id: 'week_num', label: 'week_num' },
    { id: 'month_num', label: 'month_num' },
  ];

  const aggregations: Aggregation[] = [];
  for (const dim of dimensions) {
    const colExists = schema.columns.some((c) => c.id === dim.id);
    if (!colExists) continue;
    const buckets = new Map<string, { count: number; totalHours: number }>();
    for (const r of rows) {
      const raw = r.values[dim.id];
      const key = raw == null || raw === '' ? '(未填)' : String(raw);
      const hours = totalHoursOfRow(r, hourColumns);
      const cur = buckets.get(key) ?? { count: 0, totalHours: 0 };
      cur.count += 1;
      cur.totalHours += hours;
      buckets.set(key, cur);
    }
    aggregations.push({
      groupBy: dim.id,
      buckets: [...buckets.entries()]
        .map(([key, v]) => ({ key, count: v.count, totalHours: v.totalHours }))
        .sort((a, b) => b.count - a.count),
    });
  }

  return {
    tableId,
    totalRows: rows.length,
    totalHours,
    aggregations,
  };
}