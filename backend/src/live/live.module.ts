import { Module } from '@nestjs/common';
import { LiveController } from './live.controller';
import { LiveService } from './live.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RedisModule],
  controllers: [LiveController],
  providers: [LiveService],
  exports: [LiveService],
})
export class LiveModule {}
