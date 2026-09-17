/**
 * Import the user's existing Excel "计划外维修汇总登记表.xlsx" into our
 * JSON tables. Maps each maintenance sheet's columns by header name.
 *
 * Usage: pnpm import-xlsx -- --file <path.xlsx> [--dry-run]
 *
 * The importer auto-detects which sheets map to which target tables by
 * matching a small set of distinctive headers, then writes rows into the
 * corresponding rows.json (appending).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import xlsxPkg from 'xlsx';
import { nanoid } from 'nanoid';

// xlsx ships CommonJS; the `module` field has an ESM build but pnpm hoisting
// picks up the CJS entry by default. Dynamic-import unwraps it cleanly.
const XLSX: typeof import('xlsx') = xlsxPkg as unknown as typeof import('xlsx');
import { paths } from '../storage/paths.js';
import { readJson, writeJson, listDirs, ensureDir } from '../storage/fs.js';
import { tableWriteMutex } from '../storage/mutex.js';
import { audit } from '../audit/log.js';
import type { CellValue, Row, RowsFile } from '../types.js';

interface SheetImport {
  /** Sheet name in the source workbook */
  sourceSheet: string;
  /** Target table id in our data dir */
  targetTableId: string;
  /** Header (source) → column id (target) */
  headerMap: Record<string, string>;
}

const IMPORTS: SheetImport[] = [
  {
    sourceSheet: '__AUTO__unplanned',
    targetTableId: 'unplanned',
    headerMap: {
      序号: 'serial_no',
      部门: 'department',
      起始时间: 'start_date',
      产品: 'product',
      部件: 'part',
      编号: 'drawing_no',
      制作类型: 'product_type',
      紧急程度: 'urgency',
      打磨: 'hours_polish',
      拆模: 'hours_dismantle',
      烧焊: 'hours_weld',
      装夹: 'hours_clamp',
      深孔: 'hours_deep_hole',
      三轴CNC: 'hours_cnc_3axis',
      五轴CNC: 'hours_cnc_5axis',
      电火花设备: 'hours_edm',
      电火花: 'hours_edm',
      线切割设备: 'hours_wirecut',
      线切割: 'hours_wirecut',
      钳工: 'hours_fitter',
      检验: 'hours_inspect',
      备注: 'notes',
      完工日期: 'complete_date',
      工艺员: 'reporter',
      填报员: 'reporter',
    },
  },
  {
    sourceSheet: '__AUTO__equipment',
    targetTableId: 'equipment',
    headerMap: {
      序号: 'serial_no',
      部门: 'department',
      起始时间: 'start_date',
      备件描述: 'spare_part_desc',
      产品名称: 'product_name',
      类别: 'category',
      制作类型: 'product_type',
      紧急程度: 'urgency',
      打磨: 'hours_polish',
      拆模: 'hours_dismantle',
      烧焊: 'hours_weld',
      装夹: 'hours_clamp',
      深孔: 'hours_deep_hole',
      三轴CNC: 'hours_cnc_3axis',
      五轴CNC: 'hours_cnc_5axis',
      电火花设备: 'hours_edm',
      电火花: 'hours_edm',
      线切割设备: 'hours_wirecut',
      线切割: 'hours_wirecut',
      钳工: 'hours_fitter',
      检验: 'hours_inspect',
      成本中心号: 'cost_center',
    },
  },
  {
    sourceSheet: '__AUTO__mold_install',
    targetTableId: 'mold_install',
    headerMap: {
      序号: 'serial_no',
      部门: 'department',
      起始时间: 'start_date',
      备件描述: 'spare_part_desc',
      产品名称: 'product_name',
      类别: 'category',
      制作类型: 'product_type',
      紧急程度: 'urgency',
      打磨: 'hours_polish',
      拆模: 'hours_dismantle',
      烧焊: 'hours_weld',
      装夹: 'hours_clamp',
      深孔: 'hours_deep_hole',
      三轴CNC: 'hours_cnc_3axis',
      五轴CNC: 'hours_cnc_5axis',
      电火花设备: 'hours_edm',
      电火花: 'hours_edm',
      线切割设备: 'hours_wirecut',
      线切割: 'hours_wirecut',
      钳工: 'hours_fitter',
      检验: 'hours_inspect',
      成本中心号: 'cost_center',
    },
  },
];

