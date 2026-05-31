import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { LiveService } from './live.service';
import { StartLiveDto, HeartbeatDto } from './live.dto';

@Controller('live')
@UseGuards(JwtAuthGuard)
export class LiveController {
  constructor(private readonly live: LiveService) {}

  /** Currently-live broadcasts (for the feed "Live now" rail). */
  @Get('active')
  active() {
    return this.live.active();
  }

  /** The active live for a username, or null (for profile LIVE badge). */
  @Get('user/:username')
  forUser(@Param('username') username: string) {
    return this.live.forUser(username);
  }

  /** Host starts broadcasting. */
  @Post('start')
  start(@CurrentUser() user: any, @Body() dto: StartLiveDto) {
    return this.live.start(user.id, dto.room, dto.title);
  }

  /** Host keepalive + viewer count. */
  @Post(':room/heartbeat')
  heartbeat(
    @CurrentUser() user: any,
    @Param('room') room: string,
    @Body() dto: HeartbeatDto,
  ) {
    return this.live.heartbeat(user.id, room, dto.viewerCount);
  }

  /** Host ends the broadcast. */
  @Post(':room/end')
  end(@CurrentUser() user: any, @Param('room') room: string) {
    return this.live.end(user.id, room);
  }
}
