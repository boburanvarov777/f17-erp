import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { readFile, stat, unlink } from 'fs/promises';
import { join } from 'path';
import { Readable } from 'stream';

const STORAGE_PREFIX = '/api/storage/';

const EXT_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.zip': 'application/zip',
};

@Injectable()
export class StorageService {
  private readonly log = new Logger(StorageService.name);
  private readonly client: S3Client | null;
  readonly bucket: string | null;
  readonly localDir: string;

  constructor(private config: ConfigService, private prisma: PrismaService) {
    this.bucket = config.get<string>('BUCKET') ?? null;
    const endpoint = config.get<string>('ENDPOINT');
    const accessKeyId = config.get<string>('ACCESS_KEY_ID');
    const secretAccessKey = config.get<string>('SECRET_ACCESS_KEY');
    const region = config.get<string>('REGION') ?? 'auto';
    this.localDir = config.get<string>('LOCAL_STORAGE_DIR') ?? join(process.cwd(), 'uploads');

    if (this.bucket && endpoint && accessKeyId && secretAccessKey) {
      this.client = new S3Client({
        region,
        endpoint,
        forcePathStyle: true,
        credentials: { accessKeyId, secretAccessKey },
      });
      this.log.log(`Bucket storage enabled (${this.bucket})`);
    } else {
      this.client = null;
      this.log.warn('Bucket not configured — storing uploads in the database (stored_objects)');
    }
  }

  get enabled(): boolean {
    return !!this.client && !!this.bucket;
  }

  toPublicUrl(key: string): string {
    return `${STORAGE_PREFIX}${key.split('/').map(encodeURIComponent).join('/')}`;
  }

  keyFromPublicUrl(url: string): string | null {
    if (!url.startsWith(STORAGE_PREFIX)) return null;
    const raw = url.slice(STORAGE_PREFIX.length);
    return raw.split('/').map((s) => decodeURIComponent(s)).join('/');
  }

  isStoredUrl(url: string): boolean {
    return url.startsWith(STORAGE_PREFIX);
  }

  guessContentType(key: string): string | undefined {
    const dot = key.lastIndexOf('.');
    if (dot < 0) return undefined;
    return EXT_MIME[key.slice(dot).toLowerCase()];
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    if (this.enabled) {
      try {
        await this.client!.send(new PutObjectCommand({
          Bucket: this.bucket!,
          Key: key,
          Body: body,
          ContentType: contentType,
        }));
      } catch (e) {
        const err = e as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
        this.log.error(
          `Bucket upload failed (bucket=${this.bucket}, key=${key}, status=${err.$metadata?.httpStatusCode}): ${err.name} ${err.message}`,
        );
        throw e;
      }
      return;
    }
    await this.prisma.storedObject.upsert({
      where: { key },
      create: { key, mime: contentType, size: body.length, data: body },
      update: { mime: contentType, size: body.length, data: body },
    });
  }

  async deleteObject(key: string): Promise<void> {
    if (this.enabled) {
      try {
        await this.client!.send(new DeleteObjectCommand({ Bucket: this.bucket!, Key: key }));
      } catch (e) {
        this.log.warn(`Failed to delete ${key}: ${e}`);
      }
      return;
    }
    await this.prisma.storedObject.deleteMany({ where: { key } });
    try {
      await unlink(join(this.localDir, key));
    } catch {
      /* legacy local copy — usually already gone */
    }
  }

  async getObject(key: string): Promise<{ body: Readable; contentType?: string; contentLength?: number }> {
    if (this.enabled) {
      const out = await this.client!.send(new GetObjectCommand({ Bucket: this.bucket!, Key: key }));
      if (!out.Body) throw new Error('Empty object');
      return {
        body: out.Body as Readable,
        contentType: out.ContentType,
        contentLength: out.ContentLength,
      };
    }
    const row = await this.prisma.storedObject.findUnique({ where: { key } });
    if (row) {
      const buf = Buffer.from(row.data);
      return { body: Readable.from(buf), contentType: row.mime || this.guessContentType(key), contentLength: buf.length };
    }
    // Legacy: files written to local disk before database storage existed.
    const filePath = join(this.localDir, key);
    const buf = await readFile(filePath);
    const st = await stat(filePath);
    return {
      body: Readable.from(buf),
      contentType: this.guessContentType(key),
      contentLength: st.size,
    };
  }
}
