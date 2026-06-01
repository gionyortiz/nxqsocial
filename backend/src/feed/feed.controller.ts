import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PostsService } from '../posts/posts.service';

@Controller('feed')
@UseGuards(JwtAuthGuard)
export class FeedController {
  constructor(private readonly postsService: PostsService) {}

  @Get('stories')
  getStories(@CurrentUser() user: any, @Query('take') take?: string): Promise<any> {
    const parsed = Number(take);
    const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 30) : 20;
    return this.postsService.getStoryCandidates(user.id, limit);
  }
}
