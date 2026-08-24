import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  CopyObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash, randomUUID } from 'crypto';
import * as path from 'path';
import { createReadStream, createWriteStream } from 'fs';
import { stat } from 'fs/promises';
import type { Readable } from 'stream';
import { pipeline } from 'stream/promises';

export type StorageFolder =
  | 'avatars'
  | 'banners'
  | 'images'
  | 'videos'
  | 'audio'
  | 'thumbnails';

export type ManagedStoragePrefix = StorageFolder | 'uploads';

const MANAGED_STORAGE_PREFIXES: readonly ManagedStoragePrefix[] = [
  'avatars',
  'banners',
  'images',
  'videos',
  'audio',
  'thumbnails',
  'uploads',
];

export const CLIENT_UPLOAD_PREFIX = 'incoming/';
export const IMMUTABLE_MEDIA_PREFIX = 'processing/media-finalizing/';

export function isManagedQuarantineObjectKey(
  key: unknown,
): key is string {
  return (
    typeof key === 'string' &&
    (key.startsWith(CLIENT_UPLOAD_PREFIX) ||
      key.startsWith(IMMUTABLE_MEDIA_PREFIX)) &&
    !key.includes('\\') &&
    !key.includes('?') &&
    !key.includes('#') &&
    !key
      .split('/')
      .some((segment) => !segment || segment === '.' || segment === '..')
  );
}

export interface StoredObjectMetadata {
  bytes: number;
  contentType: string;
}

export interface StoredObjectDigest {
  bytes: number;
  sha256: string;
}

