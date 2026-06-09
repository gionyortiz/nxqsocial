import { Test } from '@nestjs/testing';
import { MediaService } from './media.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../common/storage/storage.service';
import { MediaSafetyService } from '../safety/media-safety.service';

const mockPrisma = {
  mediaAsset: {
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

const mockStorage = {
  isEnabled: true,
  exists: jest.fn(),
  publicUrl: jest.fn(),
  delete: jest.fn(),
};

const mockSafety = {
  startVideoScanJob: jest.fn(),
  pollVideoScan: jest.fn(),
  statusFromScan: jest.fn(),
  scanImageFromS3: jest.fn(),
};

describe('MediaService', () => {
  let service: MediaService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorage },
        { provide: MediaSafetyService, useValue: mockSafety },
      ],
    }).compile();

    service = module.get(MediaService);
    jest.clearAllMocks();
    mockStorage.publicUrl.mockReturnValue('https://cdn.example.com/video.mp4');
    mockStorage.delete.mockResolvedValue(undefined);
  });

  it('finalizes a successful video moderation job during status polling', async () => {
    mockPrisma.mediaAsset.findUnique.mockResolvedValue({
      id: 'media-1',
      userId: 'user-1',
      uploadStatus: 'SCANNING',
      moderationStatus: 'PENDING',
      safetyJobId: 'job-1',
      safetyResult: { scanStartedAt: new Date().toISOString() },
      updatedAt: new Date(),
      createdAt: new Date(),
      url: 'https://cdn.example.com/video.mp4',
      mimeType: 'video/mp4',
      size: 123,
    });
    mockSafety.pollVideoScan.mockResolvedValue({
      status: 'SUCCEEDED',
      result: { safe: true, labels: [], maxConfidence: 0, provider: 'rekognition' },
    });
    mockSafety.statusFromScan.mockReturnValue('PUBLISHED');
    mockPrisma.mediaAsset.update.mockResolvedValue({
      id: 'media-1',
      userId: 'user-1',
      uploadStatus: 'PUBLISHED',
      moderationStatus: 'APPROVED',
      safetyResult: { status: 'SUCCEEDED' },
      url: 'https://cdn.example.com/video.mp4',
      mimeType: 'video/mp4',
      size: 123,
    });

    const result = await service.getStatus('user-1', 'media-1');

    expect(mockPrisma.mediaAsset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          uploadStatus: 'PUBLISHED',
          moderationStatus: 'APPROVED',
        }),
      }),
    );
    expect(result.uploadStatus).toBe('PUBLISHED');
  });

  it('marks failed video moderation jobs as rejected with a user-facing message', async () => {
    mockPrisma.mediaAsset.findUnique.mockResolvedValue({
      id: 'media-2',
      userId: 'user-1',
      uploadStatus: 'SCANNING',
      moderationStatus: 'PENDING',
      safetyJobId: 'job-2',
      safetyResult: { scanStartedAt: new Date().toISOString() },
      updatedAt: new Date(),
      createdAt: new Date(),
      url: 'https://cdn.example.com/video.mp4',
      mimeType: 'video/mp4',
      size: 456,
    });
    mockSafety.pollVideoScan.mockResolvedValue({
      status: 'FAILED',
      failureReason: 'Unsupported codec',
      userMessage: 'This video format could not be processed. Please upload MP4/H.264.',
    });
    mockPrisma.mediaAsset.update.mockResolvedValue({
      id: 'media-2',
      userId: 'user-1',
      uploadStatus: 'REJECTED',
      moderationStatus: 'FLAGGED',
      safetyResult: { userMessage: 'This video format could not be processed. Please upload MP4/H.264.' },
      url: 'https://cdn.example.com/video.mp4',
      mimeType: 'video/mp4',
      size: 456,
    });

    const result = await service.getStatus('user-1', 'media-2');

    expect(mockPrisma.mediaAsset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          uploadStatus: 'REJECTED',
          moderationStatus: 'FLAGGED',
        }),
      }),
    );
    expect(result.message).toContain('MP4/H.264');
  });

  it('times out long-running video moderation into review instead of scanning forever', async () => {
    const oldTime = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    mockPrisma.mediaAsset.findUnique.mockResolvedValue({
      id: 'media-3',
      userId: 'user-1',
      uploadStatus: 'SCANNING',
      moderationStatus: 'PENDING',
      safetyJobId: 'job-3',
      safetyResult: { scanStartedAt: oldTime },
      updatedAt: new Date(oldTime),
      createdAt: new Date(oldTime),
      url: 'https://cdn.example.com/video.mp4',
      mimeType: 'video/mp4',
      size: 789,
    });
    mockSafety.pollVideoScan.mockResolvedValue({ status: 'IN_PROGRESS' });
    mockPrisma.mediaAsset.update.mockResolvedValue({
      id: 'media-3',
      userId: 'user-1',
      uploadStatus: 'PUBLISHED',
      moderationStatus: 'FLAGGED',
      safetyResult: { userMessage: 'Video uploaded. Safety review is still processing. You can leave this page and check again later.' },
      url: 'https://cdn.example.com/video.mp4',
      mimeType: 'video/mp4',
      size: 789,
    });

    const result = await service.getStatus('user-1', 'media-3');

    expect(mockPrisma.mediaAsset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          uploadStatus: 'PUBLISHED',
          moderationStatus: 'FLAGGED',
        }),
      }),
    );
    expect(result.uploadStatus).toBe('PUBLISHED');
  });

  it('rejects uploads when video moderation cannot start and returns a user-friendly codec message', async () => {
    mockPrisma.mediaAsset.findUnique.mockResolvedValue({
      id: 'media-4',
      userId: 'user-1',
      uploadStatus: 'PENDING',
      bucket: 'bucket',
      s3Key: 'uploads/user-1/video.mov',
      mimeType: 'video/quicktime',
    });
    mockStorage.exists.mockResolvedValue(true);
    mockSafety.startVideoScanJob.mockResolvedValue({
      status: 'FAILED',
      jobId: null,
      failureReason: 'Unsupported codec',
      userMessage: 'This video format could not be processed. Please upload MP4/H.264.',
    });
    mockPrisma.mediaAsset.update.mockResolvedValue({
      id: 'media-4',
      uploadStatus: 'REJECTED',
      url: 'https://cdn.example.com/video.mp4',
    });

    const result = await service.completeUpload('user-1', 'media-4');

    expect(mockPrisma.mediaAsset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          uploadStatus: 'REJECTED',
          moderationStatus: 'FLAGGED',
        }),
      }),
    );
    expect(result.message).toContain('MP4/H.264');
  });
});