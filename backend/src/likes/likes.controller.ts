import { Controller, Post, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { LikesService } from './likes.service';
import { ActionRateLimitGuard, RateLimitAction } from '../common/guards/action-rate-limit.guard';

@Controller('posts/:postId/likes')
@UseGuards(JwtAuthGuard)
export class LikesController {
  constructor(private likesService: LikesService) {}

  @Post()
  @UseGuards(ActionRateLimitGuard)
  @RateLimitAction('like')
  toggle(@Param('postId') postId: string, @CurrentUser() user: any) {
    return this.likesService.toggle(user.id, postId);
  }
}

