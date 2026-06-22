import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationFeedService } from './notification-feed.service';
import { NotificationFeedController } from './notification-feed.controller';
import { NotificationsModule } from '../notifications/notifications.module';

import { Global } from '@nestjs/common';

@Global()
@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [NotificationFeedController],
  providers: [NotificationFeedService],
  exports: [NotificationFeedService],
})
export class NotificationFeedModule {}
