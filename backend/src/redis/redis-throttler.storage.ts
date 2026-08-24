import type Redis from 'ioredis';
import { ServiceUnavailableException } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';

const INCREMENT_SCRIPT = `
local block_ttl = redis.call('PTTL', KEYS[2])
if block_ttl > 0 then
  return { tonumber(ARGV[2]) + 1, 0, 1, math.ceil(block_ttl / 1000) }
end

local hits = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if hits == 1 or ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end

if hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  redis.call('DEL', KEYS[1])
  return { hits, 0, 1, math.ceil(tonumber(ARGV[3]) / 1000) }
end

return { hits, math.ceil(ttl / 1000), 0, 0 }
`;

/** Shared Redis storage for @nestjs/throttler. */
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const namespace = `nxq:throttle:${throttlerName}:${key}`;
    try {
      const result = await this.redis.eval(
        INCREMENT_SCRIPT,
        2,
        `${namespace}:hits`,
        `${namespace}:blocked`,
        String(ttl),
        String(limit),
        String(blockDuration),
      );
      if (!Array.isArray(result) || result.length < 4) {
        throw new Error('Invalid Redis throttler response');
      }

      const values = result.slice(0, 4).map(Number);
      if (values.some((value) => !Number.isFinite(value))) {
        throw new Error('Invalid Redis throttler response');
      }

      return {
        totalHits: values[0],
        timeToExpire: values[1],
        isBlocked: values[2] === 1,
        timeToBlockExpire: values[3],
      };
    } catch {
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: 'Service Unavailable',
        code: 'RATE_LIMIT_UNAVAILABLE',
        message: 'Request rate-limit verification is temporarily unavailable.',
      });
    }
  }
}
