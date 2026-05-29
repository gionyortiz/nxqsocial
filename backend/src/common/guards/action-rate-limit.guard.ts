/**
 * Redis-backed action rate limiter (falls back to in-memory if Redis is unavailable).
 *
 * Limits per sliding window:
 *
 *   Action         UNVERIFIED/BASIC    HUMAN_VERIFIED    ID_VERIFIED+
 *   -----------------------------------------------------------------
 *   comment        20 / hour           100 / hour        500 / hour
 *   like           50 / hour           200 / hour        unlimited
 *   follow         20 / day            100 / day         unlimited
 */

import {
  CanActivate, ExecutionContext, Injectable,
  HttpException, HttpStatus, SetMetadata, Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.module';

export const RATE_LIMIT_ACTION = 'RATE_LIMIT_ACTION';
export const RateLimitAction = (action: 'comment' | 'like' | 'follow') =>
  SetMetadata(RATE_LIMIT_ACTION, action);

type Tier = 'low' | 'human' | 'id_plus';

interface WindowCfg { maxRequests: number; windowMs: number }

const LIMITS: Record<string, Record<Tier, WindowCfg>> = {
  comment: {
    low:     { maxRequests: 20,       windowMs: 60 * 60 * 1000 },
    human:   { maxRequests: 100,      windowMs: 60 * 60 * 1000 },
    id_plus: { maxRequests: 500,      windowMs: 60 * 60 * 1000 },
  },
  like: {
    low:     { maxRequests: 50,       windowMs: 60 * 60 * 1000 },
    human:   { maxRequests: 200,      windowMs: 60 * 60 * 1000 },
    id_plus: { maxRequests: Infinity, windowMs: 60 * 60 * 1000 },
  },
  follow: {
    low:     { maxRequests: 20,       windowMs: 24 * 60 * 60 * 1000 },
    human:   { maxRequests: 100,      windowMs: 24 * 60 * 60 * 1000 },
    id_plus: { maxRequests: Infinity, windowMs: 24 * 60 * 60 * 1000 },
  },
};

/** In-memory fallback store (used when Redis is unavailable) */
const memStore = new Map<string, { count: number; resetAt: number }>();

function getTier(verificationStatus: string): Tier {
  if (verificationStatus === 'ID_VERIFIED' || verificationStatus === 'BUSINESS_VERIFIED') return 'id_plus';
  if (verificationStatus === 'HUMAN_VERIFIED') return 'human';
  return 'low';
}

@Injectable()
export class ActionRateLimitGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @Inject(REDIS_CLIENT) private redis: Redis,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const action = this.reflector.get<string>(RATE_LIMIT_ACTION, ctx.getHandler());
    if (!action) return true;

    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    if (!user) return true;

    const tier = getTier(user.verificationStatus ?? 'BASIC');
    const cfg = LIMITS[action]?.[tier];
    if (!cfg || cfg.maxRequests === Infinity) return true;

    const key = `rl:${user.id}:${action}`;
    const windowSec = Math.ceil(cfg.windowMs / 1000);

    let count: number;
    try {
      // Redis INCR + EXPIRE (atomic sliding window)
      const result = await this.redis.incr(key);
      if (result === 1) await this.redis.expire(key, windowSec);
      count = result;
    } catch {
      // Redis unavailable — fall back to in-memory
      const now = Date.now();
      const entry = memStore.get(key);
      if (!entry || now > entry.resetAt) {
        memStore.set(key, { count: 1, resetAt: now + cfg.windowMs });
        return true;
      }
      entry.count += 1;
      count = entry.count;
    }

    if (count > cfg.maxRequests) {
      let retryAfterSec = windowSec;
      try {
        const ttl = await this.redis.ttl(key);
        if (ttl > 0) retryAfterSec = ttl;
      } catch { /* ignore */ }

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: `Rate limit exceeded for '${action}'. Verify your account to increase limits.`,
          retryAfter: retryAfterSec,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
