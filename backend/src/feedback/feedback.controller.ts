import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AdminGuard } from '../auth/admin.guard';
import { CreateFeedbackDto, FeedbackAdminQueryDto, UpdateFeedbackStatusDto } from './feedback.dto';
import { FeedbackService } from './feedback.service';

@Controller('feedback')
@UseGuards(JwtAuthGuard)
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 8, ttl: 600000 } })
  @Post()
  create(
    @CurrentUser() user: any,
    @Body() dto: CreateFeedbackDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.feedback.create(user.id, dto, userAgent);
  }

  @UseGuards(AdminGuard)
  @Get('admin')
  list(@Query() query: FeedbackAdminQueryDto) {
    return this.feedback.list(query);
  }

  @UseGuards(AdminGuard)
  @Get('admin/stats')
  stats() {
    return this.feedback.stats();
  }

  @UseGuards(AdminGuard)
  @Patch('admin/:id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateFeedbackStatusDto) {
    return this.feedback.updateStatus(id, dto);
  }
}
