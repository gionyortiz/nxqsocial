import { ConflictException } from '@nestjs/common';
import { StoriesService } from './stories.service';

describe('StoriesService media lifecycle', () => {
  const tx = {
    story: {
      create: jest.fn(),
      findUnique: jest.fn(),
      deleteMany: jest.fn(),
    },
    mediaAsset: {
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    objectCleanupJob: {
      createMany: jest.fn(),
    },
  };
  const prisma = {
    mediaAsset: { findUnique: jest.fn() },
    story: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const safety = {
    scan: jest.fn(),
    scanAndPersist: jest.fn(),
  };
  const storage = {
    bucketName: 'nxq-media',
    quarantineBucketName: 'nxq-media-incoming',
    managedKeyFromReference: jest.fn(),
    deleteManagedObject: jest.fn(),
  };

  let service: StoriesService;

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation(
      (callback: (client: typeof tx) => unknown) => callback(tx),
    );
    prisma.story.findMany.mockResolvedValue([]);
    safety.scan.mockReturnValue({ safe: true, riskScore: 0 });
    storage.managedKeyFromReference.mockImplementation(
      (reference: string | null | undefined, prefixes: readonly string[]) => {
        if (!reference) return null;
        const key = reference.startsWith('https://media.example.invalid/')
          ? new URL(reference).pathname.slice(1)
          : reference;
        return prefixes.some((prefix) => key.startsWith(`${prefix}/`))
          ? key
          : null;
      },
    );
    storage.deleteManagedObject.mockResolvedValue(true);
    tx.story.deleteMany.mockResolvedValue({ count: 1 });
    tx.mediaAsset.deleteMany.mockResolvedValue({ count: 1 });
    tx.objectCleanupJob.createMany.mockResolvedValue({ count: 2 });
    service = new StoriesService(prisma as any, safety as any, storage as any);
  });

  it('preserves transactional media reservation when creating from an asset', async () => {
    prisma.mediaAsset.findUnique.mockResolvedValue({
      id: 'media-1',
      userId: 'user-1',
      postId: null,
      storyId: null,
      uploadStatus: 'PUBLISHED',
      moderationStatus: 'APPROVED',
      url: 'https://media.example.invalid/images/story.jpg',
    });
    tx.story.create.mockResolvedValue({ id: 'story-1' });
    tx.mediaAsset.updateMany.mockResolvedValue({ count: 1 });
    tx.story.findUnique.mockResolvedValue({
      id: 'story-1',
      caption: 'story',
      visibility: 'PUBLIC',
      status: 'PUBLISHED',
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      author: {
        id: 'user-1',
        username: 'tester',
        profile: { displayName: 'Tester', avatarUrl: null },
      },
      media: {
        id: 'media-1',
        url: 'https://media.example.invalid/images/story.jpg',
        thumbnailUrl: null,
        mimeType: 'image/jpeg',
        width: 100,
        height: 100,
        durationSec: null,
      },
    });

    await service.createFromAsset('user-1', {
      mediaId: 'media-1',
      caption: 'story',
    } as any);

    expect(tx.mediaAsset.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'media-1',
        userId: 'user-1',
        postId: null,
        storyId: null,
        uploadStatus: 'PUBLISHED',
        moderationStatus: 'APPROVED',
      }),
      data: { storyId: 'story-1' },
    });
  });

  it('deletes exclusive media transactionally before cleaning owned objects', async () => {
    tx.story.findUnique.mockResolvedValue({
      id: 'story-1',
      authorId: 'user-1',
      expiresAt: new Date(Date.now() + 60_000),
      media: {
        id: 'media-1',
        postId: null,
        bucket: 'nxq-media',
        s3Key: 'images/story.jpg',
        url: 'https://media.example.invalid/images/story.jpg',
        thumbnailUrl: 'https://media.example.invalid/thumbnails/story.jpg',
      },
    });

    await expect(service.deleteOwn('story-1', 'user-1')).resolves.toEqual({
      success: true,
    });

    expect(tx.mediaAsset.deleteMany).toHaveBeenCalledWith({
      where: { id: 'media-1', storyId: 'story-1', postId: null },
    });
    expect(tx.story.deleteMany).toHaveBeenCalledWith({
      where: { id: 'story-1' },
    });
    expect(storage.deleteManagedObject).toHaveBeenCalledWith(
      'images/story.jpg',
      ['images', 'videos', 'audio', 'uploads'],
    );
    expect(storage.deleteManagedObject).toHaveBeenCalledWith(
      'thumbnails/story.jpg',
      ['thumbnails'],
    );
    expect(tx.story.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      storage.deleteManagedObject.mock.invocationCallOrder[0],
    );
  });

  it('retains media that is still attached to a post', async () => {
    tx.story.findUnique.mockResolvedValue({
      id: 'story-1',
      authorId: 'user-1',
      expiresAt: new Date(Date.now() + 60_000),
      media: {
        id: 'media-1',
        postId: 'post-1',
        bucket: 'nxq-media',
        s3Key: 'images/shared.jpg',
        url: 'https://media.example.invalid/images/shared.jpg',
        thumbnailUrl: null,
      },
    });

    await service.deleteOwn('story-1', 'user-1');

    expect(tx.mediaAsset.deleteMany).not.toHaveBeenCalled();
    expect(storage.deleteManagedObject).not.toHaveBeenCalled();
  });

  it('does not delete objects when the database transaction fails', async () => {
    tx.story.findUnique.mockResolvedValue({
      id: 'story-1',
      authorId: 'user-1',
      expiresAt: new Date(Date.now() + 60_000),
      media: {
        id: 'media-1',
        postId: null,
        bucket: 'nxq-media',
        s3Key: 'images/story.jpg',
        url: 'https://media.example.invalid/images/story.jpg',
        thumbnailUrl: null,
      },
    });
    tx.story.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.deleteOwn('story-1', 'user-1')).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(storage.deleteManagedObject).not.toHaveBeenCalled();
  });

  it('queues quarantine and moderation cleanup in the story transaction', async () => {
    const immutableSourceKey =
      'processing/media-finalizing/media-1/snapshot.mov';
    tx.story.findUnique.mockResolvedValue({
      id: 'story-1',
      authorId: 'user-1',
      expiresAt: new Date(Date.now() + 60_000),
      media: {
        id: 'media-1',
        userId: 'user-1',
        postId: null,
        bucket: 'nxq-media-incoming',
        s3Key: 'incoming/user-1/story.mov',
        url: null,
        thumbnailUrl: null,
        safetyResult: {
          finalKey: 'videos/uncommitted.mp4',
          immutableSourceKey,
          moderationObjectKey: 'nxq-social/moderation.mp4',
        },
      },
    });

    await service.deleteOwn('story-1', 'user-1');

    expect(tx.objectCleanupJob.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          kind: 'QUARANTINE_STORAGE',
          reference: 'incoming/user-1/story.mov',
        }),
        expect.objectContaining({
          kind: 'QUARANTINE_STORAGE',
          reference: immutableSourceKey,
        }),
        expect.objectContaining({
          kind: 'MODERATION_STORAGE',
          reference: 'nxq-social/moderation.mp4',
        }),
      ]),
      skipDuplicates: true,
    });
  });

  it('queues one cleanup for an active processing snapshot referenced by both fields', async () => {
    const immutableSourceKey =
      'processing/media-finalizing/media-1/snapshot.mov';
    tx.story.findUnique.mockResolvedValue({
      id: 'story-1',
      authorId: 'user-1',
      expiresAt: new Date(Date.now() + 60_000),
      media: {
        id: 'media-1',
        userId: 'user-1',
        postId: null,
        bucket: 'nxq-media-incoming',
        s3Key: immutableSourceKey,
        url: null,
        thumbnailUrl: null,
        safetyResult: { immutableSourceKey },
      },
    });

    await service.deleteOwn('story-1', 'user-1');

    const jobs = tx.objectCleanupJob.createMany.mock.calls[0][0].data;
    expect(
      jobs.filter(
        (job: { kind: string; reference: string }) =>
          job.kind === 'QUARANTINE_STORAGE' &&
          job.reference === immutableSourceKey,
      ),
    ).toHaveLength(1);
  });

  it('reclaims only a bounded batch of expired stories', async () => {
    const expiredAt = new Date(Date.now() - 60_000);
    prisma.story.findMany.mockResolvedValue([
      { id: 'expired-1' },
      { id: 'expired-2' },
    ]);
    tx.story.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve({
        id: where.id,
        authorId: 'user-1',
        expiresAt: expiredAt,
        media: null,
      }),
    );

    await expect(service.cleanupExpiredStories(1000)).resolves.toEqual({
      scanned: 2,
      deleted: 2,
      failed: 0,
      busy: false,
    });

    expect(prisma.story.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
    expect(tx.story.deleteMany).toHaveBeenCalledTimes(2);
  });
});
