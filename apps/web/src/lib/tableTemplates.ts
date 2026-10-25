import type { Column, Role, TableSchema } from './types';

const EDITABLE_ALL: Role[] = ['admin', 'user'];

/** Option sets that ship with the default template. */
export const TEMPLATE_OPTION_SETS: Record<string, string[]> = {
  status_options: ['待处理', '处理中', '已完成', '已取消'],
};

export interface TemplateColumn {
  /** Stable key used by the create dialog's checkboxes. */
  key: string;
  /** Short description shown next to the column in the dialog. */
  hint: string;
  column: Column;
}

/**
 * Default columns for a newly created table. They match the maintenance-record
 * workflow described in docs/plan.md, and give editors something usable
 * immediately instead of an empty sheet.
 */
export const NEW_TABLE_TEMPLATE: TemplateColumn[] = [
  {
    key: 'serial_no',
    hint: '自动递增',
    column: {
      id: 'serial_no',
      name: '序号',
      type: 'autonumber',
      visible: true,
      editableByRoles: [],
    },
  },
  {
    key: 'report_date',
    hint: '必填',
    column: {
      id: 'report_date',
      name: '报修日期',
      type: 'date',
      visible: true,
      required: true,
      editableByRoles: EDITABLE_ALL,
    },
  },
  {
    key: 'description',
    hint: '必填',
    column: {
      id: 'description',
      name: '故障描述',
      type: 'text',
      visible: true,
      required: true,
      editableByRoles: EDITABLE_ALL,
    },
  },
  {
    key: 'photos',
    hint: '支持多图',
    column: {
      id: 'photos',
      name: '现场照片',
      type: 'image',
      visible: true,
      multiple: true,
      maxCount: 6,
      maxSizeMB: 10,
      editableByRoles: EDITABLE_ALL,
    },
  },
  {
    key: 'status',
    hint: '待处理 / 处理中 / 已完成',
    column: {
      id: 'status',
      name: '状态',
      type: 'option',
      optionSetId: 'status_options',
      visible: true,
      editableByRoles: EDITABLE_ALL,
    },
  },
  {
    key: 'cost',
    hint: '金额',
    column: {
      id: 'cost',
      name: '维修费用',
      type: 'number',
      visible: true,
      editableByRoles: EDITABLE_ALL,
    },
  },
  {
    key: 'notes',
    hint: '选填',
    column: {
      id: 'notes',
      name: '备注',
      type: 'text',
      visible: true,
      editableByRoles: EDITABLE_ALL,
    },
  },
];

export const FIELD_TYPE_LABEL: Record<string, string> = {
  text: '文本',
  number: '数字',
  date: '日期',
  image: '图片',
  option: '选项',
  formula: '公式',
  autonumber: '自动序号',
};

/** Turn a display name into a URL-safe table id (may be empty for e.g. Chinese names). */
export function slugifyTableId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[-_]+|[-_]+$/g, '');
}

export function buildNewTableSchema(input: {
  id: string;
  name: string;
  templateKeys: string[];
}): TableSchema {
  const selected = new Set(input.templateKeys);
  const columns = NEW_TABLE_TEMPLATE.filter((t) => selected.has(t.key)).map(
    (t) => structuredClone(t.column),
  );

  // Only keep option sets that are actually referenced by a selected column.
  const optionSets: Record<string, string[]> = {};
  for (const col of columns) {
    if (col.type === 'option') {
      const values = TEMPLATE_OPTION_SETS[col.optionSetId];
      if (values) optionSets[col.optionSetId] = [...values];
    }
  }

  return {
    id: input.id,
    name: input.name.trim(),
    schemaVersion: 1,
    columns,
    optionSets,
  };
}
