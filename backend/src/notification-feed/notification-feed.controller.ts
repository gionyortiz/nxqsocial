import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { NotificationFeedService } from './notification-feed.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationFeedController {
  constructor(private readonly notifications: NotificationFeedService) {}

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
}
