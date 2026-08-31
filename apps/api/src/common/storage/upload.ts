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
): Promise<{ url: string; mime: string; size: number; name: string }> {
  if (!opts.allowed.has(file.mimetype)) {
    throw badRequest(opts.kind === 'photo' ? 'err_image_type' : 'err_file_type');
  }
  if (file.size > opts.maxBytes) {
    throw badRequest(opts.kind === 'photo' ? 'err_image_size' : 'err_file_size');
  }

  const name = file.originalname?.replace(/[^\w.\-()+ ]/g, '_') || `upload${extFromMime(file.mimetype)}`;

  if (storage.enabled) {
    const ext = extFromMime(file.mimetype);
    const key = `${keyPrefix}/${randomUUID()}${ext}`;
    await storage.putObject(key, file.buffer, file.mimetype);
    return { url: storage.toPublicUrl(key), mime: file.mimetype, size: file.size, name };
  }

  if (opts.kind !== 'photo') throw badRequest('err_storage_required');
  return { url: toPhotoDataUrl(file), mime: file.mimetype, size: file.size, name };
}

export async function deleteStoredUrl(storage: StorageService, url: string): Promise<void> {
  const key = storage.keyFromPublicUrl(url);
  if (key) await storage.deleteObject(key);
}
