import { ObjectCleanupService } from './object-cleanup.service';

describe('ObjectCleanupService', () => {
  const now = new Date('2026-08-24T00:00:00.000Z');
  const job = (overrides: Record<string, unknown> = {}) => ({
    id: 'cleanup-1',
    kind: 'PUBLIC_STORAGE',
    reference: 'images/user-1/photo.jpg',
    allowedPrefixes: ['images'],
    source: 'test',
    attempts: 0,
    nextAttemptAt: now,
    lastError: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });

  const prisma = {
    objectCleanupJob: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const storage = {
    deleteManagedObject: jest.fn(),
    deleteIncoming: jest.fn(),
  };
  const safety = {
    cleanupVideoScanObject: jest.fn(),
  };
  let service: ObjectCleanupService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.objectCleanupJob.findMany.mockResolvedValue([]);
    prisma.objectCleanupJob.deleteMany.mockResolvedValue({ count: 1 });
    prisma.objectCleanupJob.updateMany.mockResolvedValue({ count: 1 });
    storage.deleteManagedObject.mockResolvedValue(true);
    storage.deleteIncoming.mockResolvedValue(undefined);
    safety.cleanupVideoScanObject.mockResolvedValue(undefined);
    service = new ObjectCleanupService(
      prisma as any,
      storage as any,
      safety as any,
    );
  });

  it('deletes a completed public-storage job with an optimistic claim', async () => {
    const current = job();
    prisma.objectCleanupJob.findMany.mockResolvedValue([current]);

    await service.drain();

    expect(storage.deleteManagedObject).toHaveBeenCalledWith(
      current.reference,
      current.allowedPrefixes,
    );
    expect(prisma.objectCleanupJob.deleteMany).toHaveBeenCalledWith({
      where: { id: current.id, updatedAt: current.updatedAt },
    });
    expect(prisma.objectCleanupJob.updateMany).not.toHaveBeenCalled();
  });

  it('keeps a failed job and applies bounded exponential backoff', async () => {
    const current = job({ attempts: 2 });
    prisma.objectCleanupJob.findMany.mockResolvedValue([current]);
    storage.deleteManagedObject.mockRejectedValue(
      new Error('object storage unavailable'),
    );

    const before = Date.now();
    await service.drain();

    expect(prisma.objectCleanupJob.deleteMany).not.toHaveBeenCalled();
    expect(prisma.objectCleanupJob.updateMany).toHaveBeenCalledWith({
      where: { id: current.id, updatedAt: current.updatedAt },
      data: expect.objectContaining({
        attempts: { increment: 1 },
        lastError: 'object storage unavailable',
        nextAttemptAt: expect.any(Date),
      }),
    });
    const update = prisma.objectCleanupJob.updateMany.mock.calls[0][0];
    expect(update.data.nextAttemptAt.getTime()).toBeGreaterThan(before);
  });

  it('executes quarantine and moderation cleanup only in their owned prefixes', async () => {
    prisma.objectCleanupJob.findMany.mockResolvedValue([
      job({
        id: 'quarantine-1',
        kind: 'QUARANTINE_STORAGE',
        reference: 'incoming/user-1/upload.mp4',
        allowedPrefixes: [],
      }),
      job({
        id: 'immutable-1',
        kind: 'QUARANTINE_STORAGE',
        reference: 'processing/media-finalizing/media-1/token.mp4',
        allowedPrefixes: [],
      }),
      job({
        id: 'moderation-1',
        kind: 'MODERATION_STORAGE',
        reference: 'nxq-social/scan.mp4',
        allowedPrefixes: [],
      }),
    ]);

    await service.drain();

    expect(storage.deleteIncoming).toHaveBeenCalledWith(
      'incoming/user-1/upload.mp4',
    );
    expect(storage.deleteIncoming).toHaveBeenCalledWith(
      'processing/media-finalizing/media-1/token.mp4',
    );
    expect(safety.cleanupVideoScanObject).toHaveBeenCalledWith(
      'nxq-social/scan.mp4',
    );
    expect(prisma.objectCleanupJob.deleteMany).toHaveBeenCalledTimes(3);
  });

  it('refuses a quarantine key outside the two exact owned prefixes and retains the job', async () => {
    const current = job({
      kind: 'QUARANTINE_STORAGE',
      reference: 'videos/not-quarantine.mp4',
      allowedPrefixes: [],
    });
    prisma.objectCleanupJob.findMany.mockResolvedValue([current]);

    await service.drain();

    expect(storage.deleteIncoming).not.toHaveBeenCalled();
    expect(prisma.objectCleanupJob.deleteMany).not.toHaveBeenCalled();
    expect(prisma.objectCleanupJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastError: 'Quarantine cleanup key is outside owned prefixes',
        }),
      }),
    );
  });

  it.each([
    'incoming-evil/user/file.mp4',
    'incoming/../escape.mp4',
    'processing/not-media/file.mp4',
    'processing/media-finalizing-evil/file.mp4',
    'processing/media-finalizing/../escape.mp4',
  ])('rejects near-prefix or traversal quarantine key %s', async (reference) => {
    await expect(
      (service as any).execute({
        kind: 'QUARANTINE_STORAGE',
        reference,
        allowedPrefixes: [],
      }),
    ).rejects.toThrow('Quarantine cleanup key is outside owned prefixes');
    expect(storage.deleteIncoming).not.toHaveBeenCalled();
  });

  it('refuses an absolute local path outside the application upload root', async () => {
    await expect(
      (service as any).execute({
        kind: 'LOCAL_UPLOAD',
        reference: 'C:\\Windows\\System32\\drivers\\etc\\hosts',
        allowedPrefixes: ['images'],
      }),
    ).rejects.toThrow('Cleanup path is outside the upload root');
  });
});
