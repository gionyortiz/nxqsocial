import { Controller, Post, Get, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { StoriesService } from './stories.service';
import { CreateStoryDto } from './stories.dto';

@Controller('stories')
@UseGuards(JwtAuthGuard)
export class StoriesController {
  constructor(private storiesService: StoriesService) {}

  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateStoryDto) {
    return this.storiesService.createFromAsset(user.id, dto);
  }

  @Get('feed')
  getFeed(@CurrentUser() user: any) {
    return this.storiesService.getFeed(user.id);
  }

  @Get('user/:username')
  getForUser(@Param('username') username: string, @CurrentUser() user: any) {
    return this.storiesService.getActiveStoriesForUser(username, user.id);
  }

  @Post(':id/view')
  recordView(@Param('id') id: string, @CurrentUser() user: any) {
    return this.storiesService.recordView(id, user.id);
  }

  @Delete(':id')
  deleteOwn(@Param('id') id: string, @CurrentUser() user: any) {
    return this.storiesService.deleteOwn(id, user.id);
  }
}
