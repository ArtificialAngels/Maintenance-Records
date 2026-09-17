import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../logger.js';

/**
 * Ensure the directory exists. Creates intermediate dirs.
 */
export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Read a JSON file. Returns null if file does not exist.
 */
export async function readJson<T>(file: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(file, 'utf-8');
    return JSON.parse(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Atomically write JSON to a file: write to <file>.tmp, fsync, rename.
 * Survives crashes mid-write.
 */
export async function writeJson(file: string, data: unknown): Promise<void> {
  const dir = path.dirname(file);
  await ensureDir(dir);
  const tmp = `${file}.tmp`;
  const json = JSON.stringify(data, null, 2);
  const handle = await fs.open(tmp, 'w');
  try {
    await handle.writeFile(json, 'utf-8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(tmp, file);
}

/**
 * Append a line to a JSONL file. Caller is expected to hold the mutex for the resource.
 */
export async function appendJsonl(file: string, line: unknown): Promise<void> {
  const dir = path.dirname(file);
  await ensureDir(dir);
  const text = `${JSON.stringify(line)}\n`;
  await fs.appendFile(file, text, 'utf-8');
}

/**
 * List directory entries (names only), sorted alphabetically.
 */
export async function listDirs(parent: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(parent, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export function logFsError(scope: string, err: unknown): void {
  logger.error({ scope, err }, 'filesystem error');
}