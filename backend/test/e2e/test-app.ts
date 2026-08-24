import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { readFileSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { createHash } from 'crypto';
import { join } from 'path';
import { AppModule } from '../../src/app.module';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { MediaSafetyService } from '../../src/safety/media-safety.service';
import { StorageService } from '../../src/common/storage/storage.service';
import { REDIS_CLIENT } from '../../src/redis/redis.module';

export interface TestAppContext {
  app: INestApplication;
  module: TestingModule;
  notificationsMock: jest.Mocked<
    Pick<NotificationsService, 'sendEmailOtp' | 'sendPhoneOtp'>
  >;
  mediaSafetyMock: jest.Mocked<
    Pick<
      MediaSafetyService,
      | 'scanImage'
      | 'scanImageFromS3'
      | 'startVideoScan'
      | 'startVideoScanJob'
      | 'startVideoScanFile'
      | 'pollVideoScan'
      | 'getVideoScanResult'
      | 'cleanupVideoScanObject'
      | 'statusFromScan'
      | 'isEnabled'
    >
  >;
  storageMock: jest.Mocked<StorageService>;
}

// Same real, ffmpeg-decodable fixture used by media-safety.e2e-spec.ts — returned
// by the storage mock's `download` so the real video-transcode pipeline (which
// fetches the "uploaded" original back out of storage) has valid bytes to work with.
const TINY_MP4 = readFileSync(join(__dirname, 'fixtures', 'tiny.mp4'));

export async function createTestApp(
  mediaSafetyEnabled = false,
  storageEnabled = false,
): Promise<TestAppContext> {
  const redisState = new Map<
    string,
    { value: string; expiresAt: number | null }
  >();
  const readRedis = (key: string) => {
    const entry = redisState.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      redisState.delete(key);
      return undefined;
    }
    return entry;
  };

  const notificationsMock = {
    sendEmailOtp: jest.fn().mockResolvedValue(undefined),
    sendPhoneOtp: jest.fn().mockResolvedValue(undefined),
  };

  const mediaSafetyMock: any = {
    isEnabled: mediaSafetyEnabled,
    scanImage: jest.fn().mockResolvedValue({
      safe: true,
      labels: [],
      maxConfidence: 0,
      provider: 'none',
    }),
    scanImageFromS3: jest.fn().mockResolvedValue({
      safe: true,
      labels: [],
      maxConfidence: 0,
      provider: 'none',
    }),
    startVideoScan: jest.fn().mockResolvedValue(null),
    startVideoScanJob: jest
      .fn()
      .mockResolvedValue({ status: 'BYPASSED', jobId: null }),
    startVideoScanFile: jest
      .fn()
      .mockResolvedValue({ status: 'BYPASSED', jobId: null }),
    pollVideoScan: jest.fn().mockResolvedValue({ status: 'IN_PROGRESS' }),
    getVideoScanResult: jest.fn().mockResolvedValue(null),
    cleanupVideoScanObject: jest.fn().mockResolvedValue(undefined),
    statusFromScan: jest.fn().mockReturnValue('PUBLISHED'),
  };

  type StoredTestObject = {
    bytes: number;
    contentType: string;
    buffer: Buffer;
  };
  const quarantineObjects = new Map<string, StoredTestObject>();
  const publicObjects = new Map<string, StoredTestObject>();
  const digest = (object: StoredTestObject) => ({
    bytes: object.bytes,
    sha256: createHash('sha256').update(object.buffer).digest('hex'),
  });
  const cloneObject = (object: StoredTestObject): StoredTestObject => ({
    bytes: object.bytes,
    contentType: object.contentType,
    buffer: Buffer.from(object.buffer),
  });
  const publicBase = 'https://r2.example.com/test';

  const storageMock: any = {
    isEnabled: storageEnabled,
    localDiskFallbackAllowed: !storageEnabled,
    bucketName: 'test-public-bucket',
    quarantineBucketName: 'test-quarantine-bucket',
    upload: jest
      .fn()
      .mockResolvedValue('https://r2.example.com/test/image.jpg'),
    delete: jest.fn().mockResolvedValue(undefined),
    download: jest.fn().mockResolvedValue(TINY_MP4),
    exists: jest.fn().mockResolvedValue(true),
    presignUpload: jest
      .fn()
      .mockImplementation(
        async (key: string, contentType: string, bytes: number) => {
          quarantineObjects.set(key, {
            bytes,
            contentType: contentType.toLowerCase(),
            buffer: contentType.startsWith('video/')
              ? Buffer.from(TINY_MP4)
              : Buffer.alloc(bytes, 0xa5),
          });
          return 'https://r2.example.com/presign';
        },
      ),
    snapshotIncoming: jest
      .fn()
      .mockImplementation(async (sourceKey: string, destinationKey: string) => {
        const object = quarantineObjects.get(sourceKey);
        if (!object)
          throw new Error(`Missing test quarantine object: ${sourceKey}`);
        quarantineObjects.set(destinationKey, cloneObject(object));
      }),
    promoteIncoming: jest
      .fn()
      .mockImplementation(async (sourceKey: string, destinationKey: string) => {
        const object = quarantineObjects.get(sourceKey);
        if (!object)
          throw new Error(`Missing test quarantine object: ${sourceKey}`);
        publicObjects.set(destinationKey, cloneObject(object));
      }),
    inspectIncoming: jest.fn().mockImplementation(async (key: string) => {
      const object = quarantineObjects.get(key);
      return object
        ? { bytes: object.bytes, contentType: object.contentType }
        : null;
    }),
    inspect: jest.fn().mockImplementation(async (key: string) => {
      const object = publicObjects.get(key);
      return object
        ? { bytes: object.bytes, contentType: object.contentType }
        : null;
    }),
    sha256Incoming: jest.fn().mockImplementation(async (key: string) => {
      const object = quarantineObjects.get(key);
      if (!object) {
        throw new Error(`Missing test quarantine digest object: ${key}`);
      }
      return digest(object);
    }),
    sha256: jest.fn().mockImplementation(async (key: string) => {
      const object = publicObjects.get(key);
      if (!object) throw new Error(`Missing test public object: ${key}`);
      return digest(object);
    }),
    downloadIncoming: jest.fn().mockImplementation(async (key: string) => {
      const object = quarantineObjects.get(key);
      if (!object) throw new Error(`Missing test quarantine object: ${key}`);
      return Buffer.from(object.buffer);
    }),
    downloadIncomingToFile: jest
      .fn()
      .mockImplementation(async (key: string, filePath: string) => {
        const object = quarantineObjects.get(key);
        if (!object) {
          throw new Error(`Missing test quarantine file object: ${key}`);
        }
        await writeFile(filePath, object.buffer, { flag: 'wx' });
      }),
    downloadToFile: jest
      .fn()
      .mockImplementation(async (key: string, filePath: string) => {
        const object = publicObjects.get(key);
        if (!object) throw new Error(`Missing test public object: ${key}`);
        await writeFile(filePath, object.buffer, { flag: 'wx' });
      }),
    uploadFileToKey: jest
      .fn()
      .mockImplementation(
        async (filePath: string, key: string, contentType: string) => {
          const buffer = await readFile(filePath);
          publicObjects.set(key, {
            bytes: buffer.length,
            contentType: contentType.toLowerCase(),
            buffer,
          });
          return `${publicBase}/${key}`;
        },
      ),
    deleteIncoming: jest.fn().mockImplementation(async (key: string) => {
      quarantineObjects.delete(key);
    }),
    managedKeyFromReference: jest
      .fn()
      .mockImplementation(
        (
          reference: string | null | undefined,
          allowedPrefixes: readonly string[] = [
            'images',
            'videos',
            'audio',
            'thumbnails',
            'avatars',
            'banners',
            'uploads',
          ],
        ) => {
          if (!storageEnabled || !reference) return null;
          let key = reference;
          if (key.startsWith(`${publicBase}/`)) {
            key = key.slice(publicBase.length + 1);
          } else if (/^https?:\/\//i.test(key)) {
            return null;
          }
          return allowedPrefixes.some((prefix) => key.startsWith(`${prefix}/`))
            ? key
            : null;
        },
      ),
    deleteManagedObject: jest
      .fn()
      .mockImplementation(
        async (
          reference: string | null | undefined,
          allowedPrefixes?: readonly string[],
        ) => {
          const key = storageMock.managedKeyFromReference(
            reference,
            allowedPrefixes,
          );
          if (!key) return false;
          publicObjects.delete(key);
          return true;
        },
      ),
    publicUrl: jest
      .fn()
      .mockImplementation((key: string) => `${publicBase}/${key}`),
    keyFromUrl: jest
      .fn()
      .mockImplementation((reference: string) =>
        reference.startsWith(`${publicBase}/`)
          ? reference.slice(publicBase.length + 1)
          : reference,
      ),
  };

  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(NotificationsService)
    .useValue(notificationsMock)
    .overrideProvider(MediaSafetyService)
    .useValue(mediaSafetyMock)
    .overrideProvider(StorageService)
    .useValue(storageMock)
    // Mock Redis so E2E tests don't need a running Redis server and
    // don't leave open handles that block Jest from exiting.
    // Making incr throw causes the ActionRateLimitGuard to use its
    // in-memory fallback, which maintains real state and correctly
    // enforces rate limits in tests.
    .overrideProvider(REDIS_CLIENT)
    .useValue({
      get: jest.fn(async (key: string) => readRedis(key)?.value ?? null),
      set: jest.fn(
        async (key: string, value: string, ...args: Array<string | number>) => {
          const useNx = args.some((arg) => String(arg).toUpperCase() === 'NX');
          if (useNx && readRedis(key)) return null;
          const exIndex = args.findIndex(
            (arg) => String(arg).toUpperCase() === 'EX',
          );
          const pxIndex = args.findIndex(
            (arg) => String(arg).toUpperCase() === 'PX',
          );
          const expiresAt =
            pxIndex >= 0
              ? Date.now() + Number(args[pxIndex + 1])
              : exIndex >= 0
                ? Date.now() + Number(args[exIndex + 1]) * 1000
                : null;
          redisState.set(key, { value, expiresAt });
          return 'OK';
        },
      ),
      setex: jest.fn(async (key: string, seconds: number, value: string) => {
        redisState.set(key, {
          value,
          expiresAt: Date.now() + Number(seconds) * 1000,
        });
        return 'OK';
      }),
      incr: jest.fn().mockRejectedValue(new Error('Redis unavailable (test)')),
      expire: jest.fn(async (key: string, seconds: number) => {
        const entry = readRedis(key);
        if (!entry) return 0;
        entry.expiresAt = Date.now() + Number(seconds) * 1000;
        return 1;
      }),
      del: jest.fn(async (key: string) => (redisState.delete(key) ? 1 : 0)),
      ttl: jest.fn(async (key: string) => {
        const entry = readRedis(key);
        if (!entry) return -2;
        if (entry.expiresAt === null) return -1;
        return Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000));
      }),
      eval: jest.fn(
        async (script: string, keyCount: number, ...args: string[]) => {
          if (keyCount === 1) {
            const [key, firstArg, secondArg] = args;
            if (script.includes('pexpire')) {
              const current = readRedis(key);
              if (current?.value !== firstArg) return 0;
              current.expiresAt = Date.now() + Number(secondArg);
              return 1;
            }
            if (script.includes('redis.call("del"')) {
              const current = readRedis(key);
              if (current?.value !== firstArg) return 0;
              redisState.delete(key);
              return 1;
            }

            const attemptKey = key;
            const expiresInSeconds = Number(firstArg);
            const previous = readRedis(attemptKey);
            const attempts = Number(previous?.value ?? 0) + 1;
            redisState.set(attemptKey, {
              value: String(attempts),
              expiresAt:
                previous?.expiresAt ?? Date.now() + expiresInSeconds * 1000,
            });
            return attempts;
          }

          const [hitsKey, blockedKey, ttlMs, limitValue, blockDurationMs] =
            args;
          const now = Date.now();
          const ttl = Number(ttlMs);
          const limit = Number(limitValue);
          const blockDuration = Number(blockDurationMs);
          const blocked = readRedis(blockedKey);
          if (blocked?.expiresAt) {
            return [
              limit + 1,
              0,
              1,
              Math.ceil((blocked.expiresAt - now) / 1000),
            ];
          }

          const previous = readRedis(hitsKey);
          const hits = Number(previous?.value ?? 0) + 1;
          const expiresAt = previous?.expiresAt ?? now + ttl;
          redisState.set(hitsKey, { value: String(hits), expiresAt });

          if (hits > limit) {
            redisState.set(blockedKey, {
              value: '1',
              expiresAt: now + blockDuration,
            });
            redisState.delete(hitsKey);
            return [hits, 0, 1, Math.ceil(blockDuration / 1000)];
          }
          return [hits, Math.ceil((expiresAt - now) / 1000), 0, 0];
        },
      ),
      quit: jest.fn().mockResolvedValue('OK'),
      disconnect: jest.fn(),
    })
    .compile();

  const app = moduleFixture.createNestApplication({ rawBody: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  app.setGlobalPrefix('api');
  await app.init();

  return {
    app,
    module: moduleFixture,
    notificationsMock: notificationsMock as any,
    mediaSafetyMock,
    storageMock,
  };
}
