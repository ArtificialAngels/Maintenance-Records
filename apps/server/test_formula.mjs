import { Parser } from 'expr-eval';
const p = new Parser({ operators: { add: true, comparison: true, conditional: true } });
const F = {
  WEEKNUM: (d) => {
    console.log('  WEEKNUM called with:', JSON.stringify(d), typeof d);
    if (d == null || d === '') return null;
    return 17;
  },
};
for (const [n, fn] of Object.entries(F)) {
  p.functions[n.toUpperCase()] = fn;
  p.functions[n.toLowerCase()] = fn;
}

const tests = [
  '("2026-05-20"=="") ? "" : WEEKNUM("2026-05-20")',
  '(""=="") ? "EMPTY" : WEEKNUM("2026-05-20")',
  'WEEKNUM("2026-05-20")',
  'WEEKNUM("")',
];
for (const t of tests) {
  try {
    const e = p.parse(t);
    console.log(`[${t}] =>`, JSON.stringify(e.evaluate({})));
  } catch (err) {
    console.log(`[${t}] => ERROR:`, err.message);
  }
}