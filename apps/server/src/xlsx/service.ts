/**
 * Excel (.xlsx) import / export for a single table.
 *
 * Export writes one sheet whose first row holds the column names. Image columns
 * are skipped entirely (binary assets don't belong in a spreadsheet), and
 * formula/autonumber values are written as computed values so the file reads
 * naturally.
 *
 * Import is header-driven: each header is matched against the table's column
 * names (then ids), so a file exported from here round-trips, and a hand-made
 * file works as long as the headers match. Unknown headers are reported back.
 */
import xlsxPkg from 'xlsx';
import type { CellValue, Column, Role, Row, TableSchema } from '../types.js';
import { canReadColumn, canWriteColumn } from '../permissions/check.js';

// xlsx ships CommonJS; unwrap the namespace for the ESM build.
const XLSX: typeof import('xlsx') = xlsxPkg as unknown as typeof import('xlsx');

const MAX_SHEET_NAME = 31;

function safeSheetName(name: string): string {
  // Excel forbids []:*?/\ in sheet names and caps them at 31 chars.
  const cleaned = name.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim();
  return (cleaned || '数据').slice(0, MAX_SHEET_NAME);
}

/**
 * Format a Date as YYYY-MM-DD using local calendar parts. Excel dates are
 * timezone-free, so converting through toISOString() would shift the day for
 * users east of UTC (e.g. a 2026-10-20 cell becoming 2026-10-19).
 */
