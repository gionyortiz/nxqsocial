import { ConflictException } from '@nestjs/common';
import { UsersService } from './users.service';

describe('UsersService profile image lifecycle', () => {
  const prisma = {
    profile: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    mediaAsset: { findMany: jest.fn() },
    objectCleanupJob: { createMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const audit = {};
  const mail = {};
  const mediaSafety = {
    cleanupVideoScanObject: jest.fn(),
  };
  const storage = {
    bucketName: 'nxq-media',
    quarantineBucketName: 'nxq-media-incoming',
    publicUrl: jest.fn((key: string) => `https://media.example.invalid/${key}`),
    managedKeyFromReference: jest.fn(),
    deleteManagedObject: jest.fn(),
    deleteIncoming: jest.fn(),
  };

  let service: UsersService;

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof prisma) => unknown) => callback(prisma),
    );
    prisma.profile.findMany.mockResolvedValue([]);
    prisma.mediaAsset.findMany.mockResolvedValue([]);
    prisma.user.delete.mockResolvedValue({ id: 'user-1' });
    prisma.objectCleanupJob.createMany.mockResolvedValue({ count: 1 });
    prisma.profile.updateMany.mockResolvedValue({ count: 1 });
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
    storage.deleteIncoming.mockResolvedValue(undefined);
    mediaSafety.cleanupVideoScanObject.mockResolvedValue(undefined);
    service = new UsersService(
      prisma as any,
      audit as any,
      mail as any,
      storage as any,
      mediaSafety as any,
    );
  });

  it('commits an avatar replacement before deleting the previous owned object', async () => {
    prisma.profile.findUnique.mockResolvedValue({
      avatarUrl: 'https://media.example.invalid/avatars/old.jpg',
    });

    await expect(
      service.updateAvatar(
        'user-1',
        'https://media.example.invalid/avatars/new.jpg',
      ),
    ).resolves.toEqual({
      id: 'user-1',
      avatarUrl: 'https://media.example.invalid/avatars/new.jpg',
    });

    expect(prisma.profile.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        avatarUrl: 'https://media.example.invalid/avatars/old.jpg',
      },
      data: { avatarUrl: 'https://media.example.invalid/avatars/new.jpg' },
    });
    expect(storage.deleteManagedObject).toHaveBeenCalledWith(
      'avatars/old.jpg',
      ['avatars'],
    );
    expect(prisma.objectCleanupJob.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          kind: 'PUBLIC_STORAGE',
          reference: 'avatars/old.jpg',
          source: 'profile-avatar-replace',
        }),
      ],
      skipDuplicates: true,
    });
    expect(prisma.profile.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      storage.deleteManagedObject.mock.invocationCallOrder[0],
    );
  });

  it('retries a concurrent banner replacement and removes the actual predecessor', async () => {
    prisma.profile.findUnique
      .mockResolvedValueOnce({
        bannerUrl: 'https://media.example.invalid/banners/first.jpg',
      })
      .mockResolvedValueOnce({
        bannerUrl: 'https://media.example.invalid/banners/concurrent.jpg',
      });
    prisma.profile.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    await service.updateBanner(
      'user-1',
      'https://media.example.invalid/banners/new.jpg',
    );

    expect(prisma.profile.updateMany).toHaveBeenCalledTimes(2);
    expect(storage.deleteManagedObject).toHaveBeenCalledWith(
      'banners/concurrent.jpg',
      ['banners'],
    );
  });

  it('clears an avatar in the database before deleting its owned object', async () => {
    prisma.profile.findUnique.mockResolvedValue({
      avatarUrl: 'https://media.example.invalid/avatars/old.jpg',
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      username: 'tester',
      profile: {
        displayName: 'Tester',
        avatarUrl: null,
        bannerUrl: null,
      },
      _count: { posts: 0, followers: 0, following: 0 },
    });

    const result = await service.removeAvatar('user-1');

    expect(prisma.profile.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        avatarUrl: 'https://media.example.invalid/avatars/old.jpg',
      },
      data: { avatarUrl: null },
    });
    expect(storage.deleteManagedObject).toHaveBeenCalledWith(
      'avatars/old.jpg',
      ['avatars'],
    );
    expect(result.avatarUrl).toBeNull();
  });

  it('keeps a successful profile update successful when old-object cleanup fails', async () => {
    prisma.profile.findUnique.mockResolvedValue({
      avatarUrl: 'https://media.example.invalid/avatars/old.jpg',
    });
    storage.deleteManagedObject.mockRejectedValueOnce(
      new Error('R2 unavailable'),
    );

    await expect(
      service.updateAvatar(
        'user-1',
        'https://media.example.invalid/avatars/new.jpg',
      ),
    ).resolves.toEqual({
      id: 'user-1',
      avatarUrl: 'https://media.example.invalid/avatars/new.jpg',
    });
  });

  it('deletes account rows transactionally before cleaning exclusive owned media', async () => {
    prisma.user.findUnique.mockResolvedValue({
      profile: {
        avatarUrl: 'https://media.example.invalid/avatars/avatar.jpg',
        bannerUrl: 'https://media.example.invalid/banners/banner.jpg',
      },
      mediaAssets: [
        {
          id: 'media-1',
          bucket: 'nxq-media',
          s3Key: 'images/photo.jpg',
          url: 'https://media.example.invalid/images/photo.jpg',
          thumbnailUrl: 'https://media.example.invalid/thumbnails/photo.jpg',
          post: { authorId: 'user-1' },
          story: null,
        },
      ],
    });

    await expect(service.deleteAccount('user-1')).resolves.toEqual({
      message: 'Your account has been deleted.',
    });

    expect(prisma.user.delete).toHaveBeenCalledWith({
      where: { id: 'user-1' },
    });
    expect(storage.deleteManagedObject).toHaveBeenCalledWith(
      'avatars/avatar.jpg',
      ['avatars'],
    );
    expect(storage.deleteManagedObject).toHaveBeenCalledWith(
      'banners/banner.jpg',
      ['banners'],
    );
    expect(storage.deleteManagedObject).toHaveBeenCalledWith(
      'images/photo.jpg',
      ['images', 'videos', 'audio', 'uploads'],
    );
    expect(storage.deleteManagedObject).toHaveBeenCalledWith(
      'thumbnails/photo.jpg',
      ['thumbnails'],
    );
    expect(prisma.user.delete.mock.invocationCallOrder[0]).toBeLessThan(
      storage.deleteManagedObject.mock.invocationCallOrder[0],
    );
  });

  it.each([
    ['post', { post: { authorId: 'another-user' }, story: null }],
    ['story', { post: null, story: { authorId: 'another-user' } }],
  ])(
    'refuses account deletion while another user consumes owned media through a %s',
    async (_relation, consumer) => {
      prisma.user.findUnique.mockResolvedValue({
        profile: null,
        mediaAssets: [
          {
            id: 'media-foreign-consumer',
            bucket: 'nxq-media',
            s3Key: 'images/foreign-consumer.jpg',
            url: 'https://media.example.invalid/images/foreign-consumer.jpg',
            thumbnailUrl: null,
            uploadStatus: 'PUBLISHED',
            safetyResult: null,
            ...consumer,
          },
        ],
      });

      await expect(service.deleteAccount('user-1')).rejects.toThrow(
        'Account media is still linked to content owned by another account. Unlink or transfer that content before deleting this account.',
      );

      expect(prisma.user.delete).not.toHaveBeenCalled();
      expect(prisma.objectCleanupJob.createMany).not.toHaveBeenCalled();
      expect(storage.deleteManagedObject).not.toHaveBeenCalled();
      expect(storage.deleteIncoming).not.toHaveBeenCalled();
      expect(mediaSafety.cleanupVideoScanObject).not.toHaveBeenCalled();
    },
  );

  it('does not delete a profile object still referenced by another account', async () => {
    const sharedAvatar = 'https://media.example.invalid/avatars/shared.jpg';
    prisma.user.findUnique.mockResolvedValue({
      profile: { avatarUrl: sharedAvatar, bannerUrl: null },
      mediaAssets: [],
    });
    prisma.profile.findMany.mockResolvedValue([
      { avatarUrl: sharedAvatar, bannerUrl: null },
    ]);

    await service.deleteAccount('user-1');

    expect(prisma.user.delete).toHaveBeenCalled();
    expect(storage.deleteManagedObject).not.toHaveBeenCalled();
  });

  it('preserves a profile URL aliased by another account media row as a canonical key', async () => {
    const sharedAvatar = 'https://media.example.invalid/avatars/shared.jpg';
    prisma.user.findUnique.mockResolvedValue({
      profile: { avatarUrl: sharedAvatar, bannerUrl: null },
      mediaAssets: [],
    });
    prisma.mediaAsset.findMany.mockResolvedValue([
      {
        s3Key: 'avatars/shared.jpg',
        url: null,
        thumbnailUrl: null,
      },
    ]);

    await service.deleteAccount('user-1');

    expect(prisma.mediaAsset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            {
              s3Key: {
                in: expect.arrayContaining([
                  sharedAvatar,
                  'avatars/shared.jpg',
                ]) as unknown,
              },
            },
          ]) as unknown,
        }),
      }),
    );
    expect(prisma.user.delete).toHaveBeenCalled();
    expect(prisma.objectCleanupJob.createMany).not.toHaveBeenCalled();
    expect(storage.deleteManagedObject).not.toHaveBeenCalled();
  });

  it('cleans pending quarantine and moderation objects after account deletion', async () => {
    const immutableSourceKey =
      'processing/media-finalizing/pending-media/snapshot.mov';
    prisma.user.findUnique.mockResolvedValue({
      profile: null,
      mediaAssets: [
        {
          id: 'pending-media',
          bucket: 'nxq-media-incoming',
          s3Key: 'incoming/user-1/upload.mov',
          url: null,
          thumbnailUrl: null,
          uploadStatus: 'PENDING',
          safetyResult: {
            finalKey: 'videos/uncommitted.mp4',
            immutableSourceKey,
            moderationObjectKey: 'nxq-social/moderation.mp4',
          },
          post: null,
          story: null,
        },
      ],
    });

    await service.deleteAccount('user-1');

    expect(storage.deleteIncoming).toHaveBeenCalledWith(
      'incoming/user-1/upload.mov',
    );
    expect(storage.deleteIncoming).toHaveBeenCalledWith(immutableSourceKey);
    expect(storage.deleteManagedObject).toHaveBeenCalledWith(
      'videos/uncommitted.mp4',
      ['images', 'videos', 'audio', 'uploads'],
    );
    expect(mediaSafety.cleanupVideoScanObject).toHaveBeenCalledWith(
      'nxq-social/moderation.mp4',
    );
    expect(prisma.objectCleanupJob.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          kind: 'QUARANTINE_STORAGE',
          reference: 'incoming/user-1/upload.mov',
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
    expect(prisma.user.delete.mock.invocationCallOrder[0]).toBeLessThan(
      storage.deleteIncoming.mock.invocationCallOrder[0],
    );
  });

  it('does not follow an immutable snapshot alias owned by another media row', async () => {
    const foreignSnapshot =
      'processing/media-finalizing/another-media/snapshot.mov';
    prisma.user.findUnique.mockResolvedValue({
      profile: null,
      mediaAssets: [
        {
          id: 'pending-media',
          bucket: 'nxq-media-incoming',
          s3Key: 'incoming/user-1/upload.mov',
          url: null,
          thumbnailUrl: null,
          uploadStatus: 'PENDING',
          safetyResult: { immutableSourceKey: foreignSnapshot },
          post: null,
          story: null,
        },
      ],
    });

    await service.deleteAccount('user-1');

    const jobs = prisma.objectCleanupJob.createMany.mock.calls[0][0].data;
    expect(jobs).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reference: foreignSnapshot }),
      ]),
    );
    expect(storage.deleteIncoming).not.toHaveBeenCalledWith(foreignSnapshot);
  });

  it('refuses account deletion while an owned media job is active', async () => {
    prisma.user.findUnique.mockResolvedValue({
      profile: null,
      mediaAssets: [
        {
          id: 'processing-media',
          bucket: 'nxq-media-incoming',
          s3Key: 'incoming/user-1/upload.mov',
          url: null,
          thumbnailUrl: null,
          uploadStatus: 'FINALIZING',
          safetyResult: null,
          post: null,
          story: null,
        },
      ],
    });

    await expect(service.deleteAccount('user-1')).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(prisma.user.delete).not.toHaveBeenCalled();
    expect(storage.deleteIncoming).not.toHaveBeenCalled();
  });

  it('keeps objects intact when the account database transaction fails', async () => {
    prisma.user.findUnique.mockResolvedValue({
      profile: {
        avatarUrl: 'https://media.example.invalid/avatars/avatar.jpg',
        bannerUrl: null,
      },
      mediaAssets: [],
    });
    prisma.user.delete.mockRejectedValue(new Error('database unavailable'));

    await expect(service.deleteAccount('user-1')).rejects.toThrow(
      'database unavailable',
    );

    expect(storage.deleteManagedObject).not.toHaveBeenCalled();
  });
});
