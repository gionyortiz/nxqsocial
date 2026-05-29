import { Controller, Post, Get, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './comments.dto';
import { ActionRateLimitGuard, RateLimitAction } from '../common/guards/action-rate-limit.guard';

@Controller('posts/:postId/comments')
@UseGuards(JwtAuthGuard)
export class CommentsController {
  constructor(private commentsService: CommentsService) {}

  @Post()
  @UseGuards(ActionRateLimitGuard)
  @RateLimitAction('comment')
  create(
    @Param('postId') postId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateCommentDto,
  ) {
    return this.commentsService.create(user.id, postId, dto);
  }

  @Get()
  findAll(@Param('postId') postId: string, @Query('cursor') cursor?: string) {
    return this.commentsService.findByPost(postId, cursor);
  }

  @Delete(':commentId')
  delete(@Param('commentId') commentId: string, @CurrentUser() user: any) {
    return this.commentsService.delete(commentId, user.id);
  }
}
