import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { getSocket, resetSocket } from '../lib/socket';
import { useAuthStore } from '../stores/authStore';
import type {
  CellValue,
  Column,
  ImageAssetRef,
  Row,
  TableSchema,
} from '../lib/types';
import {
  getPrefs,
  reconcile,
  setSort,
  setColumnWidth,
  toggleColumnHidden,
} from '../stores/viewStore';
import { CellEditor } from '../components/CellEditor';
import { ImagePreview } from '../components/ImagePreview';
import { toast } from '../components/Toaster';
import { ResizeHandle, useColumnResize } from '../components/ResizableHeader';

function canEditColumn(col: Column, role: 'admin' | 'user'): boolean {
  if (col.type === 'formula') return false;
  if (role === 'admin') return true;
  return col.visible && col.editableByRoles.includes(role);
}

const TYPE_LABEL: Record<string, string> = {
  text: '文本',
  number: '数字',
  option: '选项',
  date: '日期',
  image: '图片',
  formula: '公式',
  longtext: '长文本',
};

export function TablePage() {
  const { id = '' } = useParams<{ id: string }>();
  const user = useAuthStore((s) => s.user)!;
  const qc = useQueryClient();
  const [sortBy, setSortBy] = useState<{ col: string; dir: 'asc' | 'desc' } | undefined>();
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; colId: string; colName: string } | null>(null);
  // Bumped after any prefs write so the `prefs` memo below re-reads localStorage.
  // Without this, the memo's columnWidths map is stale until the page reloads.
  const [prefsTick, setPrefsTick] = useState(0);

  const prefs = useMemo(() => getPrefs(id), [id, prefsTick]);

  const schemaQ = useQuery({
    queryKey: ['schema', id],
    queryFn: () => api.getTable(id).then((r) => r.schema),
  });
  const rowsQ = useQuery({
    queryKey: ['rows', id],
    queryFn: () => api.listRows(id).then((r) => r.rows),
    enabled: !!schemaQ.data,
  });

  const schema = schemaQ.data;
  const rows = rowsQ.data ?? [];

  // Reconcile view prefs against current schema.
  useEffect(() => {
    if (schema) reconcile(id, schema);
  }, [id, schema]);

  // Real-time sync via socket.io
  useEffect(() => {
    if (!schema) return;
    const sock = getSocket();
    function refresh() {
      qc.invalidateQueries({ queryKey: ['rows', id] });
    }
    function onRowUpserted(p: { row: Row }) {
      qc.setQueryData<Row[]>(['rows', id], (old) => {
        if (!old) return [p.row];
        const idx = old.findIndex((r) => r.id === p.row.id);
        if (idx < 0) return [...old, p.row];
        const next = old.slice();
        next[idx] = p.row;
        return next;
      });
    }
    function onRowDeleted(p: { rowId: string }) {
      qc.setQueryData<Row[]>(['rows', id], (old) =>
        old ? old.filter((r) => r.id !== p.rowId) : [],
      );
    }
    function onSchemaUpdated() {
      qc.invalidateQueries({ queryKey: ['schema', id] });
      refresh();
    }
    sock.on('row.upserted', onRowUpserted);
    sock.on('row.deleted', onRowDeleted);
    sock.on('schema.updated', onSchemaUpdated);
    sock.emit('subscribe', { tableId: id });
    return () => {
      sock.off('row.upserted', onRowUpserted);
      sock.off('row.deleted', onRowDeleted);
      sock.off('schema.updated', onSchemaUpdated);
    };
  }, [id, schema, qc]);

  const visibleCols = useMemo(() => {
    if (!schema) return [];
    return schema.columns.filter((c) => c.visible && !prefs.hiddenColumns.includes(c.id));
  }, [schema, prefs]);

  const sortedRows = useMemo(() => {
    const s = sortBy ?? prefs.sort;
    if (!s) return rows;
    const col = visibleCols.find((c) => c.id === s.col);
    if (!col) return rows;
    return [...rows].sort((a, b) => {
      const av = a.values[s.col];
      const bv = b.values[s.col];
      const cmp = String(av ?? '').localeCompare(String(bv ?? ''), 'zh-Hans-CN');
      return s.dir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sortBy, prefs.sort, visibleCols]);

  // Live widths during drag (overrides prefs until mouseup persists).
  const [liveWidths, setLiveWidths] = useState<Record<string, number>>({});

  function getWidth(colId: string): number {
    if (colId in liveWidths) return liveWidths[colId]!;
    return prefs.columnWidths[colId] ?? 160;
  }

  function setLive(colId: string, w: number) {
    setLiveWidths((prev) => ({ ...prev, [colId]: w }));
  }

  function commitWidth(colId: string, w: number) {
    setColumnWidth(id, colId, w);
    setLiveWidths((prev) => {
      const next = { ...prev };
      delete next[colId];
      return next;
    });
    // Drop the stale prefs memo so the post-drag width actually shows.
    setPrefsTick((v) => v + 1);
  }

  function gridTemplate(): string {
    const cols = visibleCols.map((c) => `${getWidth(c.id)}px`).join(' ');
    return `${cols} 80px`;
  }

  async function handleAddRow() {
    setError(null);
    try {
      const row = await api
        .createRow(id, {})
        .then((r) => r.row)
        .catch(async () => {
          const required = (schema?.columns ?? []).filter((c) => c.required && c.type !== 'formula');
          const values: Record<string, unknown> = {};
          for (const c of required) {
            if (c.type === 'date') values[c.id] = new Date().toISOString().slice(0, 10);
            else values[c.id] = '草稿';
          }
          return api.createRow(id, values).then((r) => r.row);
        });
      qc.setQueryData<Row[]>(['rows', id], (old) => [...(old ?? []), row]);
      toast.success(`已新增行 ${row.id.slice(-6)}`);
    } catch (err) {
      toast.error((err as Error).message);
      setError((err as Error).message);
    }
  }

  async function handleDelete(rowId: string) {
    if (!confirm('确认删除该行?')) return;
    try {
      await api.deleteRow(id, rowId);
      qc.setQueryData<Row[]>(['rows', id], (old) =>
        old ? old.filter((r) => r.id !== rowId) : [],
      );
      toast.info(`行 ${rowId.slice(-6)} 已删除`);
    } catch (err) {
      toast.error((err as Error).message);
      setError((err as Error).message);
    }
  }

  function handleSort(col: Column) {
    const cur = sortBy ?? prefs.sort;
    const next = !cur || cur.col !== col.id
      ? { col: col.id, dir: 'asc' as const }
      : cur.dir === 'asc'
        ? { col: col.id, dir: 'desc' as const }
        : undefined;
    setSortBy(next);
    setSort(id, next);
    setPrefsTick((v) => v + 1);
  }

  // Close context menu on any outside click / scroll / Esc.
  useEffect(() => {
    if (!ctxMenu) return;
    function close() { setCtxMenu(null); }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') close(); }
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [ctxMenu]);

  if (schemaQ.isLoading) return <div className="muted">加载中...</div>;
  if (!schema) return <div className="empty-state">表不存在</div>;

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <h2>{schema.name}</h2>
          <span className="badge-soft" style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '2px 10px', borderRadius: 999, fontSize: 11, color: 'var(--text-secondary)' }}>
            v{schema.schemaVersion}
          </span>
          <span className="muted">
            {rows.length} 行 · {visibleCols.length}/{schema.columns.length} 列
          </span>
        </div>
        <div className="toolbar" style={{ marginTop: 12, marginBottom: 0 }}>
          <span className="spacer" />
          {user.role === 'admin' && (
            <>
              <Link to={`/tables/${id}/schema`}>
                <button className="ghost">列配置</button>
              </Link>
              <Link to={`/tables/${id}/options`}>
                <button className="ghost">选项集</button>
              </Link>
              <Link to={`/tables/${id}/stats`}>
                <button className="ghost">📊 统计</button>
              </Link>
            </>
          )}
          <button className="primary" onClick={handleAddRow} data-testid="add-row">
            + 新建行
          </button>
        </div>
      </div>
      {error && <div className="error-msg">{error}</div>}
      <div className="grid-wrap">
        <div className={`grid ${prefs.density === 'compact' ? 'compact' : ''}`} style={{ gridTemplateColumns: gridTemplate() }}>
          {visibleCols.map((col) => (
            <ResizableHeadCell
              key={col.id}
              col={col}
              width={getWidth(col.id)}
              onLive={(w) => setLive(col.id, w)}
              onCommit={(w) => commitWidth(col.id, w)}
              onSort={() => handleSort(col)}
              canHide={user.role === 'admin'}
              canRestore={prefs.hiddenColumns.includes(col.id)}
              onHide={() => {
                toggleColumnHidden(id, col.id);
                qc.invalidateQueries({ queryKey: ['schema', id] });
                setPrefsTick((v) => v + 1);
                setCtxMenu(null);
              }}
              onContextMenu={(e) => {
                if (user.role !== 'admin') return;
                e.preventDefault();
                setCtxMenu({ x: e.clientX, y: e.clientY, colId: col.id, colName: col.name });
              }}
            />
          ))}
          <div className="head" style={{ position: 'sticky', left: 0 }}>操作</div>

          {sortedRows.map((row) => (
            <RowCells
              key={row.id}
              row={row}
              schema={schema}
              cols={visibleCols}
              canEditCol={canEditColumn}
              canDelete={user.role === 'admin'}
              onChange={async (col, val) => {
                try {
                  await api.updateRow(id, row.id, { [col.id]: val });
                  // socket event handles UI sync; success is silent to avoid spam
                } catch (err) {
                  toast.error(`${col.name}: ${(err as Error).message}`);
                  setError((err as Error).message);
                }
              }}
              onImage={(asset) => setPreview(asset)}
              onDelete={() => handleDelete(row.id)}
            />
          ))}
          {sortedRows.length === 0 && (
            <div className="cell" style={{ gridColumn: `1 / span ${visibleCols.length + 1}` }}>
              <span className="placeholder">暂无数据 — 点击右上角「+ 新建行」开始</span>
            </div>
          )}
        </div>
      </div>

      {ctxMenu && (
        <div
          className="col-context-menu"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="ctx-menu-title">{ctxMenu.colName}</div>
          <button
            className="ctx-menu-item"
            onClick={() => {
              toggleColumnHidden(id, ctxMenu.colId);
              qc.invalidateQueries({ queryKey: ['schema', id] });
              setPrefsTick((v) => v + 1);
              toast.info(`已隐藏列「${ctxMenu.colName}」`);
              setCtxMenu(null);
            }}
          >
            隐藏该列
          </button>
        </div>
      )}

      {preview && (
        <ImagePreview
          src={preview}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

interface RowCellsProps {
  row: Row;
  schema: TableSchema;
  cols: Column[];
  canEditCol: (col: Column, role: 'admin' | 'user') => boolean;
  canDelete: boolean;
  onChange: (col: Column, val: CellValue | undefined) => Promise<void>;
  onImage: (url: string) => void;
  onDelete: () => void;
}

interface ResizableHeadCellProps {
  col: Column;
  width: number;
  onLive: (width: number) => void;
  onCommit: (width: number) => void;
  onSort: () => void;
  canHide: boolean;
  canRestore?: boolean;
  onHide: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function ResizableHeadCell({
  col,
  width,
  onLive,
  onCommit,
  onSort,
  canHide,
  onContextMenu,
}: ResizableHeadCellProps) {
  const { onMouseDown } = useColumnResize({
    initialWidth: width,
    minWidth: 60,
    onLive,
    onCommit,
  });

  const typeLabel = TYPE_LABEL[col.type] ?? col.type;
  const tooltip = [
    `类型: ${typeLabel}`,
    col.required ? '必填' : null,
    canHide ? '右键菜单可隐藏' : null,
  ].filter(Boolean).join(' · ');

  return (
    <div
      className="head"
      onClick={onSort}
      onContextMenu={onContextMenu}
      title={tooltip}
      style={{ cursor: 'pointer', position: 'relative' }}
      data-testid={`head-${col.id}`}
    >
      <span>{col.name}</span>
      {col.required && <span style={{ color: 'var(--danger)' }}>*</span>}
      <ResizeHandle onMouseDown={onMouseDown} />
    </div>
  );
}

function RowCells({ row, schema, cols, canEditCol, canDelete, onChange, onImage, onDelete }: RowCellsProps) {
  const role = useAuthStore((s) => s.user!.role);
  return (
    <>
      {cols.map((col) => {
        const editable = canEditCol(col, role);
        const value = row.values[col.id];
        return (
          <div key={col.id} className="cell" data-testid={`cell-${row.id}-${col.id}`}>
            <CellEditor
              col={col}
              rowId={row.id}
              tableId={schema.id}
              value={value}
              editable={editable}
              optionSet={col.type === 'option' ? schema.optionSets[col.optionSetId] : undefined}
              onChange={(v) => onChange(col, v)}
              onPreviewImage={onImage}
            />
          </div>
        );
      })}
      <div className="cell">
        {canDelete && (
          <button className="danger" onClick={onDelete} title="删除该行">
            删除
          </button>
        )}
      </div>
    </>
  );
}