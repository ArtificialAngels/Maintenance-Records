export type Role = 'admin' | 'user';

/** 单张表的权限：只读 / 可编辑 */
export type TableAccess = 'read' | 'write';

export type FieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'image'
  | 'option'
  | 'formula'
  | 'autonumber';

export interface User {
  id: string;
  name: string;
  role: Role;
  /** Whether a password hash is stored (admin user list only). */
  hasPassword?: boolean;
  /**
   * 每张表的权限。undefined = 旧版账号（所有表都可编辑）；
   * {} = 没有任何表格权限；管理员忽略此字段。
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
   * When true the column is hidden from the main grid and shown inside the
   * per-row secondary ("更多") menu instead. Only meaningful while visible=true.
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
  output?: 'text' | 'number' | 'date';
}

export interface AutonumberColumn extends ColumnBase {
  /** Read-only 1-based sequence number assigned by the server. */
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

export interface ImageAssetRef {
  assetId: string;
  ext: string;
  originalName: string;
}

export type CellValue =
  | string
  | number
  | string[]
  | ImageAssetRef
  | ImageAssetRef[]
  | null;

export interface Row {
  id: string;
  createdAt: string;
  createdBy: string;
  values: Record<string, CellValue>;
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