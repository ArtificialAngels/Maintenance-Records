import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type RowPage } from '../lib/api';
import { schemaKey, useTableQuery } from '../lib/queries';
import { getSocket } from '../lib/socket';
import { useAuthStore } from '../stores/authStore';
import type {
  CellValue,
  Column,
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
import { ImageGallery } from '../components/ImagePreview';
import { toast } from '../components/Toaster';
import { confirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icons';
import { ResizeHandle, useColumnResize } from '../components/ResizableHeader';

function canEditColumn(col: Column, role: 'admin' | 'user'): boolean {
  if (col.type === 'formula' || col.type === 'autonumber') return false;
  if (role === 'admin') return true;
  return col.visible && col.editableByRoles.includes(role);
}

/** Width of the sticky action column (more menu + delete). */
const ACTION_COL_W = 76;

/**
 * 每页最多显示/缓存的行数。
 * 服务端 `GET /api/tables/:id/rows` 同样按 50 条封顶，前端只持有当前页。
 */
const PAGE_SIZE = 50;

/** Compact per-type default column widths so more columns fit on screen. */
function defaultColWidth(col: Column): number {
  switch (col.type) {
    case 'autonumber':
      return 62;
    case 'number':
      return 92;
    case 'date':
      return 118;
    case 'formula':
      return 100;
    case 'image':
      return 116;
    case 'option':
      return (col as Extract<Column, { type: 'option' }>).multiple ? 134 : 106;
    default:
      return 148;
  }
}

const TYPE_LABEL: Record<string, string> = {
  text: '文本',
  number: '数字',
  option: '选项',
  date: '日期',
  image: '图片',
  formula: '公式',
  autonumber: '自动序号',
  longtext: '长文本',
};

/** Skeleton placeholder while the schema loads. */
function TableSkeleton() {
  const cols = 6;
  const rows = 8;
  return (
    <div>
      <div className="page-header">
        <div className="skeleton" style={{ width: 180, height: 24, borderRadius: 8 }} />
      </div>
      <div className="skeleton-grid" style={{ maxHeight: 'none' }}>
        {Array.from({ length: cols + 1 }).map((_, i) => (
          <div key={`h${i}`} className="skeleton-cell" style={{ height: 38, width: i === 0 ? 140 : undefined }} />
        ))}
        {Array.from({ length: rows }).map((_, r) =>
          Array.from({ length: cols + 1 }).map((_, c) => (
            <div key={`${r}-${c}`} className="skeleton-cell" style={{ height: 41 }} />
          )),
        )}
      </div>
    </div>
  );
}

export function TablePage() {
  const { id = '' } = useParams<{ id: string }>();
  const user = useAuthStore((s) => s.user)!;
  const qc = useQueryClient();
  const [sortBy, setSortBy] = useState<{ col: string; dir: 'asc' | 'desc' } | undefined>();
  /** 当前页（1-based）。第 1 页 = 最新记录页。 */
  const [page, setPage] = useState(1);
  const [gallery, setGallery] = useState<{ images: string[]; index: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; colId: string; colName: string } | null>(null);
  const [rowMenu, setRowMenu] = useState<
    { rowId: string; x: number; y: number; upward: boolean } | null
  >(null);
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const [removingId, setRemovingId] = useState<string | null>(null);
  const removingRef = useRef<Set<string>>(new Set());
  /** Rows this client just deleted, so the broadcast isn't counted twice. */
  const ownDeletesRef = useRef<Set<string>>(new Set());
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Bumped after any prefs write so the `prefs` memo below re-reads localStorage.
  const [prefsTick, setPrefsTick] = useState(0);

  const prefs = useMemo(() => getPrefs(id), [id, prefsTick]);

  const schemaQ = useTableQuery(id);
  /** 排序同时影响服务端分页顺序，所以必须进查询键。 */
  const activeSort = sortBy ?? prefs.sort;
  const sortCol = activeSort?.col ?? null;
  const sortDir = activeSort?.dir ?? null;
  const rowsKey = ['rows', id, page, sortCol, sortDir] as const;
  /**
   * 只缓存当前页（最多 50 条）。翻页时保留上一页内容避免闪空，但换表时
   * 不能保留（否则会短暂显示另一张表的数据）。
   */
  const rowsQ = useQuery({
    queryKey: rowsKey,
    queryFn: () =>
      api.listRows(id, { page, sort: sortCol ?? undefined, dir: sortDir ?? undefined }),
    enabled: !!schemaQ.data,
    placeholderData: (prev, prevQuery) => (prevQuery?.queryKey[1] === id ? prev : undefined),
    // 实时同步靠 socket，页面聚焦时不必再整页重取。
    staleTime: 10_000,
  });

  const schema = schemaQ.data?.schema;
  /** 服务端下发的表格级权限：只读表不能新增/修改行。 */
  const canWriteTable = (schemaQ.data?.access ?? 'write') === 'write';
  const rows = rowsQ.data?.rows ?? [];
  const total = rowsQ.data?.total ?? 0;
  const pageSize = rowsQ.data?.pageSize ?? PAGE_SIZE;
  const totalPages = Math.max(1, rowsQ.data?.totalPages ?? 1);

  // Latest socket handlers need the current query key without re-subscribing.
  const rowsKeyRef = useRef<typeof rowsKey>(rowsKey);
  const sortColRef = useRef<string | null>(sortCol);
  useEffect(() => {
    rowsKeyRef.current = rowsKey;
    sortColRef.current = sortCol;
  }, [rowsKey, sortCol]);

  // A page can disappear when the table shrinks (deletes, other users).
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  // 切到另一张表时从最新一页开始，避免带着上一张表的页码发请求。
  useEffect(() => {
    setPage(1);
  }, [id]);

  const gridWrapRef = useRef<HTMLDivElement | null>(null);

  function goPage(next: number) {
    const target = Math.min(Math.max(1, next), totalPages);
    if (target === page) return;
    setPage(target);
    gridWrapRef.current?.scrollTo({ top: 0 });
  }

  // Reconcile view prefs against current schema.
  useEffect(() => {
    if (schema) reconcile(id, schema);
  }, [id, schema]);

  function flashRow(rowId: string) {
    setFlashIds((prev) => {
      const next = new Set(prev);
      next.add(rowId);
      return next;
    });
    window.setTimeout(() => {
      setFlashIds((prev) => {
        const next = new Set(prev);
        next.delete(rowId);
        return next;
      });
    }, 1600);
  }

  // Real-time sync via socket.io
  useEffect(() => {
    if (!schema) return;
    const sock = getSocket();
    function onRowUpserted(p: { row: Row }) {
      let isNew = false;
      qc.setQueryData<RowPage>(rowsKeyRef.current, (old) => {
        if (!old) return old;
        const idx = old.rows.findIndex((r) => r.id === p.row.id);
        if (idx >= 0) {
          const next = old.rows.slice();
          next[idx] = p.row;
          return { ...old, rows: next };
        }
        isNew = true;
        const nextTotal = old.total + 1;
        // 新记录只出现在「最新在前」的第 1 页；排序视图或其它页不插入，
        // 翻页时会自然取到，避免行错位。
        const atLatestPage = old.page === 1 && !sortColRef.current;
        return {
          ...old,
          rows: atLatestPage
            ? [p.row, ...old.rows].slice(0, old.pageSize)
            : old.rows,
          total: nextTotal,
          totalPages: Math.max(1, Math.ceil(nextTotal / old.pageSize)),
        };
      });
      // Keep the sidebar's row count fresh without refetching on every edit.
      if (isNew) {
        qc.invalidateQueries({ queryKey: ['tables'] });
        // 新行不在这页（或其它页的缓存里也没有它）：把各页标记为过期，
        // 翻回去时会重新取那一页，而不是继续显示旧数据。
        qc.invalidateQueries({ queryKey: ['rows', id], refetchType: 'none' });
      }
      flashRow(p.row.id);
    }
    function onRowDeleted(p: { rowId: string }) {
      // The client that deleted the row already removed it locally.
      if (ownDeletesRef.current.delete(p.rowId)) return;
      // A row currently playing its removal animation is removed locally.
      if (removingRef.current.has(p.rowId)) return;
      let wasOnPage = false;
      qc.setQueryData<RowPage>(rowsKeyRef.current, (old) => {
        if (!old) return old;
        const nextTotal = Math.max(0, old.total - 1);
        const nextPages = Math.max(1, Math.ceil(nextTotal / old.pageSize));
        if (!old.rows.some((r) => r.id === p.rowId)) {
          return { ...old, total: nextTotal, totalPages: nextPages };
        }
        wasOnPage = true;
        return {
          ...old,
          rows: old.rows.filter((r) => r.id !== p.rowId),
          total: nextTotal,
          totalPages: nextPages,
        };
      });
      // Row counts shown in the sidebar come from the table list.
      qc.invalidateQueries({ queryKey: ['tables'] });
      // 当前页少了一行：重取这一页把后面的记录补上来（其它页标记过期即可）。
      if (wasOnPage) qc.invalidateQueries({ queryKey: rowsKeyRef.current });
      else qc.invalidateQueries({ queryKey: ['rows', id], refetchType: 'none' });
    }
    function onSchemaUpdated() {
      qc.invalidateQueries({ queryKey: schemaKey(id) });
      qc.invalidateQueries({ queryKey: ['rows', id] });
    }
    function onRowsImported() {
      // Bulk import appends many rows at once; refetch instead of patching.
      qc.invalidateQueries({ queryKey: ['rows', id] });
      qc.invalidateQueries({ queryKey: ['tables'] });
    }
    sock.on('row.upserted', onRowUpserted);
    sock.on('row.deleted', onRowDeleted);
    sock.on('schema.updated', onSchemaUpdated);
    sock.on('rows.imported', onRowsImported);
    sock.emit('subscribe', { tableId: id });
    return () => {
      sock.off('row.upserted', onRowUpserted);
      sock.off('row.deleted', onRowDeleted);
      sock.off('schema.updated', onSchemaUpdated);
      sock.off('rows.imported', onRowsImported);
    };
  }, [id, schema, qc]);

  const visibleCols = useMemo(() => {
    if (!schema) return [];
    return schema.columns.filter((c) => c.visible && !prefs.hiddenColumns.includes(c.id));
  }, [schema, prefs]);

  // Columns shown in the main grid vs. collapsed into the per-row "更多" menu.
  const mainCols = useMemo(() => visibleCols.filter((c) => !c.overflow), [visibleCols]);
  const overflowCols = useMemo(() => visibleCols.filter((c) => c.overflow), [visibleCols]);

  // 排序在服务端做（否则只会排当前这一页），这里直接用服务端返回的顺序。

  // Live widths during drag (overrides prefs until mouseup persists).
  const [liveWidths, setLiveWidths] = useState<Record<string, number>>({});

  function getWidth(col: Column): number {
    if (col.id in liveWidths) return liveWidths[col.id]!;
    return prefs.columnWidths[col.id] ?? defaultColWidth(col);
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
    const cols = mainCols.map((c) => `${getWidth(c)}px`).join(' ');
    return `${cols} ${ACTION_COL_W}px`;
  }

  async function handleAddRow() {
    setError(null);
    try {
      const row = await api
        .createRow(id, {})
        .then((r) => r.row)
        .catch(async () => {
          const required = (schema?.columns ?? []).filter(
            (c) => c.required && c.type !== 'formula' && c.type !== 'autonumber',
          );
          const values: Record<string, unknown> = {};
          for (const c of required) {
            if (c.type === 'date') values[c.id] = new Date().toISOString().slice(0, 10);
            else values[c.id] = '草稿';
          }
          return api.createRow(id, values).then((r) => r.row);
        });
      // 新行属于最新一页：切回第 1 页再刷新当前页，避免本地拼接与 socket
      // 广播重复计数（服务端会重新给出准确的总数与页码）。
      if (page !== 1) setPage(1);
      await qc.invalidateQueries({ queryKey: ['rows', id] });
      qc.invalidateQueries({ queryKey: ['tables'] });
      flashRow(row.id);
      toast.success(`已新增行 ${row.id.slice(-6)}`);
    } catch (err) {
      toast.error((err as Error).message);
      setError((err as Error).message);
    }
  }

  async function handleDelete(rowId: string) {
    const ok = await confirmDialog({
      title: '删除该行？',
      body: (
        <>
          行 <span className="mono">{rowId.slice(-6)}</span> 将被永久删除，其他协作者会同步看到此操作，且无法撤销。
        </>
      ),
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    ownDeletesRef.current.add(rowId);
    removingRef.current.add(rowId);
    setRemovingId(rowId);
    window.setTimeout(() => {
      qc.setQueryData<RowPage>(rowsKeyRef.current, (old) => {
        if (!old || !old.rows.some((r) => r.id === rowId)) return old;
        const nextTotal = Math.max(0, old.total - 1);
        return {
          ...old,
          rows: old.rows.filter((r) => r.id !== rowId),
          total: nextTotal,
          totalPages: Math.max(1, Math.ceil(nextTotal / old.pageSize)),
        };
      });
      removingRef.current.delete(rowId);
      setRemovingId(null);
    }, 220);
    try {
      await api.deleteRow(id, rowId);
      // 删掉一行后当前页会缺一条：重取这一页把后面的记录补上来（只取 50 条）。
      qc.invalidateQueries({ queryKey: rowsKeyRef.current });
      qc.invalidateQueries({ queryKey: ['tables'] });
      toast.info(`行 ${rowId.slice(-6)} 已删除`);
    } catch (err) {
      ownDeletesRef.current.delete(rowId);
      removingRef.current.delete(rowId);
      setRemovingId(null);
      // 删除失败：把这一页拉回来（本地已经乐观移除了一行）。
      qc.invalidateQueries({ queryKey: rowsKeyRef.current });
      toast.error((err as Error).message);
      setError((err as Error).message);
    }
  }

  async function handleExport() {
    setError(null);
    setExporting(true);
    try {
      const { blob, filename } = await api.exportTableXlsx(id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoke on the next tick so Safari has time to start the download.
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(
        total > 0
          ? `已导出 ${total} 行（不含图片）`
          : '已导出表头（空表，可填写后再导入）',
      );
    } catch (err) {
      toast.error((err as Error).message);
      setError((err as Error).message);
    } finally {
      setExporting(false);
    }
  }

  async function handleImportFile(file: File) {
    setError(null);
    setImporting(true);
    try {
      const result = await api.importTableXlsx(id, file);
      await qc.invalidateQueries({ queryKey: ['rows', id] });
      qc.invalidateQueries({ queryKey: ['tables'] });

      if (result.imported > 0) {
        toast.success(`已从 Excel 导入 ${result.imported} 行`);
      }
      if (result.skipped.length > 0) {
        const first = result.skipped[0]!;
        const rowsText = result.skipped
          .slice(0, 3)
          .map((s) => `第 ${s.row} 行`)
          .join('、');
        toast.error(
          `${result.skipped.length} 行未导入（${rowsText}${result.skipped.length > 3 ? ' 等' : ''}）：${first.reason}`,
          8000,
        );
      }
      if (result.imported === 0 && result.skipped.length === 0) {
        toast.error('没有导入任何行');
      }
      if (result.unmatchedHeaders.length > 0) {
        toast.info(`忽略无法识别的列：${result.unmatchedHeaders.slice(0, 5).join('、')}`, 8000);
      }
    } catch (err) {
      toast.error((err as Error).message, 8000);
      setError((err as Error).message);
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = '';
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
    // 排序变了，页码要从第 1 页重新算。
    setPage(1);
  }

  /** Toggle the per-row secondary field menu, anchored to the clicked button. */
  function toggleRowMenu(rowId: string, btn: HTMLElement) {
    setRowMenu((cur) => {
      if (cur?.rowId === rowId) return null;
      const r = btn.getBoundingClientRect();
      const MENU_W = 332;
      const MENU_H = 460;
      const spaceBelow = window.innerHeight - r.bottom;
      const upward = spaceBelow < MENU_H + 24 && r.top > spaceBelow;
      const x = Math.max(
        8,
        Math.min(r.right - MENU_W + 20, window.innerWidth - MENU_W - 12),
      );
      const y = upward ? Math.max(8, r.top - MENU_H - 8) : r.bottom + 6;
      return { rowId, x, y, upward };
    });
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

  if (schemaQ.isLoading) return <TableSkeleton />;
  if (schemaQ.isError) return (
    <div className="empty-state">
      <span className="empty-icon"><Icon name="alert-triangle" size={24} /></span>
      <span className="empty-title">无法打开这张表</span>
      <span>{(schemaQ.error as Error).message}</span>
      <Link to="/tables">返回表格列表</Link>
    </div>
  );
  if (!schema) return (
    <div className="empty-state">
      <span className="empty-icon"><Icon name="alert-triangle" size={24} /></span>
      <span className="empty-title">表不存在</span>
      <Link to="/tables">返回表格列表</Link>
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <h2>{schema.name}</h2>
          <span className="badge-soft" style={{ padding: '2px 10px', fontSize: 11 }}>
            v{schema.schemaVersion}
          </span>
          {!canWriteTable && (
            <span className="badge-soft readonly" title="你只有查看权限">
              <Icon name="lock" size={11} /> 只读
            </span>
          )}
          <span className="muted" style={{ fontSize: 12 }}>
            {total} 行 · 第 {page}/{totalPages} 页 · {mainCols.length}/{schema.columns.length} 列
            {overflowCols.length > 0 && ` · ${overflowCols.length} 列在二级菜单`}
          </span>
        </div>
        <div className="toolbar" style={{ marginTop: 12, marginBottom: 0 }}>
          <span className="spacer" />
          <button
            className="ghost"
            onClick={handleExport}
            disabled={exporting}
            title="导出为 Excel（不含图片列）"
            data-testid="export-xlsx"
          >
            <Icon name="download" size={14} /> {exporting ? '导出中…' : '导出 Excel'}
          </button>
          {user.role === 'admin' && (
            <>
              <button
                className="ghost"
                onClick={() => importInputRef.current?.click()}
                disabled={importing}
                title="从 Excel 追加导入，表头需与列名一致"
                data-testid="import-xlsx"
              >
                <Icon name="upload" size={14} /> {importing ? '导入中…' : '导入 Excel'}
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept=".xlsx,.xls"
                hidden
                data-testid="import-xlsx-input"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleImportFile(file);
                }}
              />
              <Link to={`/tables/${id}/schema`} className="header-link">
                <button className="ghost"><Icon name="sliders" size={14} /> 列配置</button>
              </Link>
              <Link to={`/tables/${id}/options`} className="header-link">
                <button className="ghost"><Icon name="list" size={14} /> 选项集</button>
              </Link>
              <Link to={`/tables/${id}/stats`} className="header-link">
                <button className="ghost"><Icon name="bar-chart-3" size={14} /> 统计</button>
              </Link>
            </>
          )}
          {canWriteTable && (
            <button className="primary" onClick={handleAddRow} data-testid="add-row">
              <Icon name="plus" size={15} strokeWidth={2.5} /> 新建行
            </button>
          )}
        </div>
      </div>
      {error && <div className="error-msg"><Icon name="alert-triangle" size={14} /> {error}</div>}
      <div
        className={`grid-wrap ${rowsQ.isPlaceholderData ? 'busy' : ''}`}
        ref={gridWrapRef}
      >
        <div
          className={`grid ${prefs.density === 'compact' ? 'compact' : ''}`}
          style={{ gridTemplateColumns: gridTemplate() }}
        >
          {mainCols.map((col) => (
            <ResizableHeadCell
              key={col.id}
              col={col}
              width={getWidth(col)}
              sorted={activeSort?.col === col.id ? activeSort.dir : undefined}
              onLive={(w) => setLive(col.id, w)}
              onCommit={(w) => commitWidth(col.id, w)}
              onSort={() => handleSort(col)}
              canHide={user.role === 'admin'}
              onHide={() => {
                toggleColumnHidden(id, col.id);
                qc.invalidateQueries({ queryKey: schemaKey(id) });
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
          <div className="head action-col">操作</div>

          {rows.map((row, idx) => (
            <div
              key={row.id}
              className={`grid-row ${flashIds.has(row.id) ? 'flash' : ''} ${removingId === row.id ? 'removing' : ''}`}
              data-even={idx % 2 === 1}
              data-testid={`row-${row.id}`}
              style={{ ['--i' as string]: idx }}
            >
              <RowCells
                row={row}
                schema={schema}
                cols={mainCols}
                canEditCol={canEditColumn}
                canWriteTable={canWriteTable}
                canDelete={user.role === 'admin' && canWriteTable}
                overflowCount={overflowCols.length}
                menuOpen={rowMenu?.rowId === row.id}
                onOpenMenu={(btn) => toggleRowMenu(row.id, btn)}
                onChange={async (col, val) => {
                  try {
                    await api.updateRow(id, row.id, { [col.id]: val });
                    // socket event handles UI sync; success is silent to avoid spam
                  } catch (err) {
                    toast.error(`${col.name}: ${(err as Error).message}`);
                    setError((err as Error).message);
                  }
                }}
                onImage={(url, all) =>
                  setGallery({
                    images: all ?? [url],
                    index: all ? Math.max(0, all.indexOf(url)) : 0,
                  })
                }
                onDelete={() => handleDelete(row.id)}
              />
            </div>
          ))}
          {rows.length === 0 && (
            <div className="cell" style={{ gridColumn: `1 / span ${mainCols.length + 1}`, padding: 0 }}>
              <div style={{ width: '100%' }} className="empty-state">
                <span className="empty-icon"><Icon name="inbox" size={24} /></span>
                <span className="empty-title">暂无数据</span>
                <span>
                  {canWriteTable
                    ? '点击右上角「+ 新建行」开始记录'
                    : '这张表对你是只读的，目前还没有数据'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 分页条：前端只持有当前页（≤ 50 行），默认停在第 1 页 = 最新记录 */}
      {total > 0 && (
        <div className="pager">
          <span className="muted">
            共 {total} 行 · 每页最多 {pageSize} 行
            {activeSort
              ? ` · 按「${schema.columns.find((c) => c.id === activeSort.col)?.name ?? activeSort.col}」${activeSort.dir === 'asc' ? '升序' : '降序'}`
              : ' · 最新在前'}
          </span>
          <span className="spacer" />
          <button
            className="ghost"
            onClick={() => goPage(1)}
            disabled={page <= 1}
            title="第一页（最新记录）"
            data-testid="page-first"
          >
            <Icon name="chevron-left" size={14} /> 首页
          </button>
          <button
            className="ghost"
            onClick={() => goPage(page - 1)}
            disabled={page <= 1}
            data-testid="page-prev"
          >
            上一页
          </button>
          <span className="pager-pos">第 {page} / {totalPages} 页</span>
          <button
            className="ghost"
            onClick={() => goPage(page + 1)}
            disabled={page >= totalPages}
            data-testid="page-next"
          >
            下一页 <Icon name="chevron-right" size={14} />
          </button>
          <button
            className="ghost"
            onClick={() => goPage(totalPages)}
            disabled={page >= totalPages}
            title="最后一页（最早记录）"
            data-testid="page-last"
          >
            末页
          </button>
        </div>
      )}

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
              qc.invalidateQueries({ queryKey: schemaKey(id) });
              setPrefsTick((v) => v + 1);
              toast.info(`已隐藏列「${ctxMenu.colName}」`);
              setCtxMenu(null);
            }}
          >
            <Icon name="eye-off" size={14} /> 隐藏该列
          </button>
        </div>
      )}

      {gallery && (
        <ImageGallery
          images={gallery.images.map((src) => ({ src }))}
          startIndex={gallery.index}
          onClose={() => setGallery(null)}
        />
      )}

      {rowMenu && (() => {
        const menuRow = rows.find((r) => r.id === rowMenu.rowId);
        if (!menuRow) return null;
        return (
          <RowMenu
            state={rowMenu}
            row={menuRow}
            schema={schema}
            cols={overflowCols}
            canEditCol={canEditColumn}
            canWriteTable={canWriteTable}
            onChange={async (col, val) => {
              try {
                await api.updateRow(id, menuRow.id, { [col.id]: val });
              } catch (err) {
                toast.error(`${col.name}: ${(err as Error).message}`);
                setError((err as Error).message);
              }
            }}
            onImage={(url, all) =>
              setGallery({
                images: all ?? [url],
                index: all ? Math.max(0, all.indexOf(url)) : 0,
              })
            }
            onClose={() => setRowMenu(null)}
          />
        );
      })()}
    </div>
  );
}

interface RowCellsProps {
  row: Row;
  schema: TableSchema;
  cols: Column[];
  canEditCol: (col: Column, role: 'admin' | 'user') => boolean;
  /** false 表示这张表对该用户只读（服务端已禁止写入）。 */
  canWriteTable: boolean;
  canDelete: boolean;
  overflowCount: number;
  menuOpen: boolean;
  onOpenMenu: (btn: HTMLElement) => void;
  onChange: (col: Column, val: CellValue | undefined) => Promise<void>;
  onImage: (url: string, all?: string[]) => void;
  onDelete: () => void;
}

interface RowMenuProps {
  state: { x: number; y: number; upward: boolean };
  row: Row;
  schema: TableSchema;
  cols: Column[];
  canEditCol: (col: Column, role: 'admin' | 'user') => boolean;
  canWriteTable: boolean;
  onChange: (col: Column, val: CellValue | undefined) => Promise<void>;
  onImage: (url: string, all?: string[]) => void;
  onClose: () => void;
}

interface ResizableHeadCellProps {
  col: Column;
  width: number;
  sorted?: 'asc' | 'desc';
  onLive: (width: number) => void;
  onCommit: (width: number) => void;
  onSort: () => void;
  canHide: boolean;
  onHide: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function SortIndicator({ dir }: { dir?: 'asc' | 'desc' }) {
  return (
    <span className="sort-arrow" aria-hidden>
      <Icon name="chevron-up" size={11} className={dir === 'asc' ? 'on' : 'off'} />
      <Icon name="chevron-down" size={11} className={dir === 'desc' ? 'on' : 'off'} />
    </span>
  );
}

function ResizableHeadCell({
  col,
  width,
  sorted,
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
    sorted ? (sorted === 'asc' ? '升序 · 点击切换降序' : '降序 · 点击取消排序') : '点击排序',
    canHide ? '右键菜单可隐藏' : null,
  ].filter(Boolean).join(' · ');

  return (
    <div
      className={`head ${sorted ? 'sorted' : ''}`}
      onClick={onSort}
      onContextMenu={onContextMenu}
      title={tooltip}
      style={{ cursor: 'pointer', position: 'relative' }}
      data-testid={`head-${col.id}`}
    >
      <span className="head-label">{col.name}</span>
      {col.required && <span style={{ color: 'var(--danger)', fontWeight: 700 }}>*</span>}
      <SortIndicator dir={sorted} />
      <ResizeHandle onMouseDown={onMouseDown} />
    </div>
  );
}

function RowCells({
  row,
  schema,
  cols,
  canEditCol,
  canWriteTable,
  canDelete,
  overflowCount,
  menuOpen,
  onOpenMenu,
  onChange,
  onImage,
  onDelete,
}: RowCellsProps) {
  const role = useAuthStore((s) => s.user!.role);
  return (
    <>
      {cols.map((col) => {
        const editable = canWriteTable && canEditCol(col, role);
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
      <div className="cell action-col">
        <div className="action-btns">
          {overflowCount > 0 && (
            <button
              className={`row-menu-btn ${menuOpen ? 'open' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onOpenMenu(e.currentTarget);
              }}
              title="更多字段"
              aria-label="更多字段"
              aria-expanded={menuOpen}
            >
              <Icon name="more-horizontal" size={15} />
            </button>
          )}
          {canDelete && (
            <button className="danger" onClick={onDelete} title="删除该行" aria-label="删除该行">
              <Icon name="trash" size={13} />
            </button>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * Per-row secondary menu: shows columns marked overflow=true in the schema,
 * with the same CellEditor (read/write) as the main grid.
 */
function RowMenu({ state, row, schema, cols, canEditCol, canWriteTable, onChange, onImage, onClose }: RowMenuProps) {
  const role = useAuthStore((s) => s.user!.role);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (t.closest('.row-menu-btn')) return; // the trigger toggles itself
      if (ref.current && !ref.current.contains(t)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    function onScroll(e: Event) {
      // Scrolling inside the menu body must not close the menu.
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      onClose();
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  return (
    <div
      className={`row-menu-anchor ${state.upward ? 'upward' : ''}`}
      style={{
        left: state.x,
        top: state.y,
        transform: state.upward ? 'translateY(-100%)' : 'none',
      }}
    >
      <div className="row-menu popover" ref={ref} role="dialog" aria-label="更多字段">
        <div className="row-menu-head">
          <Icon name="panel-right" size={14} />
          <span>更多字段</span>
          <span className="row-menu-count mono">{cols.length}</span>
          <button className="row-menu-close" onClick={onClose} aria-label="关闭" title="关闭">
            <Icon name="x" size={13} />
          </button>
        </div>
        <div className="row-menu-body">
          {cols.map((col, idx) => {
            const editable = canWriteTable && canEditCol(col, role);
            return (
              <div
                key={col.id}
                className="row-menu-field"
                data-testid={`menu-${row.id}-${col.id}`}
                style={{ ['--i' as string]: idx }}
              >
                <div className="row-menu-label">
                  {col.name}
                  {col.required && <span className="req-star">*</span>}
                  <span className="row-menu-type">{TYPE_LABEL[col.type] ?? col.type}</span>
                </div>
                <div className="row-menu-value">
                  <CellEditor
                    col={col}
                    rowId={row.id}
                    tableId={schema.id}
                    value={row.values[col.id]}
                    editable={editable}
                    optionSet={col.type === 'option' ? schema.optionSets[col.optionSetId] : undefined}
                    onChange={(v) => onChange(col, v)}
                    onPreviewImage={onImage}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
