import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { StorageService } from '../common/storage/storage.service';

const READINESS_TIMEOUT_MS = 3_000;

async function withTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Readiness dependency timed out')),
          READINESS_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly storage: StorageService,
  ) {}

  @Get()
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      version: process.env.npm_package_version ?? '0.0.1',
    };
  }

  @Get('ready')
  async ready() {
    const checks: Record<string, 'ok' | 'error'> = {};
    const results = await Promise.allSettled([
      withTimeout(this.prisma.$queryRaw`SELECT 1`),
      withTimeout(this.redis.ping()),
      withTimeout(this.storage.checkReadiness()),
    ]);
    checks.database = results[0].status === 'fulfilled' ? 'ok' : 'error';
    checks.redis = results[1].status === 'fulfilled' ? 'ok' : 'error';
    checks.storage = results[2].status === 'fulfilled' ? 'ok' : 'error';

    const allOk = Object.values(checks).every((value) => value === 'ok');
    if (!allOk) {
      throw new ServiceUnavailableException({ status: 'degraded', checks });
    }
    return { status: 'ready', checks };
  }
}
