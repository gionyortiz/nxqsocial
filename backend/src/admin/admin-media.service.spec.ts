import { BadRequestException } from '@nestjs/common';
import { AdminMediaService } from './admin-media.service';

describe('AdminMediaService media lifecycle claims', () => {
  const tx = {
    mediaAsset: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    post: { updateMany: jest.fn() },
    story: { updateMany: jest.fn() },
    objectCleanupJob: { createMany: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
    mediaAsset: { deleteMany: jest.fn() },
  };
  const storage = {
    isEnabled: true,
    bucketName: 'public-bucket',
    quarantineBucketName: 'quarantine-bucket',
    managedKeyFromReference: jest.fn(
      (value: string | null | undefined, prefixes: readonly string[]) => {
        if (!value) return null;
        const key = value.startsWith('https://media.example.invalid/')
          ? value.slice('https://media.example.invalid/'.length)
          : value;
        return prefixes.some((prefix) => key.startsWith(`${prefix}/`))
          ? key
          : null;
      },
    ),
    deleteIncoming: jest.fn(),
    deleteManagedObject: jest.fn(),
  };
  const safety = { cleanupVideoScanObject: jest.fn() };
  let service: AdminMediaService;

  const snapshot = (overrides: Record<string, unknown> = {}) => ({
    id: 'media-1',
    uploadStatus: 'SCANNING',
    moderationStatus: 'PENDING',
    s3Key: 'videos/current.mp4',
    bucket: 'public-bucket',
    thumbnailUrl: 'https://media.example.invalid/thumbnails/current.jpg',
    safetyJobId: 'scan-current',
    finalizationToken: 'attempt-current',
    safetyResult: {
      moderationObjectKey: 'nxq-social/current.mp4',
      finalKey: 'images/aborted-final.jpg',
      transcodeOutputKey: 'videos/planned.mp4',
      transcodeThumbnailKey: 'thumbnails/planned.jpg',
    },
    updatedAt: new Date('2026-08-23T20:00:00.000Z'),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    tx.mediaAsset.updateMany.mockResolvedValue({ count: 1 });
    tx.post.updateMany.mockResolvedValue({ count: 1 });
    tx.story.updateMany.mockResolvedValue({ count: 1 });
    tx.objectCleanupJob.createMany.mockResolvedValue({ count: 1 });
    prisma.mediaAsset.deleteMany.mockResolvedValue({ count: 1 });
    storage.deleteIncoming.mockResolvedValue(undefined);
    storage.deleteManagedObject.mockResolvedValue(true);
    safety.cleanupVideoScanObject.mockResolvedValue(undefined);
    service = new AdminMediaService(
      prisma as any,
      storage as any,
      safety as any,
    );
  });

  it('rejects with an exact in-transaction claim and durably queues every snapshot object', async () => {
    const asset = snapshot();
    tx.mediaAsset.findUnique.mockResolvedValue(asset);

    await expect(service.reject(asset.id, 'policy')).resolves.toEqual({
      success: true,
      id: asset.id,
      moderationStatus: 'REJECTED',
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.mediaAsset.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: asset.id,
          uploadStatus: asset.uploadStatus,
          s3Key: asset.s3Key,
          safetyJobId: asset.safetyJobId,
          finalizationToken: asset.finalizationToken,
          updatedAt: asset.updatedAt,
        },
      }),
    );
    expect(tx.objectCleanupJob.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          kind: 'PUBLIC_STORAGE',
          reference: 'videos/current.mp4',
        }),
        expect.objectContaining({
          kind: 'PUBLIC_STORAGE',
          reference: 'thumbnails/current.jpg',
        }),
        expect.objectContaining({
          kind: 'PUBLIC_STORAGE',
          reference: 'images/aborted-final.jpg',
        }),
        expect.objectContaining({
          kind: 'PUBLIC_STORAGE',
          reference: 'videos/planned.mp4',
        }),
        expect.objectContaining({
          kind: 'PUBLIC_STORAGE',
          reference: 'thumbnails/planned.jpg',
        }),
        expect.objectContaining({
          kind: 'MODERATION_STORAGE',
          reference: 'nxq-social/current.mp4',
        }),
      ]) as unknown,
      skipDuplicates: true,
    });
    expect(storage.deleteManagedObject).toHaveBeenCalledWith(
      'videos/planned.mp4',
      ['videos'],
    );
    expect(safety.cleanupVideoScanObject).toHaveBeenCalledWith(
      'nxq-social/current.mp4',
    );
  });

  it('does not clean anything when a concurrent lifecycle transition wins the reject claim', async () => {
    const asset = snapshot();
    tx.mediaAsset.findUnique.mockResolvedValue(asset);
    tx.mediaAsset.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.reject(asset.id)).rejects.toThrow(
      'Media changed while rejection was applied; retry',
    );

    expect(tx.post.updateMany).not.toHaveBeenCalled();
    expect(tx.story.updateMany).not.toHaveBeenCalled();
    expect(tx.objectCleanupJob.createMany).not.toHaveBeenCalled();
    expect(storage.deleteManagedObject).not.toHaveBeenCalled();
    expect(safety.cleanupVideoScanObject).not.toHaveBeenCalled();
  });

  it('forbids removal while finalization owns the object', async () => {
    const asset = snapshot({ uploadStatus: 'FINALIZING' });
    tx.mediaAsset.findUnique.mockResolvedValue(asset);

    await expect(service.remove(asset.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.mediaAsset.updateMany).not.toHaveBeenCalled();
    expect(tx.objectCleanupJob.createMany).not.toHaveBeenCalled();
    expect(storage.deleteIncoming).not.toHaveBeenCalled();
  });

  it.each(['reject', 'remove'] as const)(
    'forbids %s while a transcode owns the object',
    async (operation) => {
      const asset = snapshot({ uploadStatus: 'TRANSCODING' });
      tx.mediaAsset.findUnique.mockResolvedValue(asset);

      const action =
        operation === 'reject'
          ? service.reject(asset.id, 'policy')
          : service.remove(asset.id);
      await expect(action).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.mediaAsset.updateMany).not.toHaveBeenCalled();
      expect(tx.objectCleanupJob.createMany).not.toHaveBeenCalled();
      expect(storage.deleteIncoming).not.toHaveBeenCalled();
    },
  );

  it('queues and immediately cleans one retained owned immutable snapshot while rejecting published media', async () => {
    const immutableSourceKey =
      'processing/media-finalizing/media-1/attempt-current.mp4';
    const asset = snapshot({
      uploadStatus: 'PUBLISHED',
      s3Key: immutableSourceKey,
      bucket: 'quarantine-bucket',
      safetyResult: { immutableSourceKey },
    });
    tx.mediaAsset.findUnique.mockResolvedValue(asset);

    await service.reject(asset.id, 'policy');

    const jobs = tx.objectCleanupJob.createMany.mock.calls[0][0].data;
    expect(
      jobs.filter(
        (job: { kind: string; reference: string }) =>
          job.kind === 'QUARANTINE_STORAGE' &&
          job.reference === immutableSourceKey,
      ),
    ).toHaveLength(1);
    expect(storage.deleteIncoming).toHaveBeenCalledTimes(1);
    expect(storage.deleteIncoming).toHaveBeenCalledWith(immutableSourceKey);
  });

  it.each([
    'processing/media-finalizing/media-2/attempt-current.mp4',
    'incoming/user-2/not-an-immutable-snapshot.mp4',
  ])(
    'does not follow an immutable snapshot alias %s',
    async (foreignSnapshot) => {
      const asset = snapshot({
        uploadStatus: 'PENDING',
        s3Key: 'incoming/user-1/upload.mp4',
        bucket: 'quarantine-bucket',
        thumbnailUrl: null,
        safetyJobId: null,
        finalizationToken: null,
        safetyResult: { immutableSourceKey: foreignSnapshot },
      });
      tx.mediaAsset.findUnique.mockResolvedValue(asset);

      await service.remove(asset.id);

      const jobs = tx.objectCleanupJob.createMany.mock.calls[0][0].data;
      expect(jobs).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'QUARANTINE_STORAGE',
            reference: foreignSnapshot,
          }),
        ]),
      );
      expect(storage.deleteIncoming).not.toHaveBeenCalledWith(foreignSnapshot);
    },
  );

  it('does not clean anything when a concurrent lifecycle transition wins the remove claim', async () => {
    const asset = snapshot({ uploadStatus: 'PUBLISHED' });
    tx.mediaAsset.findUnique.mockResolvedValue(asset);
    tx.mediaAsset.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.remove(asset.id)).rejects.toThrow(
      'Media changed while removal was applied; retry',
    );

    expect(tx.post.updateMany).not.toHaveBeenCalled();
    expect(tx.story.updateMany).not.toHaveBeenCalled();
    expect(tx.objectCleanupJob.createMany).not.toHaveBeenCalled();
    expect(storage.deleteManagedObject).not.toHaveBeenCalled();
    expect(safety.cleanupVideoScanObject).not.toHaveBeenCalled();
    expect(prisma.mediaAsset.deleteMany).not.toHaveBeenCalled();
  });

  it('queues quarantine and planned-public cleanup before a removal can commit', async () => {
    const asset = snapshot({
      uploadStatus: 'PENDING',
      s3Key: 'incoming/user-1/upload.mp4',
      bucket: 'quarantine-bucket',
      thumbnailUrl: null,
      safetyJobId: null,
      finalizationToken: null,
      safetyResult: { finalKey: 'videos/aborted-final.mp4' },
    });
    tx.mediaAsset.findUnique.mockResolvedValue(asset);

    await expect(service.remove(asset.id)).resolves.toEqual({
      success: true,
      id: asset.id,
      moderationStatus: 'REMOVED',
    });

    expect(tx.objectCleanupJob.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          kind: 'QUARANTINE_STORAGE',
          reference: 'incoming/user-1/upload.mp4',
        }),
        expect.objectContaining({
          kind: 'PUBLIC_STORAGE',
          reference: 'videos/aborted-final.mp4',
        }),
      ]) as unknown,
      skipDuplicates: true,
    });
    expect(storage.deleteIncoming).toHaveBeenCalledWith(asset.s3Key);
    expect(prisma.mediaAsset.deleteMany).toHaveBeenCalledWith({
      where: {
        id: asset.id,
        uploadStatus: 'REMOVING',
        s3Key: asset.s3Key,
        safetyJobId: null,
        finalizationToken: null,
      },
    });
  });

  it('leaves a REMOVING row for recovery when immediate object cleanup fails', async () => {
    const asset = snapshot({
      uploadStatus: 'PENDING',
      s3Key: 'incoming/user-1/upload.mp4',
      bucket: 'quarantine-bucket',
      thumbnailUrl: null,
      safetyJobId: null,
      finalizationToken: null,
      safetyResult: {},
    });
    tx.mediaAsset.findUnique.mockResolvedValue(asset);
    storage.deleteIncoming.mockRejectedValue(new Error('storage unavailable'));

    await expect(service.remove(asset.id)).resolves.toEqual({
      success: true,
      id: asset.id,
      moderationStatus: 'REMOVED',
    });
    expect(tx.objectCleanupJob.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.mediaAsset.deleteMany).not.toHaveBeenCalled();
  });
});
