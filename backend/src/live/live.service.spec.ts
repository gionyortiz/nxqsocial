/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { LiveService } from './live.service';

describe('LiveService governance', () => {
  const redis = {
    lrange: jest.fn(),
    lrem: jest.fn(),
    lpush: jest.fn(),
    expire: jest.fn(),
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('refuses guest approval by anyone except the room owner', async () => {
    const prisma = {
      liveSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'session-1',
          hostId: 'host-1',
          status: 'LIVE',
        }),
      },
    };
    const service = new LiveService(prisma as any, redis as any);

    await expect(
      service.approveGuest('live-room', 'guest-1', 'attacker-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('uses persisted host/co-host membership as publish authority', async () => {
    const prisma = {
      liveSession: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            status: 'LIVE',
            hostId: 'host-1',
            participants: [],
          })
          .mockResolvedValueOnce({
            status: 'LIVE',
            hostId: 'host-1',
            participants: [{ role: 'COHOST' }],
          })
          .mockResolvedValueOnce({
            status: 'ENDED',
            hostId: 'host-1',
            participants: [],
          }),
      },
    };
    const service = new LiveService(prisma as any, redis as any);

    await expect(service.canPublish('live-room', 'host-1')).resolves.toBe(true);
    await expect(service.canPublish('live-room', 'guest-1')).resolves.toBe(
      true,
    );
    await expect(service.canPublish('live-room', 'host-1')).resolves.toBe(
      false,
    );
  });

  it('enforces the five co-host limit', async () => {
    const prisma = {
      liveSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'session-1',
          hostId: 'host-1',
          status: 'LIVE',
        }),
      },
      liveParticipant: {
        count: jest.fn().mockResolvedValue(5),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new LiveService(prisma as any, redis as any);

    await expect(
      service.approveGuest('live-room', 'guest-6', 'host-1'),
    ).rejects.toThrow('at most 5 co-hosts');
  });

  it('requires an approved co-host before starting a battle', async () => {
    const prisma = {
      liveSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'session-1',
          hostId: 'host-1',
          status: 'LIVE',
        }),
      },
      liveParticipant: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new LiveService(prisma as any, redis as any);

    await expect(
      service.startBattle('host-1', 'live-room', 'viewer-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
