import { Controller, Post, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { FollowsService } from './follows.service';
import { ActionRateLimitGuard, RateLimitAction } from '../common/guards/action-rate-limit.guard';

@Controller('users/:username/follow')
@UseGuards(JwtAuthGuard)
export class FollowsController {
  constructor(private followsService: FollowsService) {}

  @Post()
  @UseGuards(ActionRateLimitGuard)
  @RateLimitAction('follow')
  toggle(@Param('username') username: string, @CurrentUser() user: any) {
    return this.followsService.toggle(user.id, username);
  }

  @Get('followers')
  getFollowers(@Param('username') username: string) {
    return this.followsService.getFollowers(username);
  }

  @Get('following')
  getFollowing(@Param('username') username: string) {
    return this.followsService.getFollowing(username);
  }
}