function isoDate(d: Date): string | null {
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatCell(col: Column, v: CellValue | undefined): string | number | null {
  if (v == null || v === '') return null;
  switch (col.type) {
    case 'number':
    case 'autonumber': {
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    }
    case 'formula':
      return typeof v === 'number' ? v : String(v);
    case 'date':
      return String(v).slice(0, 10);
    case 'image':
      // Handled by the caller (image columns are not exported).
      return null;
    default: {
      if (Array.isArray(v)) {
        return v
          .map((item) =>
            typeof item === 'string' ? item : (item as { originalName?: string }).originalName ?? '',
          )
          .filter(Boolean)
          .join('、');
      }
      if (typeof v === 'object') {
        return (v as { originalName?: string }).originalName ?? null;
      }
      return typeof v === 'number' ? v : String(v);
    }
  }
}

/** Excel serial date (1900 system) → YYYY-MM-DD. */
function serialToIso(n: number): string | null {
  if (!Number.isFinite(n)) return null;
  // Excel serials carry no timezone; do the arithmetic in UTC and read the
  // UTC parts so the local timezone can't shift the calendar day.
  const ms = Math.round((n - 25569) * 86_400_000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateCell(raw: unknown): string | null {
  if (raw instanceof Date) return isoDate(raw);
  if (typeof raw === 'number') return serialToIso(raw);
  const s = String(raw).trim();
  if (!s) return null;
  // 2026-10-25 / 2026/10/25 / 2026.10.25 / 2026年10月25日
  let m = /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/.exec(s);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  // 10/25/2026 (US style) — only used when the year trails.
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  if (m) {
    const [, mo, d, y] = m;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : isoDate(parsed);
}

function parseNumberCell(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const s = String(raw).replace(/[,，\s]/g, '').replace(/[¥￥$]/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function splitMulti(raw: string): string[] {
  return raw
    .split(/[、,，;；/|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Coerce a raw spreadsheet cell into the value shape the column expects. */
function coerceCell(col: Column, raw: unknown): CellValue | undefined {
  if (raw == null || raw === '') return undefined;
  switch (col.type) {
    // Server-computed / binary columns never round-trip through Excel.
    case 'image':
    case 'formula':
    case 'autonumber':
      return undefined;
    case 'number': {
      const n = parseNumberCell(raw);
      return n == null ? undefined : n;
    }
    case 'date': {
      const d = parseDateCell(raw);
      return d ?? undefined;
    }
    case 'option': {
      const text = String(raw).trim();
      if (!text) return undefined;
      if (col.multiple) {
        const parts = splitMulti(text);
        return parts.length > 0 ? parts : undefined;
      }
      return text;
    }
    default: {
      if (raw instanceof Date) return isoDate(raw) ?? undefined;
      if (typeof raw === 'number') return String(raw);
      const text = String(raw).trim();
      return text || undefined;
    }
  }
}

function normalizeHeader(s: string): string {
  return s
    .replace(/[\s\u3000]/g, '')
    .replace(/[＊*]/g, '')
    .toLowerCase();
}

/**
 * Build a lookup from normalized header text to column.
 * Accepts the plain column name, the column id, and the disambiguated
 * "name (id)" form used when a table has duplicate column names.
 */
function buildHeaderLookup(
  schema: TableSchema,
  role: Role,
): { importable: Map<string, Column>; ignored: Map<string, Column> } {
  const importable = new Map<string, Column>();
  const ignored = new Map<string, Column>();
  for (const col of schema.columns) {
    const target = importableTarget(col, role) ? importable : ignored;
    target.set(normalizeHeader(col.name), col);
    target.set(normalizeHeader(col.id), col);
    target.set(normalizeHeader(`${col.name}(${col.id})`), col);
  }
  return { importable, ignored };
}

/** Columns that can actually receive a value from a spreadsheet. */
function importableTarget(col: Column, role: Role): boolean {
  if (col.type === 'image' || col.type === 'formula' || col.type === 'autonumber') {
    return false;
  }
  return role === 'admin' || canWriteColumn(col, role);
}

function resolveHeader(header: string, lookup: Map<string, Column>): Column | null {
  const direct = lookup.get(normalizeHeader(header));
  if (direct) return direct;
  // "名称 (col_id)" → try the parenthesised id, then the bare name.
  const m = /\(([^()]+)\)\s*$/.exec(header);
  if (m?.[1]) {
    const byId = lookup.get(normalizeHeader(m[1]));
    if (byId) return byId;
    const bare = lookup.get(normalizeHeader(header.slice(0, m.index)));
    if (bare) return bare;
  }
  return null;
}

// ---- Export ----

export function buildExportWorkbook(
  schema: TableSchema,
  rows: Row[],
  role: Role,
): Buffer {
  // Images are deliberately omitted from the workbook.
  const cols = schema.columns.filter((c) => c.type !== 'image' && canReadColumn(c, role));

  const used = new Set<string>();
  const headers = cols.map((col) => {
    let header = col.name.trim() || col.id;
    if (used.has(header)) header = `${header} (${col.id})`;
    let n = 2;
    while (used.has(header)) header = `${col.name} (${col.id}-${n++})`;
    used.add(header);
    return header;
  });

  const aoa: (string | number | null)[][] = [headers];
  for (const row of rows) {
    aoa.push(cols.map((col) => formatCell(col, row.values[col.id])));
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = headers.map((h) => ({
    wch: Math.min(40, Math.max(10, h.length * 2 + 2)),
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, safeSheetName(schema.name));
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

// ---- Import ----

export interface ImportRecord {
  /** 1-based row number in the spreadsheet, for error reporting. */
  rowNumber: number;
  values: Record<string, CellValue>;
}

export interface ParsedImport {
  records: ImportRecord[];
  /** Headers that did not match any writable column. */
  unmatchedHeaders: string[];
  /** Column names the importer expects, useful in the error message. */
  expectedHeaders: string[];
}

export function parseImportWorkbook(
  buffer: Buffer,
  schema: TableSchema,
  role: Role,
): ParsedImport {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = wb.SheetNames[0];
  const sheet = sheetName ? wb.Sheets[sheetName] : undefined;
  const { importable, ignored } = buildHeaderLookup(schema, role);
  const expectedHeaders = schema.columns
    .filter((c) => importableTarget(c, role))
    .map((c) => c.name);

  if (!sheet) {
    return { records: [], unmatchedHeaders: [], expectedHeaders };
  }

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
  });
  if (aoa.length === 0) {
    return { records: [], unmatchedHeaders: [], expectedHeaders };
  }

  const headerRow = aoa[0] ?? [];
  const columnsByIndex = headerRow.map((h) =>
    h == null || h === '' ? null : resolveHeader(String(h), importable),
  );
  const unmatchedHeaders = headerRow
    .map((h, i) => {
      if (h == null || h === '') return null;
      const text = String(h);
      if (columnsByIndex[i]) return null;
      // Headers for server-computed / image columns are expected and skipped
      // silently rather than reported as unrecognised.
      if (resolveHeader(text, ignored)) return null;
      return text.trim();
    })
    .filter((h): h is string => !!h);

  const records: ImportRecord[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const rawRow = aoa[i] ?? [];
    const values: Record<string, CellValue> = {};
    let filled = 0;
    for (let j = 0; j < rawRow.length; j++) {
      const col = columnsByIndex[j];
      if (!col) continue;
      const value = coerceCell(col, rawRow[j]);
      if (value === undefined) continue;
      values[col.id] = value;
      filled++;
    }
    if (filled === 0) continue;
    records.push({ rowNumber: i + 1, values });
  }

  return { records, unmatchedHeaders, expectedHeaders };
}