function isProductionRuntime(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    Boolean(process.env.RAILWAY_ENVIRONMENT_ID || process.env.RAILWAY_PROJECT_ID)
  );
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly quarantineBucket: string;
  private readonly publicBase: string;
  private readonly enabled: boolean;
  private readonly allowLocalDisk: boolean;

  constructor() {
    const endpoint = process.env.S3_ENDPOINT?.trim();
    // S3_BUCKET_NAME (AWS S3) takes precedence over S3_BUCKET (R2/MinIO)
    const bucket = (process.env.S3_BUCKET_NAME ?? process.env.S3_BUCKET)?.trim();
    const quarantineBucket = process.env.S3_QUARANTINE_BUCKET?.trim();
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
    const configuredPublicBase = (
      process.env.S3_PUBLIC_BASE_URL ?? process.env.S3_PUBLIC_BASE
    )?.trim();
    const hasPlaceholderEndpoint = !!endpoint && /[<>]/.test(endpoint);
    const hasInvalidEndpoint = !!endpoint && (() => {
      try {
        // Validate endpoint early so bad env values do not crash upload routes.
        const parsed = new URL(endpoint);
        return !['http:', 'https:'].includes(parsed.protocol);
      } catch {
        return true;
      }
    })();
    const hasInvalidPublicBase = !!configuredPublicBase && (() => {
      try {
        const parsed = new URL(configuredPublicBase);
        return (
          !['http:', 'https:'].includes(parsed.protocol) ||
          /[<>]/.test(configuredPublicBase)
        );
      } catch {
        return true;
      }
    })();
    // Native AWS S3 needs a real region; R2/MinIO uses 'auto'
    const region = process.env.AWS_REGION ?? (endpoint ? 'auto' : 'us-east-1');

    const production = isProductionRuntime();
    this.allowLocalDisk = !production;

    const missingOrInvalid: string[] = [];
    if (!bucket) missingOrInvalid.push('S3_BUCKET or S3_BUCKET_NAME');
    if (!quarantineBucket) missingOrInvalid.push('S3_QUARANTINE_BUCKET');
    if (bucket && quarantineBucket && bucket === quarantineBucket) {
      missingOrInvalid.push(
        'S3_QUARANTINE_BUCKET must differ from the public media bucket',
      );
    }
    if (!accessKeyId) missingOrInvalid.push('AWS_ACCESS_KEY_ID');
    if (!secretAccessKey) missingOrInvalid.push('AWS_SECRET_ACCESS_KEY');
    if (hasPlaceholderEndpoint || hasInvalidEndpoint) {
      missingOrInvalid.push('S3_ENDPOINT');
    }
    // R2 and other custom endpoints do not expose public objects through the
    // account API endpoint. Persist URLs against a public/custom-domain base.
    if (endpoint && !configuredPublicBase) {
      missingOrInvalid.push('S3_PUBLIC_BASE_URL');
    }
    if (hasInvalidPublicBase) missingOrInvalid.push('S3_PUBLIC_BASE_URL');

    this.enabled = missingOrInvalid.length === 0;
    this.bucket = bucket ?? '';
    this.quarantineBucket = quarantineBucket ?? '';

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
        configuredPublicBase ??
        (endpoint
          ? `${endpoint.replace(/\/$/, '')}/${bucket}`
          : `https://${bucket}.s3.${region}.amazonaws.com`);
      this.publicBase = this.publicBase.replace(/\/$/, '');
      this.logger.log(`StorageService: S3 enabled, bucket=${bucket}, endpoint=${endpoint ?? 'AWS native'}`);
    } else {
      this.client = null as any;
      this.publicBase = '';
      const issueList = missingOrInvalid.join(', ');
      if (production) {
        throw new Error(
          `Persistent object storage is required in production. Missing or invalid: ${issueList}`,
        );
      }
      this.logger.warn(
        `StorageService: persistent storage is not configured (${issueList}); local disk is enabled for development only`,
      );
    }
  }

  get isEnabled() {
    return this.enabled;
  }

  get localDiskFallbackAllowed() {
    return this.allowLocalDisk;
  }

  get bucketName() {
    return this.bucket;
  }

  get quarantineBucketName() {
    return this.quarantineBucket;
  }

  async checkReadiness(): Promise<void> {
    if (!this.enabled) throw new Error('Persistent object storage is disabled');
    await Promise.all([
      this.client.send(new HeadBucketCommand({ Bucket: this.bucket })),
      this.client.send(new HeadBucketCommand({ Bucket: this.quarantineBucket })),
    ]);
  }

  /**
   * Upload a buffer to R2/S3.
   * Returns the public URL of the uploaded object.
   */
  async upload(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    folder: StorageFolder = 'images',
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
   * Stream a local file to an exact, server-owned public-media key.  Callers
   * must persist the key before invoking this method so a process crash can be
   * recovered without leaving an unreferenced random object behind.
   */
  async uploadFileToKey(
    filePath: string,
    key: string,
    mimeType: string,
    allowedPrefixes: readonly ManagedStoragePrefix[] = ['videos', 'thumbnails'],
  ): Promise<string> {
    if (!this.enabled) {
      throw new Error('StorageService: S3/R2 not configured');
    }

    const managedKey = this.managedKeyFromReference(key, allowedPrefixes);
    if (managedKey !== key) {
      throw new Error('StorageService: refusing upload outside managed prefixes');
    }

    const metadata = await stat(filePath);
    if (!metadata.isFile() || !Number.isSafeInteger(metadata.size) || metadata.size <= 0) {
      throw new Error('StorageService: upload source must be a non-empty regular file');
    }

    const body = createReadStream(filePath);
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: managedKey,
          Body: body,
          ContentLength: metadata.size,
          ContentType: mimeType,
        }),
      );
    } finally {
      body.destroy();
    }

    this.logger.log(
      `Uploaded ${managedKey} (${mimeType}, ${metadata.size} bytes)`,
    );
    return this.publicUrl(managedKey);
  }

  /**
   * Delete an object by its full public URL or by key.
   */
  async delete(urlOrKey: string): Promise<void> {
    if (!this.enabled) return;

    const key = this.keyFromUrl(urlOrKey);

    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    this.logger.log(`Deleted ${key}`);
  }

  /**
   * Resolve a URL/key only when it belongs to this service's configured bucket
   * and one of the explicitly allowed application prefixes. This is intended
   * for lifecycle cleanup of database values, which may contain legacy or
   * externally hosted URLs that must never be interpreted as keys in our
   * bucket.
   */
  managedKeyFromReference(
    urlOrKey: string | null | undefined,
    allowedPrefixes: readonly ManagedStoragePrefix[] = MANAGED_STORAGE_PREFIXES,
  ): string | null {
    if (!this.enabled || !urlOrKey || allowedPrefixes.length === 0) return null;

    let key = urlOrKey.trim();
    if (!key) return null;

    if (/^https?:\/\//i.test(key)) {
      try {
        const candidate = new URL(key);
        const base = new URL(`${this.publicBase}/`);
        if (candidate.origin !== base.origin) return null;
        if (!candidate.pathname.startsWith(base.pathname)) return null;
        key = candidate.pathname.slice(base.pathname.length);
      } catch {
        return null;
      }
    } else if (key.includes('://')) {
      return null;
    }

    key = key.replace(/^\/+/, '');
    if (
      !key ||
      key.includes('\\') ||
      key.includes('?') ||
      key.includes('#') ||
      key.split('/').some((segment) => !segment || segment === '.' || segment === '..')
    ) {
      return null;
    }

    return allowedPrefixes.some((prefix) => key.startsWith(`${prefix}/`))
      ? key
      : null;
  }

  /**
   * Delete only a positively identified object owned by this configured
   * bucket. Returns false for legacy/local/foreign references without issuing
   * a storage request.
   */
  async deleteManagedObject(
    urlOrKey: string | null | undefined,
    allowedPrefixes: readonly ManagedStoragePrefix[] = MANAGED_STORAGE_PREFIXES,
  ): Promise<boolean> {
    const key = this.managedKeyFromReference(urlOrKey, allowedPrefixes);
    if (!key) return false;

    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    this.logger.log(`Deleted managed object ${key}`);
    return true;
  }

  /**
   * Resolve a full public URL down to its S3 key. Pass-through if already a key.
   */
  keyFromUrl(urlOrKey: string): string {
    return urlOrKey.startsWith('http') ? urlOrKey.replace(`${this.publicBase}/`, '') : urlOrKey;
  }

  /**
   * Generate a presigned URL for temporary direct-client upload.
   * The client PUTs directly to R2/S3, then calls the backend to confirm.
   */
  async presignUpload(
    key: string,
    mimeType: string,
    contentLength: number,
    expiresIn = 300,
  ): Promise<string> {
    if (!this.enabled) throw new Error('StorageService: S3/R2 not configured');

    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.quarantineBucket,
        Key: key,
        ContentType: mimeType,
        ContentLength: contentLength,
      }),
      { expiresIn },
    );
  }

  /**
   * Copy a client-writable incoming object to a unique server-owned key. The
   * destination key is never exposed through a presigned PUT URL.
   */
  async promoteIncoming(
    sourceKey: string,
    destinationKey: string,
  ): Promise<void> {
    if (!this.enabled) throw new Error('StorageService: S3/R2 not configured');
    const copySource = encodeURIComponent(
      `${this.quarantineBucket}/${sourceKey}`,
    );
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        Key: destinationKey,
        CopySource: copySource,
      }),
    );
  }

  /**
   * Snapshot a presigned-upload key to a destination that is writable only by
   * the server. S3/R2 CopyObject creates one destination object version; all
   * scanning and promotion must use that destination, never the source key.
   */
  async snapshotIncoming(
    sourceKey: string,
    destinationKey: string,
  ): Promise<void> {
    if (!this.enabled) throw new Error('StorageService: S3/R2 not configured');
    if (
      !sourceKey.startsWith(CLIENT_UPLOAD_PREFIX) ||
      !destinationKey.startsWith(IMMUTABLE_MEDIA_PREFIX) ||
      !isManagedQuarantineObjectKey(sourceKey) ||
      !isManagedQuarantineObjectKey(destinationKey)
    ) {
      throw new Error('StorageService: invalid quarantine snapshot key');
    }
    const copySource = encodeURIComponent(
      `${this.quarantineBucket}/${sourceKey}`,
    );
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.quarantineBucket,
        Key: destinationKey,
        CopySource: copySource,
      }),
    );
  }

  async deleteIncoming(key: string): Promise<void> {
    if (!this.enabled) return;
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.quarantineBucket, Key: key }),
    );
    this.logger.log(`Deleted quarantine object ${key}`);
  }

  async inspectIncoming(key: string): Promise<StoredObjectMetadata | null> {
    return this.inspectInBucket(this.quarantineBucket, key);
  }

  async inspect(key: string): Promise<StoredObjectMetadata | null> {
    if (!this.enabled) return null;
    return this.inspectInBucket(this.bucket, key);
  }

  private async inspectInBucket(
    bucket: string,
    key: string,
  ): Promise<StoredObjectMetadata | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key }),
      );
      return {
        bytes: Number(result.ContentLength ?? -1),
        contentType: String(result.ContentType ?? '')
          .split(';', 1)[0]
          .trim()
          .toLowerCase(),
      };
    } catch {
      return null;
    }
  }

  /**
   * Download an object's full contents as a Buffer (used by the video transcode
   * pipeline to fetch the original upload back for re-encoding).
   */
  async download(key: string): Promise<Buffer> {
    if (!this.enabled) throw new Error('StorageService: S3/R2 not configured');

    return this.downloadFromBucket(this.bucket, key);
  }

  async downloadIncoming(key: string): Promise<Buffer> {
    if (!this.enabled) throw new Error('StorageService: S3/R2 not configured');

    return this.downloadFromBucket(this.quarantineBucket, key);
  }

  async downloadToFile(key: string, filePath: string): Promise<void> {
    return this.downloadBucketObjectToFile(this.bucket, key, filePath);
  }

  async downloadIncomingToFile(key: string, filePath: string): Promise<void> {
    return this.downloadBucketObjectToFile(
      this.quarantineBucket,
      key,
      filePath,
    );
  }

  async sha256(key: string, maxBytes: number): Promise<StoredObjectDigest> {
    return this.sha256BucketObject(this.bucket, key, maxBytes);
  }

  async sha256Incoming(
    key: string,
    maxBytes: number,
  ): Promise<StoredObjectDigest> {
    return this.sha256BucketObject(this.quarantineBucket, key, maxBytes);
  }

  private async sha256BucketObject(
    bucket: string,
    key: string,
    maxBytes: number,
  ): Promise<StoredObjectDigest> {
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
      throw new Error('StorageService: invalid digest byte limit');
    }
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    const stream = result.Body as unknown as Readable;
    const digest = createHash('sha256');
    let bytes = 0;
    try {
      for await (const chunk of stream) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes > maxBytes) {
          throw new Error('StorageService: object exceeds digest byte limit');
        }
        digest.update(buffer);
      }
    } finally {
      stream.destroy();
    }
    return { bytes, sha256: digest.digest('hex') };
  }

  private async downloadBucketObjectToFile(
    bucket: string,
    key: string,
    filePath: string,
  ): Promise<void> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    await pipeline(
      result.Body as unknown as Readable,
      createWriteStream(filePath, { flags: 'wx' }),
    );
  }

  private async downloadFromBucket(bucket: string, key: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    const stream = res.Body as unknown as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  /**
   * Check if an object exists (used to validate after presigned upload).
   */
  async exists(key: string): Promise<boolean> {
    return (await this.inspect(key)) !== null;
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
