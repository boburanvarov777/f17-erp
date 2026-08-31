import { extname } from 'path';
import { randomUUID } from 'crypto';
import { badRequest } from '../i18n/api-errors';
import { StorageService } from '../storage/storage.service';

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export const PHOTO_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export const FILE_MIMES = new Set([
  ...PHOTO_MIMES,
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'application/x-zip-compressed',
]);

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/zip': '.zip',
    'application/x-zip-compressed': '.zip',
  };
  return map[mime] ?? extname('file.bin');
}

/** Multer decodes multipart filenames as latin1 — re-decode to UTF-8 for Cyrillic/Uzbek names. */
export function decodeUploadFilename(name?: string): string | undefined {
  if (!name) return undefined;
  try {
    return Buffer.from(name, 'latin1').toString('utf8');
  } catch {
    return name;
  }
}

/** Keep original display name (Cyrillic/Uzbek OK); storage keys stay UUID-based. */
function safeDisplayName(original?: string, mime?: string, alreadyUtf8 = false): string {
  const source = alreadyUtf8 ? original : decodeUploadFilename(original);
  const base = source?.replace(/^.*[\\/]/, '').replace(/[\x00-\x1f\x7f]/g, '').trim();
  if (base) return base.slice(0, 255);
  return `upload${extFromMime(mime ?? 'application/octet-stream')}`;
}

export function toPhotoDataUrl(file: { mimetype: string; size: number; buffer: Buffer }): string {
  if (!PHOTO_MIMES.has(file.mimetype)) throw badRequest('err_image_type');
  if (file.size > MAX_PHOTO_BYTES) throw badRequest('err_image_size');
  return `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
}

export async function storeUpload(
  storage: StorageService,
  file: { mimetype: string; size: number; buffer: Buffer; originalname?: string },
  keyPrefix: string,
  opts: { maxBytes: number; allowed: Set<string>; kind: 'photo' | 'file' },
  displayName?: string,
): Promise<{ url: string; mime: string; size: number; name: string }> {
  if (!opts.allowed.has(file.mimetype)) {
    throw badRequest(opts.kind === 'photo' ? 'err_image_type' : 'err_file_type');
  }
  if (file.size > opts.maxBytes) {
    throw badRequest(opts.kind === 'photo' ? 'err_image_size' : 'err_file_size');
  }

  const name = displayName?.trim()
    ? safeDisplayName(displayName.trim(), file.mimetype, true)
    : safeDisplayName(file.originalname, file.mimetype);

  if (storage.enabled || opts.kind === 'file') {
    const ext = extFromMime(file.mimetype);
    const key = `${keyPrefix}/${randomUUID()}${ext}`;
    await storage.putObject(key, file.buffer, file.mimetype);
    return { url: storage.toPublicUrl(key), mime: file.mimetype, size: file.size, name };
  }

  return { url: toPhotoDataUrl(file), mime: file.mimetype, size: file.size, name };
}

export async function deleteStoredUrl(storage: StorageService, url: string): Promise<void> {
  const key = storage.keyFromPublicUrl(url);
  if (key) await storage.deleteObject(key);
}
