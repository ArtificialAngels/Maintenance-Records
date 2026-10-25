import path from 'node:path';
import { nanoid } from 'nanoid';
import { paths } from '../storage/paths.js';
import { readJson, writeJson, ensureDir, listDirs } from '../storage/fs.js';
import { tableWriteMutex } from '../storage/mutex.js';
import type { RowsFile, TableSchema, JwtPayload } from '../types.js';
import { audit } from '../audit/log.js';

export interface TableSummary {
  id: string;
  name: string;
  schemaVersion: number;
  columnCount: number;
  rowCount: number;
}

export async function listTables(): Promise<TableSummary[]> {
  const tablesDir = path.join(paths.root(), 'tables');
  const ids = await listDirs(tablesDir);
  const out: TableSummary[] = [];
  for (const id of ids) {
    if (id.startsWith('_')) continue; // skip _deprecated_*, _archived_*, etc.
    const schema = await readJson<TableSchema>(paths.schemaFile(id));
    if (!schema) continue;
    const rows = await readJson<RowsFile>(paths.rowsFile(id));
    out.push({
      id: schema.id,
      name: schema.name,
      schemaVersion: schema.schemaVersion,
      columnCount: schema.columns.length,
      rowCount: rows?.rows.length ?? 0,
    });
  }
  return out;
}

export async function getTable(tableId: string): Promise<TableSchema | null> {
  return readJson<TableSchema>(paths.schemaFile(tableId));
}

// Alias for cross-module use (more semantic in some contexts).
export const loadSchema = getTable;

export class TableAlreadyExistsError extends Error {
  constructor(tableId: string) {
    super(`表 ID「${tableId}」已存在，请换一个`);
    this.name = 'TableAlreadyExistsError';
  }
}

export async function createTable(
  schema: TableSchema,
  actor: JwtPayload,
): Promise<TableSchema> {
  // Never overwrite an existing table: a duplicate id would silently replace
  // its schema (and orphan all rows) since schema.json is keyed by id.
  const created = await tableWriteMutex.run(`table:${schema.id}`, async () => {
    const existing = await readJson<TableSchema>(paths.schemaFile(schema.id));
    if (existing) throw new TableAlreadyExistsError(schema.id);
    await ensureDir(paths.tableDir(schema.id));
    await writeJson(paths.schemaFile(schema.id), schema);
    return schema;
  });
  await audit({
    actor: actor.sub,
    role: actor.role,
    action: 'table.create',
    tableId: schema.id,
    details: { name: schema.name, columns: schema.columns.length },
  });
  return created;
}

export async function updateSchema(
  tableId: string,
  patch: Partial<Pick<TableSchema, 'name' | 'columns' | 'optionSets'>>,
  actor: JwtPayload,
): Promise<TableSchema> {
  return tableWriteMutex.run(`table:${tableId}`, async () => {
    const current = await readJson<TableSchema>(paths.schemaFile(tableId));
    if (!current) throw new Error('表不存在');
    const next: TableSchema = {
      ...current,
      name: patch.name ?? current.name,
      columns: patch.columns ?? current.columns,
      optionSets: patch.optionSets ?? current.optionSets,
      schemaVersion: current.schemaVersion + 1,
    };
    await writeJson(paths.schemaFile(tableId), next);
    await audit({
      actor: actor.sub,
      role: actor.role,
      action: 'table.schema.update',
      tableId,
      details: { newVersion: next.schemaVersion, columns: next.columns.length },
    });
    return next;
  });
}

export function newRowId(): string {
  return `row_${nanoid(12)}`;
}

export function newTableId(): string {
  return `tbl_${nanoid(8)}`;
}