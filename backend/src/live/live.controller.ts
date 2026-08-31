import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { LiveService } from './live.service';
import { StartLiveDto, HeartbeatDto } from './live.dto';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

type AuthenticatedUser = { id: string };

class GuestRequestDto {
  @IsString()
  displayName!: string;
}

class ApproveGuestDto {
  @IsString()
  userId!: string;
}

class StartBattleDto {
  @IsString()
  opponentUserId!: string;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(300)
  durationSec?: number;
}

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

  @Get(':room/context')
  context(@Param('room') room: string) {
    return this.live.context(room);
  }

  /** Host starts broadcasting. */
  @Post('start')
  start(@CurrentUser() user: AuthenticatedUser, @Body() dto: StartLiveDto) {
    return this.live.start(user.id, dto.room, dto.title);
  }

  /** Host keepalive + viewer count. */
  @Post(':room/heartbeat')
  heartbeat(
    @CurrentUser() user: AuthenticatedUser,
    @Param('room') room: string,
    @Body() dto: HeartbeatDto,
  ) {
    return this.live.heartbeat(user.id, room, dto.viewerCount);
  }

  /** Host ends the broadcast. */
  @Post(':room/end')
  end(@CurrentUser() user: AuthenticatedUser, @Param('room') room: string) {
    return this.live.end(user.id, room);
  }

  /** Viewer requests to join as guest. */
  @Post(':room/guest-request')
  guestRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('room') room: string,
    @Body() dto: GuestRequestDto,
  ) {
    return this.live.requestGuestJoin(room, user.id, dto.displayName);
  }

  /** Host fetches pending guest requests. */
  @Get(':room/guest-requests')
  getGuestRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Param('room') room: string,
  ) {
    return this.live.getGuestRequests(room, user.id);
  }

  /** Host approves a guest. */
  @Post(':room/guest-approve')
  approveGuest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('room') room: string,
    @Body() dto: ApproveGuestDto,
  ) {
    return this.live.approveGuest(room, dto.userId, user.id);
  }

  /** Guest polls to check if they've been approved. */
  @Get(':room/guest-check')
  checkApproval(
    @CurrentUser() user: AuthenticatedUser,
    @Param('room') room: string,
  ) {
    return this.live.checkApproval(room, user.id);
  }

  /** Guest checks current join request state without consuming approval. */
  @Get(':room/guest-status')
  guestStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('room') room: string,
  ) {
    return this.live.guestStatus(room, user.id);
  }

  /** Guest leaves/cancels stage request so they can request again later. */
  @Post(':room/guest-leave')
  guestLeave(
    @CurrentUser() user: AuthenticatedUser,
    @Param('room') room: string,
  ) {
    return this.live.clearGuestState(room, user.id, user.id);
  }

  /** Host clears a viewer's stale/rejected guest request. */
  @Post(':room/guest-clear')
  guestClear(
    @CurrentUser() user: AuthenticatedUser,
    @Param('room') room: string,
    @Body() dto: ApproveGuestDto,
  ) {
    return this.live.clearGuestState(room, dto.userId, user.id);
  }

  @Post(':room/battle/start')
  startBattle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('room') room: string,
    @Body() dto: StartBattleDto,
  ) {
    return this.live.startBattle(
      user.id,
      room,
      dto.opponentUserId,
      dto.durationSec,
    );
  }

  @Get(':room/battle')
  battle(@Param('room') room: string) {
    return this.live.activeBattle(room);
  }

  @Post(':room/battle/end')
  endBattle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('room') room: string,
  ) {
    return this.live.endBattle(user.id, room);
  }
}
