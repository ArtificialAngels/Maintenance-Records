import dayjs from 'dayjs';
import { Parser, type Expression } from 'expr-eval';

/**
 * Functions injected into the formula parser. Additions are kept additive and
 * side-effect free so the formula sandbox remains safe.
 */
const FUNCTIONS: Record<string, (...args: unknown[]) => unknown> = {
  NOW: () => new Date().toISOString(),
  TODAY: () => dayjs().format('YYYY-MM-DD'),
  // WEEKNUM(d) — week number of date (string/number/Date).
  // Manual Sunday-start calculation; avoids the weekOfYear plugin.
  WEEKNUM: ((d: unknown) => {
    if (d == null || d === '') return null;
    const dt = dayjs(d as string | number | Date);
    if (!dt.isValid()) return null;
    const year = dt.year();
    const startOfYear = dayjs(`${year}-01-01`);
    const dayOfYear = Math.floor(
      (dt.valueOf() - startOfYear.valueOf()) / 86400000,
    ) + 1;
    return Math.ceil((dayOfYear + startOfYear.day()) / 7);
  }) as (...args: unknown[]) => unknown,
  // MONTH(d) — 1..12
  MONTH: ((d: unknown) => {
    if (d == null || d === '') return null;
    const dt = dayjs(d as string | number | Date);
    if (!dt.isValid()) return null;
    return dt.month() + 1;
  }) as (...args: unknown[]) => unknown,
  DATEADD: ((date: unknown, days: unknown, unit: unknown = 'day') => {
    const d = dayjs(date as string | number);
    return d.add(days as number, unit as dayjs.ManipulateType).format('YYYY-MM-DD');
  }) as (...args: unknown[]) => unknown,
  DATEDIF: ((start: unknown, end: unknown, unit: unknown = 'day') => {
    const s = dayjs(start as string | number);
    const e = dayjs(end as string | number);
    return e.diff(s, unit as dayjs.ManipulateType);
  }) as (...args: unknown[]) => unknown,
  CONCAT: (...parts: unknown[]) =>
    parts
      .map((p) => (p == null ? '' : String(p)))
      .join(''),
  COALESCE: (...parts: unknown[]) => {
    for (const p of parts) {
      if (p !== null && p !== undefined && p !== '') return p;
    }
    return null;
  },
  IF: (cond: unknown, a: unknown, b: unknown) => (cond ? a : b),
  AND: (...parts: unknown[]) => parts.every((p) => Boolean(p)),
  OR: (...parts: unknown[]) => parts.some((p) => Boolean(p)),
  NOT: (v: unknown) => !v,
  ROUND: ((n: unknown, digits: unknown = 0) => {
    const factor = Math.pow(10, digits as number);
    return Math.round((n as number) * factor) / factor;
  }) as (...args: unknown[]) => unknown,
  // Variadic sum (treat null/undefined as 0) — for column-by-column totals.
  SUMARGS: (...args: unknown[]) => {
    let sum = 0;
    for (const a of args) {
      if (a == null || a === '') continue;
      const n = Number(a);
      if (Number.isFinite(n)) sum += n;
    }
    return sum;
  },
};

let cachedParser: Parser | null = null;
function getParser(): Parser {
  if (cachedParser) return cachedParser;
  const parser = new Parser({
    operators: {
      add: true,
      comparison: true,
      concatenate: true,
      conditional: true,
      divide: true,
      factorial: true,
      in: true,
      logical: true,
      multiply: true,
      power: true,
      remainder: true,
      subtract: true,
    },
  });
  for (const [name, fn] of Object.entries(FUNCTIONS)) {
    parser.functions[name] = fn as (...args: unknown[]) => unknown;
  }
  cachedParser = parser;
  return parser;
}

/**
 * Substitute `{{col_id}}` placeholders with bare identifiers so expr-eval
 * treats them as variable references (which we pass in via `refs`).
 */
export function expandPlaceholders(formula: string): string {
  return formula.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, '$1');
}

/**
 * Parse and compile a formula string. Throws on syntax error.
 */
export function compileFormula(formula: string): Expression {
  const parser = getParser();
  return parser.parse(expandPlaceholders(formula));
}

/**
 * Replace {{col_id}} placeholders with their evaluated values, then evaluate.
 * Reference values are coerced to numbers if the original column type is number,
 * otherwise left as-is (string/null/object).
 */
export function evaluateFormula(
  formula: string,
  refs: Record<string, unknown>,
): unknown {
  const expr = compileFormula(formula);
  // expr-eval's evaluate expects a specific Value type; cast through unknown.
  return expr.evaluate(refs as unknown as Parameters<typeof expr.evaluate>[0]);
}

/**
 * Quick syntax check without evaluating — for the editor live-preview.
 */
export function validateFormulaSyntax(formula: string): { ok: true } | { ok: false; error: string } {
  try {
    compileFormula(formula);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}