export type FieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'image'
  | 'option'
  | 'formula'
  | 'autonumber';

export type Role = 'admin' | 'user';

/**
 * Per-table access level for a non-admin account.
 *   'read'  → 可以看这张表，但不能新增/修改行
 *   'write' → 可以看，也可以新增/修改行（列级 editableByRoles 仍然生效）
 */
export type TableAccess = 'read' | 'write';

export interface User {
  id: string;
  name: string;
  role: Role;
  /** scrypt hash string produced by users/store; absent means no password set. */
  passwordHash?: string;
  /**
   * 每张表的权限。undefined 表示「旧版账号」：按列级权限访问所有表
   * （users.json 升级前创建的账号保持原行为，不会突然失去全部表格）。
   * 空对象 {} 表示明确不给任何表。
   * 管理员忽略此字段，永远拥有全部表格。
   */
  tablePermissions?: Record<string, TableAccess>;
}

export interface ColumnBase {
  id: string;
  name: string;
  type: FieldType;
  visible: boolean;
  required?: boolean;
  editableByRoles: Role[];
  /**
   * When true the column is hidden from the main grid and instead shown inside
   * the per-row secondary ("更多") menu. Only meaningful while visible=true.
   */
  overflow?: boolean;
}

export interface TextColumn extends ColumnBase {
  type: 'text';
  maxLength?: number;
}

export interface NumberColumn extends ColumnBase {
  type: 'number';
  min?: number;
  max?: number;
}

export interface DateColumn extends ColumnBase {
  type: 'date';
}

export interface ImageColumn extends ColumnBase {
  type: 'image';
  multiple?: boolean;
  maxCount?: number;
  maxSizeMB?: number;
}

export interface OptionColumn extends ColumnBase {
  type: 'option';
  optionSetId: string;
  multiple?: boolean;
}

export interface FormulaColumn extends ColumnBase {
  type: 'formula';
  formula: string;
  dependsOn: string[];
  /** placeholder type to render — defaults to text */
  output?: 'text' | 'number' | 'date';
}

export interface AutonumberColumn extends ColumnBase {
  /**
   * Read-only 1-based sequence number computed from the row's position in
   * the table. Re-numbered automatically when rows are added or deleted.
   */
  type: 'autonumber';
}

export type Column =
  | TextColumn
  | NumberColumn
  | DateColumn
  | ImageColumn
  | OptionColumn
  | FormulaColumn
  | AutonumberColumn;

export interface TableSchema {
  id: string;
  name: string;
  schemaVersion: number;
  columns: Column[];
  optionSets: Record<string, string[]>;
}

export type CellValue =
  | string
  | number
  | string[]
  | { assetId: string; ext: string; originalName: string }
  | { assetId: string; ext: string; originalName: string }[]
  | null;

export interface Row {
  id: string;
  createdAt: string;
  createdBy: string;
  values: Record<string, CellValue>;
}

export interface RowsFile {
  rows: Row[];
}

export interface UsersFile {
  users: User[];
}

export interface AuditEntry {
  ts: string;
  actor: string;
  role: Role;
  action: string;
  tableId?: string;
  rowId?: string;
  details?: Record<string, unknown>;
}

export interface JwtPayload {
  sub: string;
  role: Role;
  name: string;
}