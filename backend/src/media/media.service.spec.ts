import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash } from 'crypto';
import { MediaService, runVideoTranscodeJob } from './media.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../common/storage/storage.service';
import { MediaSafetyService } from '../safety/media-safety.service';
import { VideoTranscodeService } from './video-transcode.service';
import { REDIS_CLIENT } from '../redis/redis.module';

const mockPrisma = {
  mediaAsset: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
    create: jest.fn(),
  },
  objectCleanupJob: { createMany: jest.fn() },
  $transaction: jest.fn(),
};

const mockStorage = {
  isEnabled: true,
  bucketName: 'public-bucket',
  quarantineBucketName: 'private-bucket',
  publicUrl: jest.fn(),
  inspectIncoming: jest.fn(),
  snapshotIncoming: jest.fn(),
  sha256Incoming: jest.fn(),
  sha256: jest.fn(),
  downloadIncoming: jest.fn(),
  promoteIncoming: jest.fn(),
  inspect: jest.fn(),
  deleteIncoming: jest.fn(),
  deleteManagedObject: jest.fn(),
};

const mockSafety = {
  scanImage: jest.fn(),
  pollVideoScan: jest.fn(),
  statusFromScan: jest.fn(),
  cleanupVideoScanObject: jest.fn(),
};

const mockVideoTranscode = { transcodeAndReplace: jest.fn() };
const mockRedis = {
  set: jest.fn().mockResolvedValue(null),
  eval: jest.fn().mockResolvedValue(1),
};

function scanningAsset(overrides: Record<string, unknown> = {}) {
  return {
    id: 'media-1',
    userId: 'user-1',
    uploadStatus: 'SCANNING',
    moderationStatus: 'PENDING',
    safetyJobId: 'job-1',
    safetyResult: {
      scanStartedAt: new Date().toISOString(),
      moderationObjectKey: 'nxq-social/job-1.mp4',
    },
    s3Key: 'videos/video.mp4',
    bucket: 'public-bucket',
    thumbnailUrl: 'https://cdn.example.com/thumbnails/video.jpg',
    updatedAt: new Date(),
    createdAt: new Date(),
    url: null,
    mimeType: 'video/mp4',
    size: 123,
    ...overrides,
  };
}

