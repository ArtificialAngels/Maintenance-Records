import { paths } from '../storage/paths.js';
import { readJson, writeJson } from '../storage/fs.js';
import { tableWriteMutex } from '../storage/mutex.js';
import { evaluateFormula } from '../formulas/functions.js';
import { sanitizeWriteValues, isRowDeleteAllowed, projectRowForRead } from '../permissions/check.js';
import { audit } from '../audit/log.js';
import { newRowId, loadSchema } from '../tables/service.js';
import type {
  CellValue,
  Column,
  FormulaColumn,
  JwtPayload,
  Row,
  RowsFile,
  TableSchema,
} from '../types.js';

export async function loadRows(tableId: string): Promise<RowsFile> {
  return (
    (await readJson<RowsFile>(paths.rowsFile(tableId))) ?? { rows: [] }
  );
}

function isFormula(col: Column): col is FormulaColumn {
  return col.type === 'formula';
}

/**
 * Fill autonumber columns with 1-based sequence numbers derived from the
 * row's position in the table. Not persisted; computed on every read/write
 * so the numbering self-heals after inserts and deletes.
 */
export function applyAutonumbers(schema: TableSchema, rows: Row[]): Row[] {
  const autoCols = schema.columns.filter((c) => c.type === 'autonumber');
  if (autoCols.length === 0) return rows;
  return rows.map((row, i) => {
    const values = { ...row.values };
    for (const col of autoCols) {
      values[col.id] = i + 1;
    }
    return { ...row, values };
  });
}

/**
 * Recompute formula columns in a row after a value change.
 * Runs in dependency-graph order; cycles are skipped silently.
 */
export function recomputeFormulas(
  schema: TableSchema,
  values: Record<string, CellValue>,
): Record<string, CellValue> {
  const out: Record<string, CellValue> = { ...values };
  const computed: Record<string, CellValue> = {};
  const visiting = new Set<string>();

  const visit = (colId: string) => {
    if (computed[colId] !== undefined) return computed[colId];
    const col = schema.columns.find((c) => c.id === colId);
    if (!col || !isFormula(col)) return out[colId];
    if (visiting.has(colId)) return out[colId]; // cycle
    visiting.add(colId);
    const refs: Record<string, unknown> = {};
    for (const dep of col.dependsOn) {
      // Make sure dep is computed first
      refs[dep] = visit(dep);
      // After visit, drop from refs map; use the freshly-updated out value.
      refs[dep] = out[dep];
      const depCol = schema.columns.find((c) => c.id === dep);
      // Default missing numeric dependencies to 0 so expressions like
      // SUMARGS({{h1}},{{h2}},...) evaluate instead of throwing.
      if (refs[dep] === undefined && depCol?.type === 'number') {
        refs[dep] = 0;
      }
      if (depCol?.type === 'number' && typeof refs[dep] === 'string') {
        const n = Number(refs[dep]);
        refs[dep] = Number.isFinite(n) ? n : 0;
      }
    }
    visiting.delete(colId);
    try {
      const result = evaluateFormula(col.formula, refs);
      out[colId] = result == null ? null : (result as CellValue);
      computed[colId] = out[colId]!;
    } catch {
      out[colId] = null;
      computed[colId] = null;
    }
    return out[colId];
  };

  for (const col of schema.columns) {
    if (isFormula(col)) visit(col.id);
  }
  return out;
}

/** 单页最多返回的行数。前端每页固定 50 条，服务端再兜底封顶。 */
export const MAX_PAGE_SIZE = 50;
/** 未指定 pageSize 时的默认值（等于每页上限）。 */
export const DEFAULT_PAGE_SIZE = MAX_PAGE_SIZE;

export interface RowPageOptions {
  /** 1-based 页码。 */
  page?: number;
  pageSize?: number;
  /** 排序列 id；不传则按录入顺序倒序（最新在前）。 */
  sort?: string;
  dir?: 'asc' | 'desc';
}

export interface RowPage {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Compute the read-time-only columns for one row.
 *
 * `position` is the row's 0-based index in the full table (not in the page), so
 * autonumbers stay continuous across page boundaries.
 */
function computeRow(schema: TableSchema, row: Row, position: number): Row {
  // Always recompute formulas on read so the API returns fresh values even for
  // rows imported directly via CLI (which skip createRow).
  const values = recomputeFormulas(schema, row.values);
  for (const col of schema.columns) {
    if (col.type === 'autonumber') values[col.id] = position + 1;
  }
  return { ...row, values };
}

/** Sort key used by server-side ordering (autonumber = full-table position). */
function sortKeyFor(
  schema: TableSchema,
  row: Row,
  position: number,
  colId: string,
): CellValue | undefined {
  const col = schema.columns.find((c) => c.id === colId);
  if (col?.type === 'autonumber') return position + 1;
  return row.values[colId];
}

function compareCell(a: CellValue | undefined, b: CellValue | undefined): number {
  // Numeric columns (e.g. 自动序号) sort by value so 10 doesn't precede 2.
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a ?? '').localeCompare(String(b ?? ''), 'zh-Hans-CN', { numeric: true });
}