interface Args {
  file: string;
  dryRun: boolean;
  actor: string;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const fileIdx = argv.indexOf('--file');
  const file = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const dryRun = argv.includes('--dry-run');
  const actorIdx = argv.indexOf('--actor');
  const actor = actorIdx >= 0 ? (argv[actorIdx + 1] ?? 'importer') : 'importer';
  if (!file) {
    // eslint-disable-next-line no-console
    console.error('Usage: pnpm import-xlsx -- --file <path.xlsx> [--dry-run] [--actor <id>]');
    process.exit(2);
  }
  return { file, dryRun, actor };
}

/**
 * SheetJS returns dates as JS Date objects when `cellDates: true`.
 * Returns YYYY-MM-DD for date values, or the original value otherwise.
 */
function normalizeCellValue(v: unknown): unknown {
  if (v instanceof Date) {
    const iso = v.toISOString();
    return iso.slice(0, 10);
  }
  if (typeof v === 'string') return v.trim();
  return v;
}

function isLikelyDateColumn(header: string): boolean {
  return /(起始时间|完工时间|完工日期|时间|日期)$/.test(header);
}

/** Detect which of our 3 import configs matches a given source sheet name. */
function matchImport(sourceSheetName: string, sampleRow: Record<string, unknown>): SheetImport | null {
  const lower = sourceSheetName.toLowerCase();
  const headers = Object.keys(sampleRow);
  const has = (h: string): boolean => headers.includes(h);

  // 计划外制作清单: has 产品 + 部件 but NOT 备件描述
  if (has('部件') && has('产品') && !has('备件描述')) {
    const cfg = IMPORTS[0]!;
    cfg.sourceSheet = sourceSheetName;
    return cfg;
  }
  // 设备备件: has 备件描述 + 类别 but NOT 部件
  if (has('备件描述') && has('类别') && !has('部件')) {
    // Heuristic: 工装夹具 vs 设备备件 — same shape, but 工装夹具 usually has
    // "技术部" / "模具中心" rows; 设备备件 has "娄塘基地" / "昆山公司" rows.
    // We default to mold_install if a sample row maps to "工具" / "夹具" category.
    const categoryVal = String(sampleRow['类别'] ?? '');
    const cfg = IMPORTS[categoryVal === '工具' || categoryVal === '夹具' || categoryVal === '检具' ? 2 : 1]!;
    cfg.sourceSheet = sourceSheetName;
    return cfg;
  }
  // Fallback: name-based
  if (lower.includes('计划外') || lower.includes('unplanned')) return Object.assign(IMPORTS[0]!, { sourceSheet: sourceSheetName });
  if (lower.includes('工装') || lower.includes('mold')) return Object.assign(IMPORTS[2]!, { sourceSheet: sourceSheetName });
  if (lower.includes('设备') || lower.includes('equipment')) return Object.assign(IMPORTS[1]!, { sourceSheet: sourceSheetName });

  return null;
}

