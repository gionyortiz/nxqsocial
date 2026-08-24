import { ServiceUnavailableException } from '@nestjs/common';
import type Redis from 'ioredis';
import { HealthController } from './health.controller';
import type { PrismaService } from '../prisma/prisma.service';
import type { StorageService } from '../common/storage/storage.service';

describe('HealthController', () => {
  const prisma = { $queryRaw: jest.fn() };
  const redis = { ping: jest.fn() };
  const storage = { checkReadiness: jest.fn() };
  const controller = new HealthController(
    prisma as unknown as PrismaService,
    redis as unknown as Redis,
    storage as unknown as StorageService,
  );

  beforeEach(() => {
    prisma.$queryRaw.mockReset();
    redis.ping.mockReset();
    storage.checkReadiness.mockReset();
  });

  it('reports process liveness without checking dependencies', () => {
    expect(controller.check()).toMatchObject({ status: 'ok', version: '0.0.1' });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(redis.ping).not.toHaveBeenCalled();
    expect(storage.checkReadiness).not.toHaveBeenCalled();
  });

  it('reports ready only when every stateful dependency responds', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    redis.ping.mockResolvedValue('PONG');
    storage.checkReadiness.mockResolvedValue(undefined);

    await expect(controller.ready()).resolves.toEqual({
      status: 'ready',
      checks: { database: 'ok', redis: 'ok', storage: 'ok' },
    });
  });

  it.each([
    ['database', new Error('database unavailable'), 'PONG', undefined],
    ['redis', [{ '?column?': 1 }], new Error('redis unavailable'), undefined],
    ['storage', [{ '?column?': 1 }], 'PONG', new Error('storage unavailable')],
  ])(
    'returns 503 when %s is unavailable',
    async (failedDependency, databaseResult, redisResult, storageResult) => {
      if (databaseResult instanceof Error) {
        prisma.$queryRaw.mockRejectedValue(databaseResult);
      } else {
        prisma.$queryRaw.mockResolvedValue(databaseResult);
      }
      if (redisResult instanceof Error) {
        redis.ping.mockRejectedValue(redisResult);
      } else {
        redis.ping.mockResolvedValue(redisResult);
      }
      if (storageResult instanceof Error) {
        storage.checkReadiness.mockRejectedValue(storageResult);
      } else {
        storage.checkReadiness.mockResolvedValue(undefined);
      }

      let thrown: unknown;
      try {
        await controller.ready();
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(ServiceUnavailableException);
      expect((thrown as ServiceUnavailableException).getResponse()).toMatchObject({
        status: 'degraded',
        checks: {
          database: failedDependency === 'database' ? 'error' : 'ok',
          redis: failedDependency === 'redis' ? 'error' : 'ok',
          storage: failedDependency === 'storage' ? 'error' : 'ok',
        },
      });
    },
  );
});
