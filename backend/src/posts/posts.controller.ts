import {
  Controller, Post, Get, Delete, Param, Body, Query,
  UseGuards, UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PostsService } from './posts.service';
import { CreatePostDto } from './posts.dto';

@Controller('posts')
@UseGuards(JwtAuthGuard)
export class PostsController {
  constructor(private postsService: PostsService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('media', {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.match(/^(image\/(jpeg|png|webp)|video\/mp4)$/)) {
          return cb(
            new BadRequestException('Unsupported file type. Videos must be MP4 (H.264/AAC).'),
            false,
          );
        }
        cb(null, true);
      },
      limits: { fileSize: 100 * 1024 * 1024 },
    }),
  )
  create(
    @CurrentUser() user: any,
    @Body() dto: CreatePostDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.postsService.createPost(user.id, dto, file);
  }

  @Get('feed')
  getFeed(
    @CurrentUser() user: any,
    @Query('mode') mode?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.postsService.getFeed(user.id, mode ?? 'FOR_YOU', cursor);
  }

  @Get('reels')
  getReels(@CurrentUser() user: any, @Query('cursor') cursor?: string) {
    return this.postsService.getReels(user.id, cursor);
  }

  @Get('user/:username')
  getUserPosts(
    @Param('username') username: string,
    @CurrentUser() user: any,
    @Query('cursor') cursor?: string,
  ) {
    return this.postsService.getUserPosts(username, user.id, cursor);
  }

  @Delete(':id')
  deletePost(@Param('id') id: string, @CurrentUser() user: any) {
    return this.postsService.deletePost(id, user.id);
  }

  @Post(':id/save')
  toggleSave(@Param('id') id: string, @CurrentUser() user: any) {
    return this.postsService.toggleSave(user.id, id);
  }
}
