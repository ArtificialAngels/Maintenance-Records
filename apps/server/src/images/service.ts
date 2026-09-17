import fs from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { paths } from '../storage/paths.js';
import { ensureDir } from '../storage/fs.js';
import { loadRows } from '../rows/service.js';
import { loadSchema } from '../tables/service.js';
import { audit } from '../audit/log.js';
import type { JwtPayload } from '../types.js';

const ALLOWED_EXT = new Map<string, string>([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
]);

/**
 * Sniff image type from buffer magic bytes. Falls back to declared mime type
 * for formats where magic bytes aren't distinctive (e.g. some webp variants).
 */
export function sniffMime(buffer: Buffer, declared: string): string {
  if (buffer.length >= 8) {
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      return 'image/png';
    }
    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'image/jpeg';
    }
    // GIF: GIF87a / GIF89a
    if (
      buffer.length >= 6 &&
      buffer[0] === 0x47 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x38 &&
      (buffer[4] === 0x37 || buffer[4] === 0x39) &&
      buffer[5] === 0x61
    ) {
      return 'image/gif';
    }
    // WEBP: RIFF....WEBP
    if (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      return 'image/webp';
    }
  }
  // Fall back to declared mime if it's allowed, else octet-stream.
  return ALLOWED_EXT.has(declared) ? declared : 'application/octet-stream';
}

export interface ImageAssetRef {
  assetId: string;
  ext: string;
  originalName: string;
}

export async function saveImageAsset(
  tableId: string,
  rowId: string,
  colId: string,
  buffer: Buffer,
  mimeType: string,
  originalName: string,
  actor: JwtPayload,
): Promise<ImageAssetRef> {
  const schema = await loadSchema(tableId);
  if (!schema) throw new Error('表不存在');
  const col = schema.columns.find((c) => c.id === colId);
  if (!col || col.type !== 'image') throw new Error('列不是图片类型');
  if (!col.visible || (col.editableByRoles.length > 0 && !col.editableByRoles.includes(actor.role))) {
    throw new Error('无权限写入该列');
  }
  const sniffed = sniffMime(buffer, mimeType);
  const ext = ALLOWED_EXT.get(sniffed);
  if (!ext) throw new Error(`不支持的图片类型 ${sniffed || mimeType}`);

  // Make sure row exists when the column is configured (we accept col-level upserts too,
  // but for the demo we expect rows to be created first)
  const data = await loadRows(tableId);
  if (!data.rows.find((r) => r.id === rowId)) {
    throw new Error('行不存在');
  }

  const assetId = nanoid(12);
  const dir = paths.imageDir(tableId, rowId, colId);
  await ensureDir(dir);
  const file = paths.imageFile(tableId, rowId, colId, assetId, ext);
  await fs.writeFile(file, buffer);

  await audit({
    actor: actor.sub,
    role: actor.role,
    action: 'image.upload',
    tableId,
    rowId,
    details: { colId, assetId, ext, size: buffer.length },
  });
  return { assetId, ext, originalName };
}

export async function readImageFile(
  tableId: string,
  rowId: string,
  colId: string,
  assetId: string,
): Promise<{ path: string; mime: string } | null> {
  const data = await loadRows(tableId);
  const row = data.rows.find((r) => r.id === rowId);
  if (!row) return null;
  const val = row.values[colId];
  const refs: ImageAssetRef[] = Array.isArray(val)
    ? (val as ImageAssetRef[])
    : val
      ? [val as ImageAssetRef]
      : [];
  const hit = refs.find((r) => r.assetId === assetId);
  if (!hit) return null;
  const file = path.join(
    paths.root(),
    'tables',
    tableId,
    'images',
    rowId,
    colId,
    `${assetId}.${hit.ext}`,
  );
  try {
    await fs.access(file);
    const mime = mimeFromExt(hit.ext);
    return { path: file, mime };
  } catch {
    return null;
  }
}

function mimeFromExt(ext: string): string {
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    default:
      return 'application/octet-stream';
  }
}