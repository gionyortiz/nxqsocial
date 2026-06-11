import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationFeedService } from './notification-feed.service';
import { NotificationFeedController } from './notification-feed.controller';

import { Global } from '@nestjs/common';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [NotificationFeedController],
  providers: [NotificationFeedService],
  exports: [NotificationFeedService],
})
export class NotificationFeedModule {}
