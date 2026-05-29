import {
  Controller, Get, Put, Patch, Post, Param, Body, Query,
  UseGuards, UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './users.dto';
import { IsOptional, IsString } from 'class-validator';

class AdminActionDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  // ── Admin endpoints ────────────────────────────────────────────────────────

  @Get('admin/list')
  @UseGuards(JwtAuthGuard, AdminGuard)
  adminList(
    @Query('page') page?: string,
    @Query('take') take?: string,
    @Query('search') search?: string,
  ) {
    return this.usersService.adminListUsers(
      page ? parseInt(page) : 1,
      take ? parseInt(take) : 30,
      search,
    );
  }

  @Get('admin/:id/trust-history')
  @UseGuards(JwtAuthGuard, AdminGuard)
  trustHistory(@Param('id') id: string) {
    return this.usersService.getUserTrustHistory(id);
  }

  @Post('admin/:id/suspend')
  @UseGuards(JwtAuthGuard, AdminGuard)
  suspend(
    @Param('id') id: string,
    @CurrentUser() admin: any,
    @Body() dto: AdminActionDto,
  ) {
    return this.usersService.suspendUser(id, admin.id, dto.reason);
  }

  @Post('admin/:id/restore')
  @UseGuards(JwtAuthGuard, AdminGuard)
  restore(@Param('id') id: string, @CurrentUser() admin: any) {
    return this.usersService.restoreUser(id, admin.id);
  }

  @Post('admin/:id/ban')
  @UseGuards(JwtAuthGuard, AdminGuard)
  ban(
    @Param('id') id: string,
    @CurrentUser() admin: any,
    @Body() dto: AdminActionDto,
  ) {
    return this.usersService.banUser(id, admin.id, dto.reason);
  }

  // ── Public / self endpoints ────────────────────────────────────────────────

  @Get('search')
  search(@Query('q') query: string) {
    return this.usersService.searchUsers(query ?? '');
  }

  @Get(':username')
  @UseGuards(JwtAuthGuard)
  getProfile(@Param('username') username: string, @CurrentUser() user: any) {
    return this.usersService.findByUsername(username, user?.id);
  }

  @Put('me/profile')
  @UseGuards(JwtAuthGuard)
  updateProfile(@CurrentUser() user: any, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.id, dto);
  }

  @Patch('me/avatar')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: diskStorage({
        destination: './uploads/avatars',
        filename: (_req, file, cb) => {
          cb(null, `${randomUUID()}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.match(/^image\/(jpeg|png|webp|gif)$/)) {
          return cb(new Error('Only image files allowed'), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadAvatar(@CurrentUser() user: any, @UploadedFile() file: Express.Multer.File) {
    const avatarUrl = `/uploads/avatars/${file.filename}`;
    return this.usersService.updateAvatar(user.id, avatarUrl);
  }
}
