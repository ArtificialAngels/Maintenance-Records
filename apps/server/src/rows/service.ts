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

export async function listRows(
  tableId: string,
  actor: JwtPayload,
): Promise<Row[]> {
  const schema = await loadSchema(tableId);
  if (!schema) return [];
  const { rows } = await loadRows(tableId);
  return rows.map((r) => {
    // Always recompute formulas on read so the API returns fresh values
    // even for rows imported directly via CLI (which skip createRow).
    const computed = recomputeFormulas(schema, r.values);
    const row: Row = { ...r, values: { ...r.values, ...computed } };
    return projectRowForRead(row, schema, actor.role);
  });
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
  // Required fields check
  for (const col of schema.columns) {
    if (col.required && col.type !== 'formula') {
      const v = sanitized.values[col.id];
      if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) {
        throw new Error(`列「${col.name}」必填`);
      }
    }
  }
  const computed = recomputeFormulas(schema, sanitized.values as Record<string, CellValue>);
  const row: Row = {
    id: newRowId(),
    createdAt: new Date().toISOString(),
    createdBy: actor.sub,
    values: computed,
  };
  await tableWriteMutex.run(`table:${tableId}`, async () => {
    const data = await loadRows(tableId);
    data.rows.push(row);
    await writeJson(paths.rowsFile(tableId), data);
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
    updatedRow = next;
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
  if (!isRowDeleteAllowed(actor.role)) throw new Error('仅管理员可删行');
  await tableWriteMutex.run(`table:${tableId}`, async () => {
    const data = await loadRows(tableId);
    const before = data.rows.length;
    data.rows = data.rows.filter((r) => r.id !== rowId);
    if (data.rows.length === before) throw new Error('行不存在');
    await writeJson(paths.rowsFile(tableId), data);
  });
  await audit({
    actor: actor.sub,
    role: actor.role,
    action: 'row.delete',
    tableId,
    rowId,
  });
}

export async function getRow(
  tableId: string,
  rowId: string,
  actor: JwtPayload,
): Promise<Row | null> {
  const schema = await loadSchema(tableId);
  if (!schema) return null;
  const { rows } = await loadRows(tableId);
  const row = rows.find((r) => r.id === rowId);
  if (!row) return null;
  return projectRowForRead(row, schema, actor.role);
}