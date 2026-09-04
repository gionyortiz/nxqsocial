import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PostsService } from './posts.service';

describe('PostsService production media durability', () => {
  const prisma = {
    post: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    mediaAsset: {
      deleteMany: jest.fn(),
    },
    objectCleanupJob: {
      createMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const safety = {
    scan: jest.fn(),
    scanAndPersist: jest.fn(),
  };
  const mediaSafety = {
    isEnabled: false,
    scanImage: jest.fn(),
    statusFromScan: jest.fn(),
    startVideoScan: jest.fn(),
  };
  const storage = {
    isEnabled: true,
    localDiskFallbackAllowed: false,
    bucketName: 'nxq-media',
    upload: jest.fn(),
    delete: jest.fn().mockResolvedValue(undefined),
    deleteManagedObject: jest.fn(),
    managedKeyFromReference: jest.fn(),
    keyFromUrl: jest.fn((url: string) => new URL(url).pathname.slice(1)),
  };
  const videoTranscode = {
    transcodeBuffer: jest.fn(),
  };

  let service: PostsService;

  beforeEach(() => {
    jest.resetAllMocks();
    mediaSafety.isEnabled = false;
    storage.isEnabled = true;
    storage.localDiskFallbackAllowed = false;
    storage.bucketName = 'nxq-media';
    storage.keyFromUrl.mockImplementation((url: string) =>
      new URL(url).pathname.slice(1),
    );
    storage.managedKeyFromReference.mockImplementation(
      (reference: string, prefixes: readonly string[]) => {
        let key = reference;
        if (reference.startsWith('https://media.example.invalid/')) {
          key = new URL(reference).pathname.slice(1);
        }
        return prefixes.some((prefix) => key.startsWith(`${prefix}/`))
          ? key
          : null;
      },
    );
    storage.deleteManagedObject.mockResolvedValue(true);
    safety.scan.mockReturnValue({ safe: true, riskScore: 0 });
    prisma.post.delete.mockResolvedValue({ id: 'post-1' });
    prisma.mediaAsset.deleteMany.mockResolvedValue({ count: 1 });
    prisma.objectCleanupJob.createMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation((operation: any) =>
      typeof operation === 'function'
        ? operation(prisma)
        : Promise.all(operation),
    );
    service = new PostsService(
      prisma as any,
      safety as any,
      mediaSafety as any,
      storage as any,
      videoTranscode as any,
    );
  });

  it('requires the direct upload pipeline for multipart images in production', async () => {
    storage.upload.mockRejectedValue(new Error('object store unavailable'));
    const file = {
      buffer: Buffer.from('image'),
      originalname: 'image.jpg',
      mimetype: 'image/jpeg',
      size: 5,
    } as Express.Multer.File;

    await expect(
      service.createPost('user-1', { caption: 'test' } as any, file),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(storage.upload).not.toHaveBeenCalled();
    expect(prisma.post.create).not.toHaveBeenCalled();
  });

  it('removes an uploaded image when moderation rejects the post', async () => {
    storage.localDiskFallbackAllowed = true;
    const imageUrl = 'https://media.example.invalid/images/rejected.jpg';
    storage.upload.mockResolvedValue(imageUrl);
    mediaSafety.isEnabled = true;
    mediaSafety.scanImage.mockResolvedValue({
      safe: false,
      topCategory: 'Explicit Nudity',
      maxConfidence: 99,
    });
    mediaSafety.statusFromScan.mockReturnValue('REJECTED');
    const file = {
      buffer: Buffer.from('image'),
      originalname: 'image.jpg',
      mimetype: 'image/jpeg',
      size: 5,
    } as Express.Multer.File;

    await expect(
      service.createPost('user-1', { caption: 'test' } as any, file),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(storage.deleteManagedObject).toHaveBeenCalledWith(imageUrl, [
      'images',
    ]);
    expect(prisma.post.create).not.toHaveBeenCalled();
  });

  it('removes uploaded video and thumbnail objects when the database write fails', async () => {
    storage.localDiskFallbackAllowed = true;
    const videoUrl = 'https://media.example.invalid/videos/video.mp4';
    const thumbnailUrl = 'https://media.example.invalid/thumbnails/video.jpg';
    storage.upload
      .mockResolvedValueOnce(videoUrl)
      .mockResolvedValueOnce(thumbnailUrl);
    videoTranscode.transcodeBuffer.mockResolvedValue({
      buffer: Buffer.from('video'),
      mimeType: 'video/mp4',
      thumbnailBuffer: Buffer.from('thumbnail'),
      durationSec: 4,
      width: 1280,
      height: 720,
    });
    prisma.post.create.mockRejectedValue(new Error('database unavailable'));
    const file = {
      buffer: Buffer.from('source video'),
      originalname: 'video.mov',
      mimetype: 'video/quicktime',
      size: 12,
    } as Express.Multer.File;

    await expect(
      service.createPost('user-1', { caption: 'test' } as any, file),
    ).rejects.toThrow('database unavailable');

    expect(storage.deleteManagedObject).toHaveBeenCalledWith(videoUrl, [
      'videos',
    ]);
    expect(storage.deleteManagedObject).toHaveBeenCalledWith(thumbnailUrl, [
      'thumbnails',
    ]);
  });

  it('requires the direct upload pipeline for multipart videos in production', async () => {
    const file = {
      buffer: Buffer.from('video'),
      originalname: 'video.mp4',
      mimetype: 'video/mp4',
      size: 5,
    } as Express.Multer.File;

    await expect(
      service.createPost('user-1', { caption: 'test' } as any, file),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(videoTranscode.transcodeBuffer).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
    expect(prisma.post.create).not.toHaveBeenCalled();
  });

  it('removes an uploaded image when the safety scanner itself fails', async () => {
    storage.localDiskFallbackAllowed = true;
    const imageUrl = 'https://media.example.invalid/images/unscanned.jpg';
    storage.upload.mockResolvedValue(imageUrl);
    mediaSafety.isEnabled = true;
    mediaSafety.scanImage.mockRejectedValue(new Error('scanner unavailable'));
    const file = {
      buffer: Buffer.from('image'),
      originalname: 'image.jpg',
      mimetype: 'image/jpeg',
      size: 5,
    } as Express.Multer.File;

    await expect(
      service.createPost('user-1', { caption: 'test' } as any, file),
    ).rejects.toThrow('scanner unavailable');

    expect(storage.deleteManagedObject).toHaveBeenCalledWith(imageUrl, [
      'images',
    ]);
  });

  it('deletes post rows before cleaning up owned primary and thumbnail objects', async () => {
    prisma.post.findUnique.mockResolvedValue({
      authorId: 'user-1',
      media: [
        {
          id: 'media-1',
          bucket: 'nxq-media',
          s3Key: 'videos/video.mp4',
          url: 'https://media.example.invalid/videos/video.mp4',
          thumbnailUrl: 'https://media.example.invalid/thumbnails/video.jpg',
        },
      ],
    });

    await expect(service.deletePost('post-1', 'user-1')).resolves.toEqual({
      success: true,
    });

    expect(prisma.mediaAsset.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['media-1'] } },
    });
    expect(prisma.post.delete).toHaveBeenCalledWith({
      where: { id: 'post-1' },
    });
    expect(storage.deleteManagedObject).toHaveBeenCalledWith(
      'videos/video.mp4',
      ['images', 'videos', 'uploads'],
    );
    expect(storage.deleteManagedObject).toHaveBeenCalledWith(
      'https://media.example.invalid/thumbnails/video.jpg',
      ['thumbnails'],
    );
    expect(prisma.$transaction.mock.invocationCallOrder[0]).toBeLessThan(
      storage.deleteManagedObject.mock.invocationCallOrder[0],
    );
  });

  it('keeps objects intact when deleting the database rows fails', async () => {
    prisma.post.findUnique.mockResolvedValue({
      authorId: 'user-1',
      media: [
        {
          id: 'media-1',
          bucket: 'nxq-media',
          s3Key: 'images/photo.jpg',
          url: 'https://media.example.invalid/images/photo.jpg',
          thumbnailUrl: null,
        },
      ],
    });
    prisma.$transaction.mockRejectedValue(new Error('database unavailable'));

    await expect(service.deletePost('post-1', 'user-1')).rejects.toThrow(
      'database unavailable',
    );

    expect(storage.deleteManagedObject).not.toHaveBeenCalled();
  });

  it('does not delete an object recorded as belonging to another bucket', async () => {
    prisma.post.findUnique.mockResolvedValue({
      authorId: 'user-1',
      media: [
        {
          id: 'media-1',
          bucket: 'external-bucket',
          s3Key: 'images/photo.jpg',
          url: 'https://external.example.invalid/images/photo.jpg',
          thumbnailUrl: 'https://external.example.invalid/thumbnails/photo.jpg',
        },
      ],
    });

    await service.deletePost('post-1', 'user-1');

    expect(storage.deleteManagedObject).not.toHaveBeenCalled();
  });

  it('retains media that is still referenced by a story', async () => {
    prisma.post.findUnique.mockResolvedValue({
      authorId: 'user-1',
      media: [
        {
          id: 'media-1',
          bucket: 'nxq-media',
          s3Key: 'images/shared.jpg',
          url: 'https://media.example.invalid/images/shared.jpg',
          thumbnailUrl: null,
          storyId: 'story-1',
        },
      ],
    });

    await service.deletePost('post-1', 'user-1');

    expect(prisma.mediaAsset.deleteMany).not.toHaveBeenCalled();
    expect(prisma.post.delete).toHaveBeenCalledWith({
      where: { id: 'post-1' },
    });
    expect(storage.deleteManagedObject).not.toHaveBeenCalled();
  });

  it('does not expose a private R2 hostname in a reels API response', async () => {
    const originalEnv = {
      bucket: process.env.S3_BUCKET,
      publicBase: process.env.S3_PUBLIC_BASE_URL,
    };
    process.env.S3_BUCKET = 'nxqsocial-media';
    process.env.S3_PUBLIC_BASE_URL = 'https://media.nxqsocial.com';
    prisma.post.findMany.mockResolvedValue([
      {
        id: 'post-1',
        caption: 'legacy reel',
        type: 'VIDEO',
        visibility: 'PUBLIC',
        status: 'PUBLISHED',
        aiLabel: 'NONE',
        createdAt: new Date(),
        author: {
          id: 'user-1',
          username: 'creator',
          verificationStatus: 'UNVERIFIED',
          trustScore: 0,
          role: 'USER',
          profile: { displayName: 'Creator', avatarUrl: null },
        },
        media: [
          {
            id: 'media-1',
            bucket: 'nxqsocial-media',
            s3Key: 'videos/reel.mp4',
            url: 'https://old-account.r2.cloudflarestorage.com/nxqsocial-media/videos/reel.mp4',
            thumbnailUrl:
              'https://old-account.r2.cloudflarestorage.com/nxqsocial-media/thumbnails/reel.jpg',
            mimeType: 'video/mp4',
            width: 1080,
            height: 1920,
            durationSec: 10,
            order: 0,
          },
        ],
        likes: [],
        _count: { likes: 0, comments: 0 },
      },
    ]);

    try {
      const result = await service.getReels('viewer-1');
      const serialized = JSON.stringify(result);

      expect(result.data[0].media[0]).toEqual(
        expect.objectContaining({
          url: 'https://media.nxqsocial.com/videos/reel.mp4',
          thumbnailUrl: 'https://media.nxqsocial.com/thumbnails/reel.jpg',
        }),
      );
      expect(result.data[0].media[0]).not.toHaveProperty('bucket');
      expect(result.data[0].media[0]).not.toHaveProperty('s3Key');
      expect(serialized).not.toMatch(/\.r2\.cloudflarestorage\.com/i);
      expect(serialized).not.toContain('old-account');
    } finally {
      if (originalEnv.bucket === undefined) delete process.env.S3_BUCKET;
      else process.env.S3_BUCKET = originalEnv.bucket;
      if (originalEnv.publicBase === undefined) {
        delete process.env.S3_PUBLIC_BASE_URL;
      } else {
        process.env.S3_PUBLIC_BASE_URL = originalEnv.publicBase;
      }
    }
  });
});
