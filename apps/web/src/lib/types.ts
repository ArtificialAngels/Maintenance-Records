export type Role = 'admin' | 'user';

export type FieldType = 'text' | 'number' | 'date' | 'image' | 'option' | 'formula';

export interface User {
  id: string;
  name: string;
  role: Role;
}

export interface ColumnBase {
  id: string;
  name: string;
  type: FieldType;
  visible: boolean;
  required?: boolean;
  editableByRoles: Role[];
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

export type Column =
  | TextColumn
  | NumberColumn
  | DateColumn
  | ImageColumn
  | OptionColumn
  | FormulaColumn;

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