async function main() {
  const args = parseArgs();
  const xlsxPath = path.resolve(args.file);
  try {
    await fs.access(xlsxPath);
  } catch {
    // eslint-disable-next-line no-console
    console.error(`File not found: ${xlsxPath}`);
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log(`📄 Reading ${xlsxPath}${args.dryRun ? ' (dry-run)' : ''}`);

  const wb = XLSX.readFile(xlsxPath, { cellDates: true });
  // eslint-disable-next-line no-console
  console.log(`   Sheets: ${wb.SheetNames.join(' | ')}`);

  let totalImported = 0;
  for (const sheetName of wb.SheetNames) {
    if (sheetName.startsWith('_')) continue; // skip archived / metadata sheets
    if (sheetName === 'Production' || sheetName === 'Setting') continue; // skip lookup tables

    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    // ref-based row extraction keeps ordering and types
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: true });
    if (rows.length === 0) continue;

    // Build header → first-non-null-value map for detection
    const sampleRow: Record<string, unknown> = {};
    for (const row of rows) {
      for (const [k, v] of Object.entries(row)) {
        if (v != null && v !== '' && !(sampleRow as Record<string, unknown>)[k]) {
          (sampleRow as Record<string, unknown>)[k] = v;
        }
      }
    }

    const cfg = matchImport(sheetName, sampleRow);
    if (!cfg) {
      // eslint-disable-next-line no-console
      console.log(`   ⏭  Skipping sheet "${sheetName}" (no matching import config)`);
      continue;
    }

    // eslint-disable-next-line no-console
    console.log(`   📋 Sheet "${sheetName}" → table "${cfg.targetTableId}"`);

    const newRows: Row[] = [];
    for (const row of rows) {
      const values: Record<string, CellValue> = {};
      let mapped = 0;
      for (const [srcHeader, srcValue] of Object.entries(row)) {
        if (srcValue == null || srcValue === '') continue;
        const targetId = cfg.headerMap[srcHeader];
        if (!targetId) continue;
        let v = normalizeCellValue(srcValue);
        if (isLikelyDateColumn(srcHeader) && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
          v = v.slice(0, 10);
        }
        // Coerce numbers for hour columns
        if (targetId.startsWith('hours_')) {
          const n = Number(v);
          if (!Number.isFinite(n) || n === 0) continue;
          v = n;
        }
        // Coerce number for serial
        if (targetId === 'serial_no') {
          v = String(v);
        }
        values[targetId] = v as CellValue;
        mapped++;
      }
      if (mapped === 0) continue;
      // Skip near-empty template rows (only serial_no populated)
      const meaningful = ['start_date', 'department', 'product', 'product_name'];
      if (!meaningful.some((k) => k in values && values[k as keyof typeof values] != null)) {
        continue;
      }
      newRows.push({
        id: `imp_${nanoid(10)}`,
        createdAt: new Date().toISOString(),
        createdBy: args.actor,
        values,
      });
    }

    // eslint-disable-next-line no-console
    console.log(`      → ${newRows.length} row(s) ready`);
    if (!args.dryRun) totalImported += newRows.length;
    if (args.dryRun) continue;
    if (newRows.length === 0) continue;

    await tableWriteMutex.run(`table:${cfg.targetTableId}`, async () => {
      const existing = (await readJson<RowsFile>(paths.rowsFile(cfg.targetTableId))) ?? { rows: [] };
      existing.rows.push(...newRows);
      await ensureDir(paths.tableDir(cfg.targetTableId));
      await writeJson(paths.rowsFile(cfg.targetTableId), existing);
    });
    await audit({
      actor: args.actor,
      role: 'admin',
      action: 'row.import',
      tableId: cfg.targetTableId,
      details: { source: path.basename(xlsxPath), count: newRows.length },
    });
  }
  if (args.dryRun) {
    // Already printed per-sheet; nothing more.
  }

  // eslint-disable-next-line no-console
  console.log(`\n${args.dryRun ? 'DRY-RUN: would import' : '✅ Imported'} ${totalImported} row(s) total.`);
  // eslint-disable-next-line no-console
  console.log(`📁 Data dir: ${paths.root()}`);

  // Surface tables that exist on disk but weren't touched (sanity)
  const tablesDir = path.join(paths.root(), 'tables');
  const all = await listDirs(tablesDir);
  // eslint-disable-next-line no-console
  console.log(`   Tables on disk: ${all.filter((d) => !d.startsWith('_')).join(', ')}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});