/**
 * Per-user local view preferences, stored in localStorage so each browser
 * keeps its own without round-tripping to the server.
 */
import type { TableSchema } from '../lib/types';

interface ViewPrefs {
  columnWidths: Record<string, number>;
  hiddenColumns: string[];
  sort?: { col: string; dir: 'asc' | 'desc' };
  density: 'compact' | 'normal';
}

const PREFIX = 'mr:view:';

function read(tableId: string): ViewPrefs {
  const raw = localStorage.getItem(PREFIX + tableId);
  if (!raw) return { columnWidths: {}, hiddenColumns: [], density: 'normal' };
  try {
    return JSON.parse(raw) as ViewPrefs;
  } catch {
    return { columnWidths: {}, hiddenColumns: [], density: 'normal' };
  }
}

function write(tableId: string, prefs: ViewPrefs) {
  localStorage.setItem(PREFIX + tableId, JSON.stringify(prefs));
}

export function getPrefs(tableId: string): ViewPrefs {
  return read(tableId);
}

export function setColumnWidth(tableId: string, colId: string, width: number) {
  const p = read(tableId);
  p.columnWidths[colId] = width;
  write(tableId, p);
}

export function toggleColumnHidden(tableId: string, colId: string) {
  const p = read(tableId);
  const i = p.hiddenColumns.indexOf(colId);
  if (i >= 0) p.hiddenColumns.splice(i, 1);
  else p.hiddenColumns.push(colId);
  write(tableId, p);
  return p.hiddenColumns;
}

export function setSort(tableId: string, sort: ViewPrefs['sort']) {
  const p = read(tableId);
  p.sort = sort;
  write(tableId, p);
}

export function setDensity(tableId: string, density: ViewPrefs['density']) {
  const p = read(tableId);
  p.density = density;
  write(tableId, p);
}

/**
 * After schema changes, drop any prefs that reference removed columns.
 */
export function reconcile(tableId: string, schema: TableSchema) {
  const p = read(tableId);
  const validIds = new Set(schema.columns.map((c) => c.id));
  for (const id of Object.keys(p.columnWidths)) {
    if (!validIds.has(id)) delete p.columnWidths[id];
  }
  p.hiddenColumns = p.hiddenColumns.filter((id) => validIds.has(id));
  write(tableId, p);
}