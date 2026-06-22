import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { NotificationFeedService } from './notification-feed.service';
import { NotificationsService } from '../notifications/notifications.service';

class PushTokenDto {
  @IsString()
  token!: string;
}

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationFeedController {
  constructor(
    private readonly notifications: NotificationFeedService,
    private readonly push: NotificationsService,
  ) {}

  /** List the current user's notifications (paginated). */
  @Get()
  list(@CurrentUser() user: any, @Query('cursor') cursor?: string) {
    return this.notifications.list(user.id, cursor);
  }

  /** Number of unread notifications (for the nav badge). */
  @Get('unread-count')
  unreadCount(@CurrentUser() user: any) {
    return this.notifications.unreadCount(user.id);
  }

  /** Mark a single notification as read. */
  @Post(':id/read')
  markRead(@CurrentUser() user: any, @Param('id') id: string) {
    return this.notifications.markRead(user.id, id);
  }

  /** Mark all notifications as read. */
  @Post('read-all')
  markAllRead(@CurrentUser() user: any) {
    return this.notifications.markAllRead(user.id);
  }

  /** Register a mobile Expo push token for this user. */
  @Post('push/register')
  registerPush(@CurrentUser() user: any, @Body() dto: PushTokenDto) {
    return this.push.registerPushToken(user.id, dto.token);
  }

  /** Remove a mobile Expo push token for this user. */
  @Post('push/unregister')
  unregisterPush(@CurrentUser() user: any, @Body() dto: PushTokenDto) {
    return this.push.unregisterPushToken(user.id, dto.token);
  }
}
