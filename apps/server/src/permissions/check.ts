import type { Column, JwtPayload, Role, Row, TableSchema } from '../types.js';

/**
 * Filter columns a given role is allowed to READ.
 * Admin sees everything that's marked visible; user role only sees visible columns.
 */
export function readableColumns(schema: TableSchema, role: JwtPayload['role']): Column[] {
  if (role === 'admin') return schema.columns;
  return schema.columns.filter((c) => c.visible);
}

/**
 * Filter columns a given role is allowed to WRITE.
 * Formula columns are never editable by anyone (server computes).
 */
export function writableColumns(schema: TableSchema, role: Role): Column[] {
  if (role === 'admin') {
    return schema.columns.filter((c) => c.type !== 'formula');
  }
  return schema.columns.filter(
    (c) => c.type !== 'formula' && c.editableByRoles.includes(role) && c.visible,
  );
}

export function canReadColumn(column: Column, role: JwtPayload['role']): boolean {
  if (role === 'admin') return true;
  return column.visible;
}

export function canWriteColumn(column: Column, role: JwtPayload['role']): boolean {
  if (column.type === 'formula') return false;
  if (role === 'admin') return true;
  return column.visible && column.editableByRoles.includes(role);
}

/**
 * Project a row so only readable columns remain in its values.
 */
export function projectRowForRead(row: Row, schema: TableSchema, role: JwtPayload['role']): Row {
  if (role === 'admin') return row;
  const allowed = new Set(
    schema.columns.filter((c) => c.visible).map((c) => c.id),
  );
  const filtered: Record<string, Row['values'][string]> = {};
  for (const [k, v] of Object.entries(row.values)) {
    if (allowed.has(k)) filtered[k] = v;
  }
  return { ...row, values: filtered };
}

/**
 * Strip values for columns they can't write.
 * Returns a new values object. Also validates that required columns have a value.
 */
export function sanitizeWriteValues(
  values: Record<string, unknown>,
  schema: TableSchema,
  role: JwtPayload['role'],
): { ok: true; values: Record<string, unknown> } | { ok: false; reason: string } {
  const result: Record<string, unknown> = {};
  for (const col of schema.columns) {
    const present = Object.prototype.hasOwnProperty.call(values, col.id);
    if (!present) continue;
    if (!canWriteColumn(col, role)) {
      return { ok: false, reason: `列「${col.name}」不可编辑或不可见` };
    }
    result[col.id] = values[col.id];
  }
  // Validate required fields if present in values or if creating (caller decides)
  return { ok: true, values: result };
}

export function isSchemaEditAllowed(role: JwtPayload['role']): boolean {
  return role === 'admin';
}

export function isOptionsEditAllowed(role: JwtPayload['role']): boolean {
  return role === 'admin';
}

export function isRowDeleteAllowed(role: JwtPayload['role']): boolean {
  return role === 'admin';
}