/** All rows, in storage order (oldest first). Used by the Excel exporter. */
export async function listRows(
  tableId: string,
  actor: JwtPayload,
): Promise<Row[]> {
  const schema = await loadSchema(tableId);
  if (!schema) return [];
  const { rows } = await loadRows(tableId);
  return rows.map((row, i) => projectRowForRead(computeRow(schema, row, i), schema, actor.role));
}

/**
 * One page of rows. Only the page's rows get formula recomputation — that's the
 * expensive part of a read, so a 5 000-row table costs the same as a 50-row one.
 *
 * Default order is newest-first (rows.json is append-only), so page 1 is the
 * "latest page" the UI opens on.
 */
export async function listRowPage(
  tableId: string,
  actor: JwtPayload,
  options: RowPageOptions = {},
): Promise<RowPage> {
  const requestedSize = Math.trunc(Number(options.pageSize) || DEFAULT_PAGE_SIZE);
  const pageSize = Math.min(Math.max(requestedSize, 1), MAX_PAGE_SIZE);
  const schema = await loadSchema(tableId);
  if (!schema) return { rows: [], total: 0, page: 1, pageSize, totalPages: 0 };

  const { rows } = await loadRows(tableId);
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const requestedPage = Math.trunc(Number(options.page) || 1);
  const page = Math.min(Math.max(requestedPage, 1), totalPages);

  const order = rows.map((_, i) => i);
  if (options.sort) {
    const dir = options.dir === 'desc' ? -1 : 1;
    // Pre-compute keys once instead of inside the comparator (n log n lookups).
    const keys = new Map<number, CellValue | undefined>();
    for (const i of order) keys.set(i, sortKeyFor(schema, rows[i]!, i, options.sort));
    order.sort((a, b) => compareCell(keys.get(a), keys.get(b)) * dir);
  } else {
    // Append order reversed: the newest record comes first.
    order.reverse();
  }

  const start = (page - 1) * pageSize;
  const pageRows = order
    .slice(start, start + pageSize)
    .map((i) => projectRowForRead(computeRow(schema, rows[i]!, i), schema, actor.role));

  return { rows: pageRows, total, page, pageSize, totalPages };
}

/**
 * Return the first required column that has no value, or null when the row is
 * complete. Formula/autonumber columns are server-computed and never required
 * from the client.
 */
function findMissingRequired(
  schema: TableSchema,
  values: Record<string, unknown>,
): Column | null {
  for (const col of schema.columns) {
    if (!col.required || col.type === 'formula' || col.type === 'autonumber') continue;
    const v = values[col.id];
    if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) return col;
  }
  return null;
}

export async function createRow(
  tableId: string,
  rawValues: Record<string, unknown>,
  actor: JwtPayload,
): Promise<Row> {
  const schema = await loadSchema(tableId);
  if (!schema) throw new Error('表不存在');
  const sanitized = sanitizeWriteValues(rawValues, schema, actor.role);
  if (!sanitized.ok) throw new Error(sanitized.reason);
  const missing = findMissingRequired(schema, sanitized.values);
  if (missing) throw new Error(`列「${missing.name}」必填`);
  const computed = recomputeFormulas(schema, sanitized.values as Record<string, CellValue>);
  let row: Row = {
    id: newRowId(),
    createdAt: new Date().toISOString(),
    createdBy: actor.sub,
    values: computed,
  };
  await tableWriteMutex.run(`table:${tableId}`, async () => {
    const data = await loadRows(tableId);
    data.rows.push(row);
    await writeJson(paths.rowsFile(tableId), data);
    // Assign the sequence number from the newly appended row's position.
    row = applyAutonumbers(schema, data.rows)[data.rows.length - 1]!;
  });
  await audit({
    actor: actor.sub,
    role: actor.role,
    action: 'row.create',
    tableId,
    rowId: row.id,
  });
  return projectRowForRead(row, schema, actor.role);
}

export async function updateRow(
  tableId: string,
  rowId: string,
  patch: Record<string, unknown>,
  actor: JwtPayload,
): Promise<Row> {
  const schema = await loadSchema(tableId);
  if (!schema) throw new Error('表不存在');
  const sanitized = sanitizeWriteValues(patch, schema, actor.role);
  if (!sanitized.ok) throw new Error(sanitized.reason);
  let updatedRow: Row | null = null;
  await tableWriteMutex.run(`table:${tableId}`, async () => {
    const data = await loadRows(tableId);
    const idx = data.rows.findIndex((r) => r.id === rowId);
    if (idx < 0) throw new Error('行不存在');
    const merged: Record<string, CellValue> = {
      ...data.rows[idx]!.values,
      ...(sanitized.values as Record<string, CellValue>),
    };
    const recomputed = recomputeFormulas(schema, merged);
    const next: Row = {
      ...data.rows[idx]!,
      values: recomputed,
    };
    data.rows[idx] = next;
    await writeJson(paths.rowsFile(tableId), data);
    // Stamp the current sequence number on the response copy (not persisted).
    updatedRow = applyAutonumbers(schema, data.rows)[idx]!;
  });
  await audit({
    actor: actor.sub,
    role: actor.role,
    action: 'row.update',
    tableId,
    rowId,
    details: { changedColumns: Object.keys(patch) },
  });
  if (!updatedRow) throw new Error('行不存在');
  return projectRowForRead(updatedRow, schema, actor.role);
}

