import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { paths } from '../storage/paths.js';
import { writeJson, ensureDir } from '../storage/fs.js';
import type { RowsFile, TableSchema, Column } from '../types.js';

interface SeedDicts {
  units: string[];
  equip_types: string[];
  repair_contents: string[];
  urgencies: string[];
  type_names: string[];
  products: string[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const seedData = JSON.parse(
  await fs.readFile(path.join(__dirname, 'seed-data.json'), 'utf-8'),
) as SeedDicts;

// ---------- Column builders ----------

const editableAll: Column['editableByRoles'] = ['admin', 'user'];

function textCol(id: string, name: string): Column {
  return { id, name, type: 'text', visible: true, editableByRoles: editableAll };
}
function numberCol(id: string, name: string): Column {
  return { id, name, type: 'number', visible: true, editableByRoles: editableAll };
}
function dateCol(id: string, name: string, required = false): Column {
  return {
    id, name, type: 'date', visible: true, required,
    editableByRoles: editableAll,
  };
}
function optionCol(id: string, name: string, optionSetId: string, required = false): Column {
  return {
    id, name, type: 'option', optionSetId, visible: true,
    required, editableByRoles: editableAll,
  };
}
function imageCol(id: string, name: string): Column {
  return {
    id, name, type: 'image', multiple: true, maxCount: 10, maxSizeMB: 5,
    visible: true, editableByRoles: editableAll,
  };
}
function formulaCol(
  id: string, name: string, formula: string, dependsOn: string[],
  output: 'number' | 'date' = 'number',
): Column {
  return {
    id, name, type: 'formula', formula, dependsOn, output,
    visible: true, editableByRoles: [],
  };
}

// ---------- Hours columns (11 工序 — covers BOTH Sheet 1 打磨 and Sheet 2/3 拆模) ----------
const HOUR_COLS = [
  ['hours_polish', '打磨'],
  ['hours_dismantle', '拆模'],
  ['hours_weld', '烧焊'],
  ['hours_clamp', '装夹'],
  ['hours_deep_hole', '深孔'],
  ['hours_cnc_3axis', '三轴CNC'],
  ['hours_cnc_5axis', '五轴CNC'],
  ['hours_edm', '电火花'],
  ['hours_wirecut', '线切割'],
  ['hours_fitter', '钳工'],
  ['hours_inspect', '检验'],
] as const;

function hoursColumns(): Column[] {
  return HOUR_COLS.map(([id, name]) => numberCol(id, name));
}

function imageColumns(): Column[] {
  return [
    imageCol('photo_before', '修复前'),
    imageCol('photo_approval', '修复认可'),
    imageCol('photo_after', '修复后'),
  ];
}

function totalHoursFormula(): Column {
  const refs = HOUR_COLS.map(([id]) => `{{${id}}}`).join(',');
  return formulaCol(
    'total_hours', '工时合计',
    `SUMARGS(${refs})`,
    HOUR_COLS.map(([id]) => id),
    'number',
  );
}

function weekFormula(): Column {
  // expr-eval uses ternary for conditional; WEEKNUM returns null for empty.
  return formulaCol(
    'week_num', '周',
    "({{start_date}}=='') ? null : WEEKNUM({{start_date}})",
    ['start_date'], 'number',
  );
}
function monthFormula(): Column {
  return formulaCol(
    'month_num', '月',
    "({{start_date}}=='') ? null : MONTH({{start_date}})",
    ['start_date'], 'number',
  );
}

// ---------- Common columns for 表 1 (计划外制作清单) ----------
function unplannedColumns(): Column[] {
  return [
    textCol('report_no', '单据号'),
    textCol('serial_no', '序号'),
    optionCol('department', '部门', 'units', true),
    dateCol('start_date', '起始时间', true),
    optionCol('product', '产品', 'products'),
    textCol('part', '部件'),
    textCol('drawing_no', '编号'),
    optionCol('product_type', '制作类型', 'repair_contents'),
    optionCol('urgency', '紧急程度', 'urgencies'),
    ...hoursColumns(),
    textCol('notes', '备注'),
    dateCol('complete_date', '完工日期'),
    textCol('reporter', '工艺员'),
    totalHoursFormula(),
    weekFormula(),
    monthFormula(),
    ...imageColumns(),
  ];
}

// ---------- Common columns for 表 2/3 (设备备件 / 工装夹具) ----------
function equipmentColumns(): Column[] {
  return [
    textCol('report_no', '单据号'),
    textCol('serial_no', '序号'),
    optionCol('department', '部门', 'units', true),
    dateCol('start_date', '起始时间', true),
    textCol('spare_part_desc', '备件描述'),
    optionCol('product_name', '产品名称', 'products'),
    optionCol('category', '类别', 'equip_types'),
    optionCol('product_type', '制作类型', 'repair_contents'),
    optionCol('urgency', '紧急程度', 'urgencies'),
    ...hoursColumns(),
    textCol('cost_center', '成本中心号'),
    totalHoursFormula(),
    weekFormula(),
    monthFormula(),
    ...imageColumns(),
  ];
}

function unplannedSchema(): TableSchema {
  return {
    id: 'unplanned',
    name: '计划外制作清单',
    schemaVersion: 1,
    columns: unplannedColumns(),
    optionSets: baseOptionSets(),
  };
}

function equipmentSchema(): TableSchema {
  return {
    id: 'equipment',
    name: '设备备件',
    schemaVersion: 1,
    columns: equipmentColumns(),
    optionSets: baseOptionSets(),
  };
}

function moldInstallSchema(): TableSchema {
  return {
    id: 'mold_install',
    name: '工装夹具',
    schemaVersion: 1,
    columns: equipmentColumns(),
    optionSets: baseOptionSets(),
  };
}

function baseOptionSets() {
  return {
    units: seedData.units,
    equip_types: seedData.equip_types,
    repair_contents: seedData.repair_contents,
    urgencies: seedData.urgencies,
    type_names: seedData.type_names,
    products: seedData.products,
  };
}

// ---------- Sample rows from the user's actual Excel ----------
const unplannedRows: RowsFile = {
  rows: [
    {
      id: 'u_seed_001',
      createdAt: new Date().toISOString(),
      createdBy: 'u_admin',
      values: {
        serial_no: '1',
        department: '广德公司',
        start_date: '2026-05-20',  // Excel serial 45768 ≈ 2025-05-19, but we'll use the visible year context
        product: 'MAJOR侧芯链轮芯2#',
        part: '下模',
        product_type: '维修',
        urgency: '正常',
        hours_polish: 0,
        hours_dismantle: 0,
        hours_weld: 0,
        hours_clamp: 0,
        hours_deep_hole: 0,
        hours_cnc_3axis: 30,
        hours_cnc_5axis: 0,
        hours_edm: 4,
        hours_wirecut: 0,
        hours_fitter: 4,
        hours_inspect: 2,
        complete_date: '2026-11-25',  // Excel serial 46146
        reporter: '邓建伟',
      },
    },
  ],
};

const equipmentRows: RowsFile = {
  rows: [
    {
      id: 'e_seed_001',
      createdAt: new Date().toISOString(),
      createdBy: 'u_admin',
      values: {
        serial_no: '1',
        department: '娄塘基地',
        start_date: '2025-01-19',  // Excel serial 45661
        spare_part_desc: '120结构件平爪尺',
        product_name: '120结构件平爪尺',
        category: '设备备件',
        product_type: '新制',
        urgency: '正常',
        hours_polish: 0,
        hours_dismantle: 0,
        hours_weld: 0,
        hours_clamp: 2,
        hours_deep_hole: 0,
        hours_cnc_3axis: 8,
        hours_cnc_5axis: 0,
        hours_edm: 2,
        hours_wirecut: 0,
        hours_fitter: 1,
        hours_inspect: 1,
      },
    },
  ],
};

const moldInstallRows: RowsFile = {
  rows: [
    {
      id: 'm_seed_001',
      createdAt: new Date().toISOString(),
      createdBy: 'u_admin',
      values: {
        serial_no: '1',
        department: '技术部',
        start_date: '2026-01-08',  // Excel serial 46045
        spare_part_desc: '整形工具',
        product_name: '蔚来ALPS后纵梁',
        category: '工具',
        product_type: '新制',
        urgency: '正常',
        hours_polish: 0,
        hours_dismantle: 0,
        hours_weld: 0,
        hours_clamp: 4,
        hours_deep_hole: 0,
        hours_cnc_3axis: 12,
        hours_cnc_5axis: 0,
        hours_edm: 0,
        hours_wirecut: 0,
        hours_fitter: 1,
        hours_inspect: 1,
        cost_center: '20040101',
      },
    },
  ],
};

async function main() {
  const tables = [
    { schema: unplannedSchema(), rows: unplannedRows },
    { schema: equipmentSchema(), rows: equipmentRows },
    { schema: moldInstallSchema(), rows: moldInstallRows },
  ];

  for (const { schema, rows } of tables) {
    await ensureDir(paths.tableDir(schema.id));
    await writeJson(paths.schemaFile(schema.id), schema);
    await writeJson(paths.rowsFile(schema.id), rows);
    // eslint-disable-next-line no-console
    console.log(
      `✅ Seeded "${schema.name}" (${schema.id}) — ${schema.columns.length} columns, ${rows.rows.length} row(s)`,
    );
  }
  // eslint-disable-next-line no-console
  console.log(`📁 Data dir: ${paths.root()}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});