import { StorageService } from './storage.service';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { createHash } from 'crypto';
import * as os from 'os';
import * as path from 'path';
import { Readable } from 'stream';

const STORAGE_ENV_KEYS = [
  'NODE_ENV',
  'RAILWAY_ENVIRONMENT_ID',
  'RAILWAY_PROJECT_ID',
  'S3_ENDPOINT',
  'S3_BUCKET',
  'S3_BUCKET_NAME',
  'S3_QUARANTINE_BUCKET',
  'S3_PUBLIC_BASE',
  'S3_PUBLIC_BASE_URL',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_REGION',
] as const;

describe('StorageService production durability', () => {
  const originalEnv = Object.fromEntries(
    STORAGE_ENV_KEYS.map((key) => [key, process.env[key]]),
  );

  beforeEach(() => {
    for (const key of STORAGE_ENV_KEYS) delete process.env[key];
    process.env.NODE_ENV = 'test';
  });

  function configuredStorage(): StorageService {
    process.env.NODE_ENV = 'production';
    process.env.S3_ENDPOINT = 'https://account.r2.example.invalid';
    process.env.S3_BUCKET = 'nxq-media';
    process.env.S3_QUARANTINE_BUCKET = 'nxq-media-incoming';
    process.env.S3_PUBLIC_BASE_URL = 'https://media.example.invalid/cdn';
    process.env.AWS_ACCESS_KEY_ID = 'test-access-key';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-key';
    return new StorageService();
  }

  afterAll(() => {
    for (const key of STORAGE_ENV_KEYS) {
      const original = originalEnv[key];
      if (original === undefined) delete process.env[key];
      else process.env[key] = original;
    }
  });

  it('keeps local-disk uploads available for local development and tests', () => {
    const storage = new StorageService();

    expect(storage.isEnabled).toBe(false);
    expect(storage.localDiskFallbackAllowed).toBe(true);
  });

  it('fails startup when production object-storage credentials are missing', () => {
    process.env.NODE_ENV = 'production';

    expect(() => new StorageService()).toThrow(
      /Persistent object storage is required in production.*S3_BUCKET.*AWS_ACCESS_KEY_ID.*AWS_SECRET_ACCESS_KEY/,
    );
  });

  it('requires a public object URL base for an R2/custom endpoint in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.S3_ENDPOINT = 'https://account.r2.example.invalid';
    process.env.S3_BUCKET = 'nxq-media';
    process.env.S3_QUARANTINE_BUCKET = 'nxq-media-incoming';
    process.env.AWS_ACCESS_KEY_ID = 'test-access-key';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-key';

    expect(() => new StorageService()).toThrow(/S3_PUBLIC_BASE_URL/);
  });

  it('enables R2 storage without allowing local fallback when production config is complete', () => {
    process.env.NODE_ENV = 'production';
    process.env.S3_ENDPOINT = 'https://account.r2.example.invalid';
    process.env.S3_BUCKET = 'nxq-media';
    process.env.S3_QUARANTINE_BUCKET = 'nxq-media-incoming';
    process.env.S3_PUBLIC_BASE_URL = 'https://media.example.invalid/';
    process.env.AWS_ACCESS_KEY_ID = 'test-access-key';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-key';
    process.env.AWS_REGION = 'auto';

    const storage = new StorageService();

    expect(storage.isEnabled).toBe(true);
    expect(storage.localDiskFallbackAllowed).toBe(false);
    expect(storage.publicUrl('avatars/test.jpg')).toBe(
      'https://media.example.invalid/avatars/test.jpg',
    );
  });

  it('treats a Railway runtime as production even if NODE_ENV is omitted', () => {
    delete process.env.NODE_ENV;
    process.env.RAILWAY_PROJECT_ID = 'railway-project';

    expect(() => new StorageService()).toThrow(
      /Persistent object storage is required in production/,
    );
  });

  it('resolves only owned URLs and explicitly allowed prefixes', () => {
    const storage = configuredStorage();

    expect(
      storage.managedKeyFromReference(
        'https://media.example.invalid/cdn/avatars/user.jpg',
        ['avatars'],
      ),
    ).toBe('avatars/user.jpg');
    expect(
      storage.managedKeyFromReference(
        'https://foreign.example.invalid/cdn/avatars/user.jpg',
        ['avatars'],
      ),
    ).toBeNull();
    expect(
      storage.managedKeyFromReference('banners/user.jpg', ['avatars']),
    ).toBeNull();
    expect(
      storage.managedKeyFromReference('avatars/../banners/user.jpg', [
        'avatars',
      ]),
    ).toBeNull();
  });

  it('does not issue a delete request for a foreign or wrong-prefix reference', async () => {
    const storage = configuredStorage();
    const send = jest.fn();
    (storage as any).client.send = send;

    await expect(
      storage.deleteManagedObject(
        'https://foreign.example.invalid/avatars/user.jpg',
        ['avatars'],
      ),
    ).resolves.toBe(false);
    await expect(
      storage.deleteManagedObject('banners/user.jpg', ['avatars']),
    ).resolves.toBe(false);

    expect(send).not.toHaveBeenCalled();
  });

  it('deletes a validated object from the configured bucket', async () => {
    const storage = configuredStorage();
    const send = jest.fn().mockResolvedValue({});
    (storage as any).client.send = send;

    await expect(
      storage.deleteManagedObject(
        'https://media.example.invalid/cdn/thumbnails/thumb.jpg',
        ['thumbnails'],
      ),
    ).resolves.toBe(true);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].input).toEqual({
      Bucket: 'nxq-media',
      Key: 'thumbnails/thumb.jpg',
    });
  });

  it('streams a file to the exact validated key with a fixed content length', async () => {
    const storage = configuredStorage();
    const send = jest.fn().mockResolvedValue({});
    (storage as any).client.send = send;
    const workDir = await mkdtemp(path.join(os.tmpdir(), 'nxq-storage-test-'));
    const filePath = path.join(workDir, 'video.mp4');
    await writeFile(filePath, Buffer.from('bounded-video'));

    try {
      await expect(
        storage.uploadFileToKey(
          filePath,
          'videos/transcodes/media/plan.mp4',
          'video/mp4',
          ['videos'],
        ),
      ).resolves.toBe(
        'https://media.example.invalid/cdn/videos/transcodes/media/plan.mp4',
      );
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][0].input).toEqual(
        expect.objectContaining({
          Bucket: 'nxq-media',
          Key: 'videos/transcodes/media/plan.mp4',
          ContentLength: 13,
          ContentType: 'video/mp4',
        }),
      );
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it('refuses exact-key uploads outside the caller allowlist', async () => {
    const storage = configuredStorage();
    const send = jest.fn();
    (storage as any).client.send = send;

    await expect(
      storage.uploadFileToKey(
        'unused.mp4',
        'avatars/not-a-video.mp4',
        'video/mp4',
        ['videos'],
      ),
    ).rejects.toThrow(/outside managed prefixes/);
    expect(send).not.toHaveBeenCalled();
  });

  it('copies an incoming upload to a unique server-owned quarantine key', async () => {
    const storage = configuredStorage();
    const send = jest.fn().mockResolvedValue({});
    (storage as any).client.send = send;

    await expect(
      storage.snapshotIncoming(
        'incoming/user-1/client.jpg',
        'processing/media-finalizing/media-1/token.jpg',
      ),
    ).resolves.toBeUndefined();

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].input).toEqual({
      Bucket: 'nxq-media-incoming',
      Key: 'processing/media-finalizing/media-1/token.jpg',
      CopySource: encodeURIComponent(
        'nxq-media-incoming/incoming/user-1/client.jpg',
      ),
    });
  });

  it('refuses to snapshot into a client-writable or traversal key', async () => {
    const storage = configuredStorage();
    const send = jest.fn();
    (storage as any).client.send = send;

    await expect(
      storage.snapshotIncoming(
        'incoming/user-1/client.jpg',
        'incoming/user-1/reusable.jpg',
      ),
    ).rejects.toThrow(/invalid quarantine snapshot key/);
    await expect(
      storage.snapshotIncoming(
        'incoming/user-1/client.jpg',
        'processing/media-finalizing/../escape.jpg',
      ),
    ).rejects.toThrow(/invalid quarantine snapshot key/);
    expect(send).not.toHaveBeenCalled();
  });

  it('stream-hashes the exact stored object with a hard byte limit', async () => {
    const storage = configuredStorage();
    const bytes = Buffer.from('immutable-snapshot');
    const send = jest
      .fn()
      .mockResolvedValueOnce({ Body: Readable.from([bytes]) })
      .mockResolvedValueOnce({ Body: Readable.from([bytes]) });
    (storage as any).client.send = send;

    await expect(
      storage.sha256Incoming(
        'processing/media-finalizing/media-1/token.jpg',
        bytes.length,
      ),
    ).resolves.toEqual({
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
    await expect(
      storage.sha256Incoming(
        'processing/media-finalizing/media-1/token.jpg',
        bytes.length - 1,
      ),
    ).rejects.toThrow(/exceeds digest byte limit/);
  });
});
