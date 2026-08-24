import { RedisThrottlerStorage } from './redis-throttler.storage';
import type Redis from 'ioredis';
import { ServiceUnavailableException } from '@nestjs/common';

class LimiterRedisFake {
  now = 0;
  lastScript = '';
  hitState: { count: number; expiresAt: number } | undefined;
  blockedUntil = 0;

  eval(
    script: string,
    _keyCount: number,
    _hitsKey: string,
    _blockedKey: string,
    ttlValue: string,
    limitValue: string,
    blockDurationValue: string,
  ): Promise<number[]> {
    this.lastScript = script;
    const ttl = Number(ttlValue);
    const limit = Number(limitValue);
    const blockDuration = Number(blockDurationValue);

    if (this.blockedUntil > this.now) {
      return Promise.resolve([
        limit + 1,
        0,
        1,
        Math.ceil((this.blockedUntil - this.now) / 1000),
      ]);
    }
    if (this.hitState && this.hitState.expiresAt <= this.now) {
      this.hitState = undefined;
    }

    const count = (this.hitState?.count ?? 0) + 1;
    const expiresAt = this.hitState?.expiresAt ?? this.now + ttl;
    this.hitState = { count, expiresAt };
    if (count > limit) {
      this.blockedUntil = this.now + blockDuration;
      this.hitState = undefined;
      return Promise.resolve([count, 0, 1, Math.ceil(blockDuration / 1000)]);
    }

    return Promise.resolve([
      count,
      Math.ceil((expiresAt - this.now) / 1000),
      0,
      0,
    ]);
  }

  advance(milliseconds: number) {
    this.now += milliseconds;
  }
}

describe('RedisThrottlerStorage', () => {
  it('maps the atomic Redis result to the Nest throttler record', async () => {
    const redis = {
      eval: jest.fn().mockResolvedValue([7, 42, 1, 30]),
    };
    const storage = new RedisThrottlerStorage(redis as unknown as Redis);

    await expect(
      storage.increment('request-key', 60_000, 5, 30_000, 'auth'),
    ).resolves.toEqual({
      totalHits: 7,
      timeToExpire: 42,
      isBlocked: true,
      timeToBlockExpire: 30,
    });
    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      2,
      'nxq:throttle:auth:request-key:hits',
      'nxq:throttle:auth:request-key:blocked',
      '60000',
      '5',
      '30000',
    );
  });

  it('does not accumulate blocked calls and starts the next window at one', async () => {
    const redis = new LimiterRedisFake();
    const storage = new RedisThrottlerStorage(redis as unknown as Redis);

    await expect(
      storage.increment('key', 60_000, 2, 5_000, 'auth'),
    ).resolves.toMatchObject({
      totalHits: 1,
      isBlocked: false,
    });
    await storage.increment('key', 60_000, 2, 5_000, 'auth');
    await expect(
      storage.increment('key', 60_000, 2, 5_000, 'auth'),
    ).resolves.toMatchObject({
      totalHits: 3,
      isBlocked: true,
    });
    expect(redis.hitState).toBeUndefined();

    for (let blockedCall = 0; blockedCall < 100; blockedCall += 1) {
      await expect(
        storage.increment('key', 60_000, 2, 5_000, 'auth'),
      ).resolves.toMatchObject({
        totalHits: 3,
        isBlocked: true,
      });
    }
    expect(redis.hitState).toBeUndefined();

    redis.advance(5_001);
    await expect(
      storage.increment('key', 60_000, 2, 5_000, 'auth'),
    ).resolves.toMatchObject({
      totalHits: 1,
      isBlocked: false,
    });

    expect(
      redis.lastScript.indexOf("local block_ttl = redis.call('PTTL', KEYS[2])"),
    ).toBeLessThan(
      redis.lastScript.indexOf("local hits = redis.call('INCR', KEYS[1])"),
    );
    expect(redis.lastScript).toContain("redis.call('DEL', KEYS[1])");
  });

  it('fails closed with a 503 when Redis evaluation fails', async () => {
    const redis = {
      eval: () => Promise.reject(new Error('Redis unavailable')),
    };
    const storage = new RedisThrottlerStorage(redis as unknown as Redis);
    const startedAt = Date.now();

    await expect(
      storage.increment('key', 60_000, 2, 5_000, 'auth'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      storage.increment('key', 60_000, 2, 5_000, 'auth'),
    ).rejects.toMatchObject({
      status: 503,
    });
    expect(Date.now() - startedAt).toBeLessThan(1_000);
  });
});