describe('MediaService', () => {
  let service: MediaService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockStorage.publicUrl.mockReturnValue('https://cdn.example.com/videos/video.mp4');
    mockStorage.deleteIncoming.mockResolvedValue(undefined);
    mockStorage.deleteManagedObject.mockResolvedValue(true);
    mockStorage.snapshotIncoming.mockResolvedValue(undefined);
    mockStorage.promoteIncoming.mockResolvedValue(undefined);
    mockStorage.sha256Incoming.mockResolvedValue({
      bytes: 12,
      sha256: 'a'.repeat(64),
    });
    mockStorage.sha256.mockResolvedValue({
      bytes: 12,
      sha256: 'a'.repeat(64),
    });
    mockStorage.inspect.mockResolvedValue({
      bytes: 12,
      contentType: 'image/jpeg',
    });
    mockSafety.scanImage.mockResolvedValue({
      safe: true,
      labels: [],
      maxConfidence: 0,
      provider: 'rekognition',
    });
    mockSafety.cleanupVideoScanObject.mockResolvedValue(undefined);
    mockPrisma.mediaAsset.findFirst.mockResolvedValue(null);
    mockPrisma.objectCleanupJob.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.$transaction.mockImplementation(async (callback: any) =>
      callback(mockPrisma),
    );
    mockRedis.set.mockResolvedValue(null);

    const module = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorage },
        { provide: MediaSafetyService, useValue: mockSafety },
        { provide: VideoTranscodeService, useValue: mockVideoTranscode },
        { provide: REDIS_CLIENT, useValue: mockRedis },
      ],
    }).compile();
    service = module.get(MediaService);
  });

  it('publishes a successful video scan through a fenced update', async () => {
    const asset = scanningAsset();
    const published = {
      ...asset,
      uploadStatus: 'PUBLISHED',
      moderationStatus: 'APPROVED',
      url: 'https://cdn.example.com/videos/video.mp4',
    };
    mockPrisma.mediaAsset.findUnique
      .mockResolvedValueOnce(asset)
      .mockResolvedValueOnce(published);
    mockPrisma.mediaAsset.updateMany.mockResolvedValue({ count: 1 });
    mockSafety.pollVideoScan.mockResolvedValue({
      status: 'SUCCEEDED',
      result: { safe: true, labels: [], maxConfidence: 0, provider: 'rekognition' },
    });
    mockSafety.statusFromScan.mockReturnValue('PUBLISHED');

    await expect(service.getStatus('user-1', asset.id)).resolves.toMatchObject({
      uploadStatus: 'PUBLISHED',
      moderationStatus: 'APPROVED',
    });
    expect(mockPrisma.mediaAsset.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          uploadStatus: 'SCANNING',
          safetyJobId: 'job-1',
          s3Key: 'videos/video.mp4',
        }),
        data: expect.objectContaining({ uploadStatus: 'PUBLISHED' }),
      }),
    );
    expect(mockSafety.cleanupVideoScanObject).toHaveBeenCalledWith(
      'nxq-social/job-1.mp4',
    );
  });

  it('does not publish or clean objects when another actor wins the scan race', async () => {
    const asset = scanningAsset();
    const rejected = { ...asset, uploadStatus: 'REJECTED', moderationStatus: 'REJECTED' };
    mockPrisma.mediaAsset.findUnique
      .mockResolvedValueOnce(asset)
      .mockResolvedValueOnce(rejected);
    mockPrisma.mediaAsset.updateMany.mockResolvedValue({ count: 0 });
    mockSafety.pollVideoScan.mockResolvedValue({
      status: 'SUCCEEDED',
      result: { safe: true, labels: [], maxConfidence: 0, provider: 'rekognition' },
    });
    mockSafety.statusFromScan.mockReturnValue('PUBLISHED');

    await expect(service.getStatus('user-1', asset.id)).resolves.toMatchObject({
      uploadStatus: 'REJECTED',
    });
    expect(mockSafety.cleanupVideoScanObject).not.toHaveBeenCalled();
    expect(mockStorage.deleteManagedObject).not.toHaveBeenCalled();
  });

  it('rejects and cleans a failed video moderation job', async () => {
    const asset = scanningAsset();
    const rejected = {
      ...asset,
      uploadStatus: 'REJECTED',
      moderationStatus: 'FLAGGED',
      safetyResult: { userMessage: 'Upload a compatible MP4.' },
    };
    mockPrisma.mediaAsset.findUnique
      .mockResolvedValueOnce(asset)
      .mockResolvedValueOnce(rejected);
    mockPrisma.mediaAsset.updateMany.mockResolvedValue({ count: 1 });
    mockSafety.pollVideoScan.mockResolvedValue({
      status: 'FAILED',
      failureReason: 'Unsupported codec',
      userMessage: 'Upload a compatible MP4.',
    });

    await expect(service.getStatus('user-1', asset.id)).resolves.toMatchObject({
      uploadStatus: 'REJECTED',
      message: 'Upload a compatible MP4.',
    });
    expect(mockStorage.deleteManagedObject).toHaveBeenCalledWith(asset.s3Key);
    expect(mockStorage.deleteManagedObject).toHaveBeenCalledWith(asset.thumbnailUrl);
  });

  it('fails closed when a video scan exceeds the bounded timeout', async () => {
    const oldTime = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    const asset = scanningAsset({
      safetyResult: { scanStartedAt: oldTime, moderationObjectKey: 'old.mp4' },
      updatedAt: new Date(oldTime),
      createdAt: new Date(oldTime),
    });
    const rejected = { ...asset, uploadStatus: 'REJECTED', moderationStatus: 'FLAGGED' };
    mockPrisma.mediaAsset.findUnique
      .mockResolvedValueOnce(asset)
      .mockResolvedValueOnce(rejected);
    mockPrisma.mediaAsset.updateMany.mockResolvedValue({ count: 1 });
    mockSafety.pollVideoScan.mockResolvedValue({ status: 'IN_PROGRESS' });

    await expect(service.getStatus('user-1', asset.id)).resolves.toMatchObject({
      uploadStatus: 'REJECTED',
    });
  });

  it('queues a verified private video without publishing it', async () => {
    const asset = {
      id: 'media-4',
      userId: 'user-1',
      uploadStatus: 'PENDING',
      bucket: 'private-bucket',
      s3Key: 'incoming/user-1/video.mp4',
      mimeType: 'video/mp4',
      size: 12,
    };
    mockPrisma.mediaAsset.findUnique.mockResolvedValue(asset);
    mockPrisma.mediaAsset.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    mockStorage.inspectIncoming.mockResolvedValue({
      bytes: 12,
      contentType: 'video/mp4',
    });

    await expect(service.completeUpload('user-1', asset.id)).resolves.toEqual({
      id: asset.id,
      uploadStatus: 'TRANSCODING',
      url: null,
    });
    expect(mockPrisma.mediaAsset.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ url: null, uploadStatus: 'TRANSCODING' }),
      }),
    );
  });

  it('publishes the scanned immutable image even if the presigned source is overwritten', async () => {
    const reviewedBytes = Buffer.from('reviewed-image-bytes');
    const overwrittenBytes = Buffer.from('different-client-bytes');
    const reviewedSha256 = createHash('sha256')
      .update(reviewedBytes)
      .digest('hex');
    const sourceKey = 'incoming/user-1/photo.jpg';
    const asset = {
      id: 'media-image-snapshot',
      userId: 'user-1',
      uploadStatus: 'PENDING',
      bucket: 'private-bucket',
      s3Key: sourceKey,
      mimeType: 'image/jpeg',
      size: reviewedBytes.length,
    };
    let sourceBytes = reviewedBytes;

    mockPrisma.mediaAsset.findUnique.mockResolvedValue(asset);
    mockPrisma.mediaAsset.updateMany.mockResolvedValue({ count: 1 });
    mockStorage.inspectIncoming.mockResolvedValue({
      bytes: reviewedBytes.length,
      contentType: 'image/jpeg',
    });
    mockStorage.snapshotIncoming.mockImplementation(
      async (_sourceKey: string, _immutableKey: string) => {
        // A still-valid presigned PUT may change the client-owned source after
        // the copy. Finalization must never read that key again.
        sourceBytes = overwrittenBytes;
      },
    );
    mockStorage.sha256Incoming.mockResolvedValue({
      bytes: reviewedBytes.length,
      sha256: reviewedSha256,
    });
    mockStorage.downloadIncoming.mockImplementation(async (key: string) => {
      if (key === sourceKey) return sourceBytes;
      return reviewedBytes;
    });
    mockStorage.inspect.mockResolvedValue({
      bytes: reviewedBytes.length,
      contentType: 'image/jpeg',
    });
    mockStorage.sha256.mockResolvedValue({
      bytes: reviewedBytes.length,
      sha256: reviewedSha256,
    });

    await expect(
      service.completeUpload('user-1', asset.id),
    ).resolves.toMatchObject({
      id: asset.id,
      uploadStatus: 'PUBLISHED',
    });

    const immutableKey = mockStorage.snapshotIncoming.mock.calls[0][1];
    expect(immutableKey).toMatch(
      /^processing\/media-finalizing\/media-image-snapshot\/[0-9a-f-]{36}\.jpg$/,
    );
    expect(mockStorage.downloadIncoming).toHaveBeenCalledWith(immutableKey);
    expect(mockStorage.downloadIncoming).not.toHaveBeenCalledWith(sourceKey);
    expect(mockSafety.scanImage).toHaveBeenCalledWith(reviewedBytes);
    expect(mockStorage.promoteIncoming).toHaveBeenCalledWith(
      immutableKey,
      expect.stringMatching(/^images\/user-1\/[0-9a-f-]{36}\.jpg$/),
    );
    expect(sourceBytes).toBe(overwrittenBytes);
  });

  it('leaves recent pending uploads available until presign expiry plus grace', async () => {
    mockPrisma.mediaAsset.findMany.mockResolvedValue([]);

    const before = Date.now();
    await (service as any).reclaimAbandonedPendingUploads();
    const after = Date.now();

    const query = mockPrisma.mediaAsset.findMany.mock.calls[0][0];
    const cutoff = query.where.updatedAt.lt as Date;
    expect(query.where.uploadStatus).toBe('PENDING');
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(
      before - 70 * 60 * 1000 - 25,
    );
    expect(cutoff.getTime()).toBeLessThanOrEqual(after - 70 * 60 * 1000 + 25);
    expect(mockPrisma.mediaAsset.updateMany).not.toHaveBeenCalled();
    expect(mockStorage.deleteIncoming).not.toHaveBeenCalled();
  });

  it('claims an abandoned pending upload only once and durably queues every object', async () => {
    const stale = {
      id: 'media-abandoned',
      userId: 'user-1',
      uploadStatus: 'PENDING',
      bucket: 'private-bucket',
      s3Key: 'incoming/user-1/abandoned.jpg',
      mimeType: 'image/jpeg',
      size: 12,
      url: null,
      thumbnailUrl: null,
      updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      safetyResult: {
        immutableSourceKey:
          'processing/media-finalizing/media-abandoned/snapshot.jpg',
        finalKey: 'images/user-1/abandoned.jpg',
      },
    };
    mockPrisma.mediaAsset.findMany.mockResolvedValue([stale]);
    mockPrisma.mediaAsset.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValue({ count: 0 });
    mockPrisma.mediaAsset.deleteMany.mockResolvedValue({ count: 1 });

    await (service as any).reclaimAbandonedPendingUploads();
    await (service as any).reclaimAbandonedPendingUploads();

    expect(mockPrisma.objectCleanupJob.createMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.objectCleanupJob.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          kind: 'QUARANTINE_STORAGE',
          reference: stale.s3Key,
        }),
        expect.objectContaining({
          kind: 'QUARANTINE_STORAGE',
          reference: stale.safetyResult.immutableSourceKey,
        }),
        expect.objectContaining({
          kind: 'PUBLIC_STORAGE',
          reference: stale.safetyResult.finalKey,
        }),
      ]),
      skipDuplicates: true,
    });
    expect(mockPrisma.mediaAsset.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('does not reclaim or delete when concurrent completion wins the pending CAS', async () => {
    const stale = {
      id: 'media-raced',
      userId: 'user-1',
      uploadStatus: 'PENDING',
      bucket: 'private-bucket',
      s3Key: 'incoming/user-1/raced.mp4',
      mimeType: 'video/mp4',
      size: 12,
      updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      safetyResult: null,
    };
    mockPrisma.mediaAsset.findMany.mockResolvedValue([stale]);
    mockPrisma.mediaAsset.updateMany.mockResolvedValue({ count: 0 });

    await (service as any).reclaimAbandonedPendingUploads();

    expect(mockPrisma.mediaAsset.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: stale.id,
          uploadStatus: 'PENDING',
          s3Key: stale.s3Key,
          updatedAt: stale.updatedAt,
        }),
      }),
    );
    expect(mockPrisma.objectCleanupJob.createMany).not.toHaveBeenCalled();
    expect(mockStorage.deleteIncoming).not.toHaveBeenCalled();
    expect(mockPrisma.mediaAsset.deleteMany).not.toHaveBeenCalled();
  });

  it('finishes abandoned cleanup when the quarantine object is already missing', async () => {
    const stale = {
      id: 'media-missing-object',
      userId: 'user-1',
      uploadStatus: 'PENDING',
      bucket: 'private-bucket',
      s3Key: 'incoming/user-1/already-gone.jpg',
      mimeType: 'image/jpeg',
      size: 12,
      updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      safetyResult: null,
    };
    mockPrisma.mediaAsset.findMany.mockResolvedValue([stale]);
    mockPrisma.mediaAsset.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.mediaAsset.deleteMany.mockResolvedValue({ count: 1 });
    // S3/R2 DeleteObject is idempotent and resolves for a missing key.
    mockStorage.deleteIncoming.mockResolvedValue(undefined);

    await (service as any).reclaimAbandonedPendingUploads();

    expect(mockStorage.deleteIncoming).toHaveBeenCalledWith(stale.s3Key);
    expect(mockPrisma.mediaAsset.deleteMany).toHaveBeenCalledWith({
      where: { id: stale.id, uploadStatus: 'REMOVING' },
    });
  });

  it('keeps a durable removing row and retries abandoned cleanup after storage failure', async () => {
    const stale = {
      id: 'media-retry-cleanup',
      userId: 'user-1',
      uploadStatus: 'PENDING',
      bucket: 'private-bucket',
      s3Key: 'incoming/user-1/retry.jpg',
      mimeType: 'image/jpeg',
      size: 12,
      url: null,
      thumbnailUrl: null,
      updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      safetyResult: null,
    };
    const removing = {
      ...stale,
      uploadStatus: 'REMOVING',
      safetyResult: {
        status: 'ABANDONED_UPLOAD_REMOVING',
        cleanupPending: true,
      },
    };
    mockPrisma.mediaAsset.findMany
      .mockResolvedValueOnce([stale])
      .mockResolvedValueOnce([removing]);
    mockPrisma.mediaAsset.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.mediaAsset.deleteMany.mockResolvedValue({ count: 1 });
    mockStorage.deleteIncoming.mockRejectedValueOnce(
      new Error('temporary object-store outage'),
    );

    await (service as any).reclaimAbandonedPendingUploads();
    expect(mockPrisma.objectCleanupJob.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ reference: stale.s3Key }),
      ]),
      skipDuplicates: true,
    });
    expect(mockPrisma.mediaAsset.deleteMany).not.toHaveBeenCalled();

    await (service as any).recoverRemovingMedia();
    expect(mockStorage.deleteIncoming).toHaveBeenLastCalledWith(stale.s3Key);
    expect(mockPrisma.mediaAsset.deleteMany).toHaveBeenCalledWith({
      where: { id: stale.id, uploadStatus: 'REMOVING' },
    });
  });

  it('refuses removal while finalization or scanning owns the asset', async () => {
    mockPrisma.mediaAsset.findUnique.mockResolvedValue(
      scanningAsset({ postId: null, storyId: null }),
    );
    await expect(service.removeUpload('user-1', 'media-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(mockPrisma.mediaAsset.deleteMany).not.toHaveBeenCalled();
  });
});

