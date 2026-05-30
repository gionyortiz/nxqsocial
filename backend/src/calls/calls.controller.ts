import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CallsService } from './calls.service';
import { CreateTokenDto, RingDto } from './calls.dto';

@Controller('calls')
@UseGuards(JwtAuthGuard)
export class CallsController {
  constructor(private readonly calls: CallsService) {}

  /** Returns whether calling is configured + the LiveKit ws URL for the client. */
  @Get('config')
  config() {
    return { enabled: !!this.calls.wsUrl, url: this.calls.wsUrl };
  }

  /** Mint a LiveKit access token to join a room. */
  @Post('token')
  token(@CurrentUser() user: any, @Body() dto: CreateTokenDto) {
    return this.calls.createToken(user.id, dto.room, {
      video: dto.video,
      host: dto.host,
    });
  }

  /** Ring one or more users (creates pending invites they poll for). */
  @Post('ring')
  ring(@CurrentUser() user: any, @Body() dto: RingDto) {
    return this.calls.ring(user.id, dto.room, dto.targets, {
      video: dto.video,
      group: dto.group,
    });
  }

  /** Poll for an incoming call invite. */
  @Get('incoming')
  incoming(@CurrentUser() user: any) {
    return this.calls.getIncoming(user.id);
  }

  /** Decline / dismiss a pending incoming call. */
  @Post('decline')
  async decline(@CurrentUser() user: any) {
    await this.calls.clearIncoming(user.id);
    return { ok: true };
  }
}
