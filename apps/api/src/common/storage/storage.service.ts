import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';

const STORAGE_PREFIX = '/api/storage/';

@Injectable()
export class StorageService {
  private readonly log = new Logger(StorageService.name);
  private readonly client: S3Client | null;
  readonly bucket: string | null;

  constructor(private config: ConfigService) {
    this.bucket = config.get<string>('BUCKET') ?? null;
    const endpoint = config.get<string>('ENDPOINT');
    const accessKeyId = config.get<string>('ACCESS_KEY_ID');
    const secretAccessKey = config.get<string>('SECRET_ACCESS_KEY');
    const region = config.get<string>('REGION') ?? 'auto';

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
      this.log.warn('Bucket not configured — falling back to inline base64 for uploads');
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

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    if (!this.client || !this.bucket) throw new Error('Storage not configured');
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }));
  }

  async deleteObject(key: string): Promise<void> {
    if (!this.client || !this.bucket) return;
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (e) {
      this.log.warn(`Failed to delete ${key}: ${e}`);
    }
  }

  async getObject(key: string): Promise<{ body: Readable; contentType?: string; contentLength?: number }> {
    if (!this.client || !this.bucket) throw new Error('Storage not configured');
    const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!out.Body) throw new Error('Empty object');
    return {
      body: out.Body as Readable,
      contentType: out.ContentType,
      contentLength: out.ContentLength,
    };
  }
}
