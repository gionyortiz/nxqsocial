/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { ForbiddenException } from '@nestjs/common';
import { CallsService } from './calls.service';

describe('CallsService token authority', () => {
  const config = {
    get: jest.fn(
      (name: string) =>
        ({
          LIVEKIT_API_KEY: 'test-key',
          LIVEKIT_API_SECRET: 'test-secret-with-enough-length',
          LIVEKIT_URL: 'wss://livekit.test',
        })[name],
    ),
  };
  const notifications = { sendPushToUsers: jest.fn() };

  beforeEach(() => jest.clearAllMocks());

  it('refuses a live publisher token when the server has not approved the user', async () => {
    const prisma = {
      liveSession: {
        findUnique: jest.fn().mockResolvedValue({ id: 'session-1' }),
      },
    };
    const live = { canPublish: jest.fn().mockResolvedValue(false) };
    const service = new CallsService(
      config as any,
      prisma as any,
      notifications as any,
      live as any,
      {} as any,
    );

    await expect(
      service.createToken('viewer-1', 'live-room', { host: true }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(live.canPublish).toHaveBeenCalledWith('live-room', 'viewer-1');
  });

  it('refuses an uninvited user from a private group call', async () => {
    const prisma = {
      liveSession: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const redis = { sismember: jest.fn().mockResolvedValue(0) };
    const service = new CallsService(
      config as any,
      prisma as any,
      notifications as any,
      { canPublish: jest.fn() } as any,
      redis as any,
    );

    await expect(
      service.createToken('outsider-1', 'group-private', { host: true }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses arbitrary rooms that were never created as a live or call', async () => {
    const prisma = {
      liveSession: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = new CallsService(
      config as any,
      prisma as any,
      notifications as any,
      { canPublish: jest.fn() } as any,
      {} as any,
    );

    await expect(
      service.createToken('user-1', 'made-up-room', { host: true }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
