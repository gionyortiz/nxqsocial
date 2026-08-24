import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('REDIS_URL', 'redis://localhost:6379');
        const client = new Redis(url, {
          maxRetriesPerRequest: 1,
          connectTimeout: 4000,
          commandTimeout: 5000,
          enableReadyCheck: true,
          lazyConnect: true,
        });
        client.on('error', (err) => {
          // Security-sensitive calls fail closed with a bounded 503 response.
          console.warn('[Redis] connection error:', err.message);
        });
        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
