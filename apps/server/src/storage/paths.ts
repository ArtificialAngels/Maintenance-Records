import path from 'node:path';
import { config } from '../config.js';

export const paths = {
  root: () => config.dataDir,
  usersFile: () => path.join(config.dataDir, 'users.json'),
  auditFile: () => path.join(config.dataDir, 'audit.jsonl'),
  tableDir: (tableId: string) => path.join(config.dataDir, 'tables', tableId),
  schemaFile: (tableId: string) =>
    path.join(config.dataDir, 'tables', tableId, 'schema.json'),
  rowsFile: (tableId: string) =>
    path.join(config.dataDir, 'tables', tableId, 'rows.json'),
  metaFile: (tableId: string) =>
    path.join(config.dataDir, 'tables', tableId, 'meta.json'),
  imageDir: (tableId: string, rowId: string, colId: string) =>
    path.join(
      config.dataDir,
      'tables',
      tableId,
      'images',
      rowId,
      colId,
    ),
  imageFile: (
    tableId: string,
    rowId: string,
    colId: string,
    assetId: string,
    ext: string,
  ) =>
    path.join(
      config.dataDir,
      'tables',
      tableId,
      'images',
      rowId,
      colId,
      `${assetId}.${ext}`,
    ),
};