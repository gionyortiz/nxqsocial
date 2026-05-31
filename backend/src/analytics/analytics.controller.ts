import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { TrackEventDto } from './analytics.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Post('events/public')
  async trackPublic(@Body() dto: TrackEventDto) {
    await this.analytics.track(dto, null);
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post('events')
  async trackAuthed(@CurrentUser() user: any, @Body() dto: TrackEventDto) {
    await this.analytics.track(dto, user.id);
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('admin/dashboard')
  dashboard(@Query('days') days?: string) {
    return this.analytics.dashboard(Number(days) || 30);
  }
}
