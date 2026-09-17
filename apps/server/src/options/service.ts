import { paths } from '../storage/paths.js';
import { readJson, writeJson } from '../storage/fs.js';
import { tableWriteMutex } from '../storage/mutex.js';
import { audit } from '../audit/log.js';
import type { JwtPayload, TableSchema } from '../types.js';

export async function listOptionSets(
  tableId: string,
): Promise<Record<string, string[]>> {
  const schema = await readJson<TableSchema>(paths.schemaFile(tableId));
  return schema?.optionSets ?? {};
}

export async function listOptionSetKeys(tableId: string): Promise<string[]> {
  const sets = await listOptionSets(tableId);
  return Object.keys(sets);
}

export async function setOptionSet(
  tableId: string,
  key: string,
  values: string[],
  actor: JwtPayload,
): Promise<string[]> {
  return tableWriteMutex.run(`table:${tableId}`, async () => {
    const schema = await readJson<TableSchema>(paths.schemaFile(tableId));
    if (!schema) throw new Error('表不存在');
    const next = {
      ...schema,
      optionSets: { ...schema.optionSets, [key]: values },
      schemaVersion: schema.schemaVersion + 1,
    };
    await writeJson(paths.schemaFile(tableId), next);
    await audit({
      actor: actor.sub,
      role: actor.role,
      action: 'options.update',
      tableId,
      details: { key, count: values.length },
    });
    return values;
  });
}