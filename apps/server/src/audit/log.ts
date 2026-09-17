import { paths } from '../storage/paths.js';
import { appendJsonl, ensureDir } from '../storage/fs.js';
import type { AuditEntry } from '../types.js';

export async function audit(entry: Omit<AuditEntry, 'ts'>): Promise<void> {
  const full: AuditEntry = { ts: new Date().toISOString(), ...entry };
  try {
    await ensureDir(paths.root());
    await appendJsonl(paths.auditFile(), full);
  } catch (err) {
    // Audit must never break the main flow.
    // eslint-disable-next-line no-console
    console.error('audit write failed', err);
  }
}

export async function readAudit(limit = 200): Promise<AuditEntry[]> {
  const file = paths.auditFile();
  try {
    const text = await import('node:fs/promises').then((m) => m.readFile(file, 'utf-8'));
    const lines = text.trim().split('\n').filter(Boolean);
    const entries: AuditEntry[] = [];
    for (const line of lines) {
      try {
        entries.push(JSON.parse(line) as AuditEntry);
      } catch {
        // skip malformed
      }
    }
    return entries.slice(-limit).reverse();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}