export async function deleteRow(
  tableId: string,
  rowId: string,
  actor: JwtPayload,
): Promise<void> {
  const removed = await deleteRows(tableId, [rowId], actor);
  if (removed.length === 0) throw new Error('行不存在');
}

/**
 * Delete many rows in one write.
 *
 * Filtering inside a single mutex section keeps the file consistent and means
 * a 50-row cleanup touches rows.json (and the audit log) once instead of 50
 * times. Returns the ids that actually existed and were removed.
 */
export async function deleteRows(
  tableId: string,
  rowIds: string[],
  actor: JwtPayload,
): Promise<string[]> {
  if (!isRowDeleteAllowed(actor.role)) throw new Error('仅管理员可删行');
  const wanted = new Set(rowIds.filter(Boolean));
  if (wanted.size === 0) return [];
  let removed: string[] = [];
  await tableWriteMutex.run(`table:${tableId}`, async () => {
    const data = await loadRows(tableId);
    removed = data.rows.filter((r) => wanted.has(r.id)).map((r) => r.id);
    if (removed.length === 0) return;
    data.rows = data.rows.filter((r) => !wanted.has(r.id));
    await writeJson(paths.rowsFile(tableId), data);
  });
  if (removed.length === 0) return [];
  await audit({
    actor: actor.sub,
    role: actor.role,
    action: 'row.delete',
    tableId,
    rowId: removed.length === 1 ? removed[0] : undefined,
    details: { count: removed.length },
  });
  return removed;
}

export async function getRow(
  tableId: string,
  rowId: string,
  actor: JwtPayload,
): Promise<Row | null> {
  const schema = await loadSchema(tableId);
  if (!schema) return null;
  const { rows } = await loadRows(tableId);
  const idx = rows.findIndex((r) => r.id === rowId);
  if (idx < 0) return null;
  const numbered = applyAutonumbers(schema, rows);
  return projectRowForRead(numbered[idx]!, schema, actor.role);
}

export interface ImportRowsResult {
  /** Rows that were appended, with autonumber values filled in. */
  rows: Row[];
  /** Records that could not be imported, keyed by spreadsheet row number. */
  skipped: { row: number; reason: string }[];
}

/**
 * Append many rows at once (used by the Excel importer).
 *
 * Unlike calling createRow in a loop this validates everything up front,
 * writes rows.json once, and emits a single audit entry — so importing a few
 * thousand rows stays fast and doesn't hammer the file lock.
 */
export async function importRows(
  tableId: string,
  records: { rowNumber: number; values: Record<string, unknown> }[],
  actor: JwtPayload,
): Promise<ImportRowsResult> {
  const schema = await loadSchema(tableId);
  if (!schema) throw new Error('表不存在');

  const skipped: ImportRowsResult['skipped'] = [];
  const pending: Row[] = [];
  for (const record of records) {
    const sanitized = sanitizeWriteValues(record.values, schema, actor.role);
    if (!sanitized.ok) {
      skipped.push({ row: record.rowNumber, reason: sanitized.reason });
      continue;
    }
    const missing = findMissingRequired(schema, sanitized.values);
    if (missing) {
      skipped.push({ row: record.rowNumber, reason: `列「${missing.name}」必填` });
      continue;
    }
    pending.push({
      id: newRowId(),
      createdAt: new Date().toISOString(),
      createdBy: actor.sub,
      values: recomputeFormulas(
        schema,
        sanitized.values as Record<string, CellValue>,
      ),
    });
  }

  if (pending.length === 0) return { rows: [], skipped };

  let appended: Row[] = [];
  await tableWriteMutex.run(`table:${tableId}`, async () => {
    const data = await loadRows(tableId);
    const start = data.rows.length;
    data.rows.push(...pending);
    await writeJson(paths.rowsFile(tableId), data);
    // Stamp sequence numbers from the rows' new positions (not persisted).
    appended = applyAutonumbers(schema, data.rows).slice(start);
  });

  await audit({
    actor: actor.sub,
    role: actor.role,
    action: 'row.import',
    tableId,
    details: { count: appended.length, skipped: skipped.length },
  });

  return {
    rows: appended.map((row) => projectRowForRead(row, schema, actor.role)),
    skipped,
  };
}