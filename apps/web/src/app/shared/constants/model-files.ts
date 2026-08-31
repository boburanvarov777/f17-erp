/** Model attachments — PDF, Word, Excel (max 25 MB each). */
export const MODEL_FILE_MAX_BYTES = 25 * 1024 * 1024;

export const MODEL_FILE_ACCEPT =
  '.pdf,.doc,.docx,.xls,.xlsx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const MODEL_FILE_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx']);

export const MODEL_FILE_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export function isModelFileAllowed(file: File): boolean {
  if (MODEL_FILE_MIMES.has(file.type)) return true;
  const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase() : '';
  return MODEL_FILE_EXTENSIONS.has(ext);
}

export type ModelFileKind = 'pdf' | 'word' | 'excel' | 'other';

export function modelFileKind(mime?: string | null, name?: string): ModelFileKind {
  const m = (mime ?? '').toLowerCase();
  if (m === 'application/pdf' || name?.toLowerCase().endsWith('.pdf')) return 'pdf';
  if (m.includes('word') || m === 'application/msword' || /\.docx?$/.test(name ?? '')) return 'word';
  if (m.includes('sheet') || m.includes('excel') || /\.xlsx?$/.test(name ?? '')) return 'excel';
  return 'other';
}

export function modelFileIcon(kind: ModelFileKind): string {
  return ({ pdf: 'scroll-text', word: 'scroll-text', excel: 'chart-column', other: 'scroll-text' } as const)[kind];
}

export function formatFileSize(bytes?: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Resolve API storage path or data URL for download / open in browser. */
export function resolveStorageUrl(url: string): string {
  if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) return url;
  return url.startsWith('/') ? url : `/api/${url.replace(/^\//, '')}`;
}
