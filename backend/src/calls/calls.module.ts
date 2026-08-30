import { Module } from '@nestjs/common';
import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { LiveModule } from '../live/live.module';

@Module({
  imports: [NotificationsModule, LiveModule],
  controllers: [CallsController],
  providers: [CallsService],
})
export class CallsModule {}