describe('runVideoTranscodeJob replacement safety', () => {
  const logger = { error: jest.fn(), warn: jest.fn() };

  beforeEach(() => jest.clearAllMocks());

  it('persists exact replacement keys before upload and deletes the original only after commit', async () => {
    const order: string[] = [];
    let databaseAsset: any = {
      id: 'media-safe',
      uploadStatus: 'TRANSCODING',
      s3Key: 'incoming/original.mp4',
      bucket: 'private-bucket',
      mimeType: 'video/mp4',
      size: 12,
      updatedAt: new Date('2026-08-23T00:00:00Z'),
      finalizationToken: null,
      safetyResult: { status: 'TRANSCODE_QUEUED' },
    };
    const prisma = {
      mediaAsset: {
        findUnique: jest.fn().mockImplementation(async () => ({ ...databaseAsset })),
        updateMany: jest.fn().mockImplementation(async (args: any) => {
          const status = args.data.safetyResult?.status;
          if (status === 'TRANSCODING') order.push('plan-persisted');
          else if (status === 'TRANSCODING_ACTIVE') order.push('attempt-claimed');
          else if (status === 'TRANSCODED') order.push('checksum-bound');
          else if (args.data.uploadStatus === 'PUBLISHED') {
            order.push('database-commit');
          }
          databaseAsset = { ...databaseAsset, ...args.data };
          return { count: 1 };
        }),
      },
      objectCleanupJob: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(async (callback: any) => callback(prisma));
    const storage = {
      quarantineBucketName: 'private-bucket',
      bucketName: 'public-bucket',
      publicUrl: jest.fn((key: string) => `https://cdn.example.com/${key}`),
      inspect: jest.fn(),
      sha256: jest.fn(),
      sha256Incoming: jest.fn(),
      deleteManagedObject: jest.fn().mockResolvedValue(true),
      deleteIncoming: jest.fn().mockImplementation(async () => {
        order.push('delete-original');
      }),
    };
    const videoTranscode = {
      transcodeAndReplace: jest.fn().mockImplementation(
        async (_asset: unknown, targets: any) => {
          order.push('replacement-uploaded');
          return {
            url: `https://cdn.example.com/${targets.videoKey}`,
            thumbnailUrl: `https://cdn.example.com/${targets.thumbnailKey}`,
            mimeType: 'video/mp4',
            durationSec: 3,
            width: 720,
            height: 1280,
            s3Key: targets.videoKey,
            bucket: 'public-bucket',
            outputBytes: 100,
            thumbnailBytes: 10,
            outputSha256: 'a'.repeat(64),
            thumbnailSha256: 'b'.repeat(64),
          };
        },
      ),
    };
    const safety = {
      isEnabled: false,
      startVideoScanFile: jest.fn().mockResolvedValue({ status: 'BYPASSED' }),
      cleanupVideoScanObject: jest.fn().mockResolvedValue(undefined),
    };

    await runVideoTranscodeJob(
      {
        prisma: prisma as any,
        storage: storage as any,
        safety: safety as any,
        videoTranscode: videoTranscode as any,
        logger: logger as any,
      },
      'media-safe',
    );

    expect(order).toEqual([
      'plan-persisted',
      'attempt-claimed',
      'replacement-uploaded',
      'checksum-bound',
      'database-commit',
      'delete-original',
    ]);
    const targetKeys = videoTranscode.transcodeAndReplace.mock.calls[0][1];
    expect(targetKeys.videoKey).toMatch(
      /^videos\/transcodes\/media-safe\/[0-9a-f-]{36}\.mp4$/,
    );
    expect(targetKeys.thumbnailKey).toMatch(
      /^thumbnails\/transcodes\/media-safe\/[0-9a-f-]{36}\.jpg$/,
    );
  });

  it('reuses checksum-bound output and the persisted moderation token on retry', async () => {
    const token = '22222222-2222-4222-8222-222222222222';
    const immutableKey =
      'processing/media-finalizing/media-retry/source.mp4';
    const videoKey = `videos/transcodes/media-retry/${token}.mp4`;
    const thumbnailKey = `thumbnails/transcodes/media-retry/${token}.jpg`;
    const moderationObjectKey =
      `nxq-social/transcodes/media-retry/${token}.mp4`;
    const asset = {
      id: 'media-retry',
      uploadStatus: 'TRANSCODING',
      s3Key: immutableKey,
      bucket: 'private-bucket',
      mimeType: 'video/mp4',
      size: 12,
      updatedAt: new Date('2026-08-23T00:00:00Z'),
      finalizationToken: token,
      safetyResult: {
        status: 'TRANSCODED',
        originalSourceKey: 'incoming/user-1/still-writable.mp4',
        immutableSourceKey: immutableKey,
        immutableSha256: 'c'.repeat(64),
        immutableBytes: 12,
        transcodePlanId: token,
        transcodeOutputKey: videoKey,
        transcodeThumbnailKey: thumbnailKey,
        moderationObjectKey,
        transcodeOutputBytes: 100,
        transcodeThumbnailBytes: 10,
        transcodeOutputSha256: 'a'.repeat(64),
        transcodeThumbnailSha256: 'b'.repeat(64),
        durationSec: 4,
        width: 720,
        height: 1280,
      },
    };
    const prisma = {
      mediaAsset: {
        findUnique: jest.fn().mockResolvedValue(asset),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      objectCleanupJob: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback(prisma),
    );
    const storage = {
      quarantineBucketName: 'private-bucket',
      bucketName: 'public-bucket',
      publicUrl: jest.fn((key: string) => `https://cdn.example.com/${key}`),
      inspect: jest.fn(async (key: string) =>
        key === videoKey
          ? { bytes: 100, contentType: 'video/mp4' }
          : { bytes: 10, contentType: 'image/jpeg' },
      ),
      sha256: jest.fn(async (key: string) =>
        key === videoKey
          ? { bytes: 100, sha256: 'a'.repeat(64) }
          : { bytes: 10, sha256: 'b'.repeat(64) },
      ),
      sha256Incoming: jest.fn().mockResolvedValue({
        bytes: 12,
        sha256: 'c'.repeat(64),
      }),
      deleteManagedObject: jest.fn().mockResolvedValue(true),
      deleteIncoming: jest.fn().mockResolvedValue(undefined),
    };
    const safety = {
      isEnabled: false,
      startVideoScanFile: jest
        .fn()
        .mockResolvedValue({ status: 'BYPASSED', jobId: null }),
      cleanupVideoScanObject: jest.fn().mockResolvedValue(undefined),
    };
    const videoTranscode = { transcodeAndReplace: jest.fn() };

    await expect(
      runVideoTranscodeJob(
        {
          prisma: prisma as any,
          storage: storage as any,
          safety: safety as any,
          videoTranscode: videoTranscode as any,
          logger: logger as any,
        },
        asset.id,
      ),
    ).resolves.toBe('completed');

    expect(storage.sha256Incoming).toHaveBeenCalledWith(immutableKey, 12);
    expect(storage.sha256Incoming).not.toHaveBeenCalledWith(
      asset.safetyResult.originalSourceKey,
      expect.anything(),
    );
    expect(videoTranscode.transcodeAndReplace).not.toHaveBeenCalled();
    expect(safety.startVideoScanFile).toHaveBeenCalledWith(
      '',
      moderationObjectKey,
    );
    expect(prisma.mediaAsset.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ finalizationToken: token }),
        data: expect.objectContaining({
          s3Key: videoKey,
          uploadStatus: 'PUBLISHED',
        }),
      }),
    );
  });

  it('rejects a changed checksum-bound output instead of overwriting a key tied to moderation', async () => {
    const token = '33333333-3333-4333-8333-333333333333';
    const videoKey = `videos/transcodes/media-tampered/${token}.mp4`;
    const thumbnailKey =
      `thumbnails/transcodes/media-tampered/${token}.jpg`;
    const moderationObjectKey =
      `nxq-social/transcodes/media-tampered/${token}.mp4`;
    const asset = {
      id: 'media-tampered',
      uploadStatus: 'TRANSCODING',
      s3Key: 'processing/media-finalizing/media-tampered/source.mp4',
      bucket: 'private-bucket',
      mimeType: 'video/mp4',
      size: 12,
      updatedAt: new Date('2026-08-23T00:00:00Z'),
      finalizationToken: token,
      safetyResult: {
        status: 'TRANSCODED',
        immutableSourceKey:
          'processing/media-finalizing/media-tampered/source.mp4',
        immutableSha256: 'c'.repeat(64),
        transcodePlanId: token,
        transcodeOutputKey: videoKey,
        transcodeThumbnailKey: thumbnailKey,
        moderationObjectKey,
        transcodeOutputBytes: 100,
        transcodeThumbnailBytes: 10,
        transcodeOutputSha256: 'a'.repeat(64),
        transcodeThumbnailSha256: 'b'.repeat(64),
        durationSec: 4,
        width: 720,
        height: 1280,
      },
    };
    const prisma = {
      mediaAsset: {
        findUnique: jest.fn().mockResolvedValue(asset),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      objectCleanupJob: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback(prisma),
    );
    const storage = {
      quarantineBucketName: 'private-bucket',
      bucketName: 'public-bucket',
      publicUrl: jest.fn(),
      inspect: jest.fn(async (key: string) =>
        key === videoKey
          ? { bytes: 100, contentType: 'video/mp4' }
          : { bytes: 10, contentType: 'image/jpeg' },
      ),
      sha256: jest.fn(async (key: string) =>
        key === videoKey
          ? { bytes: 100, sha256: 'd'.repeat(64) }
          : { bytes: 10, sha256: 'b'.repeat(64) },
      ),
      sha256Incoming: jest.fn().mockResolvedValue({
        bytes: 12,
        sha256: 'c'.repeat(64),
      }),
      deleteManagedObject: jest.fn().mockResolvedValue(true),
      deleteIncoming: jest.fn().mockResolvedValue(undefined),
    };
    const safety = {
      isEnabled: false,
      startVideoScanFile: jest.fn(),
      cleanupVideoScanObject: jest.fn().mockResolvedValue(undefined),
    };
    const videoTranscode = { transcodeAndReplace: jest.fn() };

    await expect(
      runVideoTranscodeJob(
        {
          prisma: prisma as any,
          storage: storage as any,
          safety: safety as any,
          videoTranscode: videoTranscode as any,
          logger: logger as any,
        },
        asset.id,
      ),
    ).rejects.toThrow('changed after checksum binding');

    expect(videoTranscode.transcodeAndReplace).not.toHaveBeenCalled();
    expect(safety.startVideoScanFile).not.toHaveBeenCalled();
    expect(storage.deleteManagedObject).toHaveBeenCalledWith(videoKey, [
      'videos',
    ]);
    expect(storage.deleteManagedObject).toHaveBeenCalledWith(thumbnailKey, [
      'thumbnails',
    ]);
    expect(prisma.objectCleanupJob.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ reference: videoKey }),
        expect.objectContaining({ reference: moderationObjectKey }),
      ]),
      skipDuplicates: true,
    });
  });

  it('atomically rejects and queues every persisted object when the database commit fails', async () => {
    const token = '11111111-1111-4111-8111-111111111111';
    const videoKey = `videos/transcodes/media-failed/${token}.mp4`;
    const thumbnailKey = `thumbnails/transcodes/media-failed/${token}.jpg`;
    const moderationObjectKey = `nxq-social/transcodes/media-failed/${token}.mp4`;
    const prisma = {
      mediaAsset: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'media-failed',
          uploadStatus: 'TRANSCODING',
          s3Key: 'incoming/original.mp4',
          bucket: 'private-bucket',
          mimeType: 'video/mp4',
          finalizationToken: token,
          safetyResult: {
            status: 'TRANSCODING',
            transcodePlanId: token,
            transcodeOutputKey: videoKey,
            transcodeThumbnailKey: thumbnailKey,
            moderationObjectKey,
          },
        }),
        updateMany: jest
          .fn()
          .mockRejectedValueOnce(new Error('database unavailable'))
          .mockResolvedValueOnce({ count: 1 }),
      },
      objectCleanupJob: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(async (callback: any) => callback(prisma));
    const storage = {
      quarantineBucketName: 'private-bucket',
      deleteManagedObject: jest.fn().mockResolvedValue(true),
      deleteIncoming: jest.fn().mockResolvedValue(undefined),
    };
    const safety = {
      isEnabled: false,
      startVideoScanFile: jest.fn().mockResolvedValue({ status: 'BYPASSED' }),
      cleanupVideoScanObject: jest.fn().mockResolvedValue(undefined),
    };
    const videoTranscode = {
      transcodeAndReplace: jest.fn().mockResolvedValue({
        url: `https://cdn.example.com/${videoKey}`,
        thumbnailUrl: `https://cdn.example.com/${thumbnailKey}`,
        mimeType: 'video/mp4',
        s3Key: videoKey,
        bucket: 'public-bucket',
      }),
    };

    await expect(
      runVideoTranscodeJob(
        {
          prisma: prisma as any,
          storage: storage as any,
          safety: safety as any,
          videoTranscode: videoTranscode as any,
          logger: logger as any,
        },
        'media-failed',
      ),
    ).rejects.toThrow('database unavailable');

    expect(storage.deleteManagedObject).toHaveBeenCalledWith(
      videoKey,
      ['videos'],
    );
    expect(storage.deleteManagedObject).toHaveBeenCalledWith(
      thumbnailKey,
      ['thumbnails'],
    );
    expect(storage.deleteIncoming).toHaveBeenCalledWith('incoming/original.mp4');
    expect(prisma.objectCleanupJob.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ reference: 'incoming/original.mp4' }),
        expect.objectContaining({ reference: videoKey }),
        expect.objectContaining({ reference: thumbnailKey }),
        expect.objectContaining({ reference: moderationObjectKey }),
      ]),
      skipDuplicates: true,
    });
  });
});
