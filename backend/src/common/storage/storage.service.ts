import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import * as path from 'path';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBase: string;
  private readonly enabled: boolean;

  constructor() {
    const endpoint = process.env.S3_ENDPOINT?.trim();
    // S3_BUCKET_NAME (AWS S3) takes precedence over S3_BUCKET (R2/MinIO)
    const bucket = process.env.S3_BUCKET_NAME ?? process.env.S3_BUCKET;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const hasPlaceholderEndpoint = !!endpoint && /[<>]/.test(endpoint);
    const hasInvalidEndpoint = !!endpoint && (() => {
      try {
        // Validate endpoint early so bad env values do not crash upload routes.
        new URL(endpoint);
        return false;
      } catch {
        return true;
      }
    })();
    // Native AWS S3 needs a real region; R2/MinIO uses 'auto'
    const region = process.env.AWS_REGION ?? (endpoint ? 'auto' : 'us-east-1');

    this.enabled = !!(bucket && accessKeyId && secretAccessKey) && !hasPlaceholderEndpoint && !hasInvalidEndpoint;
    this.bucket = bucket ?? '';

    if (this.enabled) {
      const clientConfig: ConstructorParameters<typeof S3Client>[0] = {
        region,
        credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
      };
      // Only add endpoint for R2/MinIO — native AWS S3 must not have it
      if (endpoint) {
        clientConfig.endpoint = endpoint;
        clientConfig.forcePathStyle = false;
      }
      this.client = new S3Client(clientConfig);
      // Public CDN base
      this.publicBase =
        process.env.S3_PUBLIC_BASE_URL ??
        process.env.S3_PUBLIC_BASE ??
        (endpoint
          ? `${endpoint.replace(/\/$/, '')}/${bucket}`
          : `https://${bucket}.s3.${region}.amazonaws.com`);
      this.logger.log(`StorageService: S3 enabled, bucket=${bucket}, endpoint=${endpoint ?? 'AWS native'}`);
    } else {
      this.client = null as any;
      this.publicBase = '';
      if (hasPlaceholderEndpoint || hasInvalidEndpoint) {
        this.logger.warn('StorageService: invalid S3_ENDPOINT value detected — falling back to local disk storage');
      }
      this.logger.warn('StorageService: no S3 env vars — falling back to local disk storage');
    }
  }

  get isEnabled() {
    return this.enabled;
  }

  /**
   * Upload a buffer to R2/S3.
   * Returns the public URL of the uploaded object.
   */
  async upload(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    folder: 'images' | 'videos' | 'thumbnails' = 'images',
  ): Promise<string> {
    if (!this.enabled) {
      throw new Error('StorageService: S3/R2 not configured');
    }

    const ext = path.extname(originalName) || this.extFromMime(mimeType);
    const key = `${folder}/${randomUUID()}${ext}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        // Objects are public-readable via the CDN base URL
        // (bucket must have public access or a custom domain policy on R2)
      }),
    );

    const url = `${this.publicBase}/${key}`;
    this.logger.log(`Uploaded ${key} (${mimeType}, ${buffer.length} bytes)`);
    return url;
  }

  /**
   * Delete an object by its full public URL or by key.
   */
  async delete(urlOrKey: string): Promise<void> {
    if (!this.enabled) return;

    const key = urlOrKey.startsWith('http')
      ? urlOrKey.replace(`${this.publicBase}/`, '')
      : urlOrKey;

    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    this.logger.log(`Deleted ${key}`);
  }

  /**
   * Generate a presigned URL for temporary direct-client upload.
   * The client PUTs directly to R2/S3, then calls the backend to confirm.
   */
  async presignUpload(
    key: string,
    mimeType: string,
    expiresIn = 300,
  ): Promise<string> {
    if (!this.enabled) throw new Error('StorageService: S3/R2 not configured');

    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: mimeType }),
      { expiresIn },
    );
  }

  /**
   * Check if an object exists (used to validate after presigned upload).
   */
  async exists(key: string): Promise<boolean> {
    if (!this.enabled) return false;
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  publicUrl(key: string): string {
    return `${this.publicBase}/${key}`;
  }

  private extFromMime(mime: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
      'image/gif': '.gif', 'video/mp4': '.mp4', 'video/webm': '.webm',
      'video/quicktime': '.mov',
    };
    return map[mime] ?? '';
  }
}
