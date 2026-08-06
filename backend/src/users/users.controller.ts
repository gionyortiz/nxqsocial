import {
  Controller, Get, Put, Patch, Post, Delete, Param, Body, Query, Req,
  UseGuards, UseInterceptors, UploadedFile, BadRequestException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { promises as fs } from 'fs';
import type { Request } from 'express';
import { randomUUID } from 'crypto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { UsersService } from './users.service';
import { UpdateProfileDto, UpdateSettingsDto } from './users.dto';
import { IsOptional, IsString } from 'class-validator';

class AdminActionDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  private validateImageUpload(file: Express.Multer.File | undefined, kind: 'avatar' | 'banner') {
    if (!file) {
      throw new BadRequestException(`Select a ${kind === 'avatar' ? 'profile photo' : 'banner image'} before saving`);
    }
  }

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

  /** Send a password-reset email on behalf of a user (no admin can see/set passwords). */
  @Post('admin/:id/send-password-reset')
  @UseGuards(JwtAuthGuard, AdminGuard)
  sendPasswordReset(@Param('id') id: string, @CurrentUser() admin: any) {
    return this.usersService.adminSendPasswordReset(id, admin.id);
  }

  /** Resend email-verification link. */
  @Post('admin/:id/resend-email-verification')
  @UseGuards(JwtAuthGuard, AdminGuard)
  resendEmailVerification(@Param('id') id: string, @CurrentUser() admin: any) {
    return this.usersService.adminResendEmailVerification(id, admin.id);
  }

  /** Lock account — prevents login without deleting data. */
  @Post('admin/:id/lock')
  @UseGuards(JwtAuthGuard, AdminGuard)
  lockAccount(@Param('id') id: string, @CurrentUser() admin: any, @Body() dto: AdminActionDto) {
    return this.usersService.adminLockAccount(id, admin.id, dto.reason);
  }

  /** Unlock a previously locked account. */
  @Post('admin/:id/unlock')
  @UseGuards(JwtAuthGuard, AdminGuard)
  unlockAccount(@Param('id') id: string, @CurrentUser() admin: any) {
    return this.usersService.adminUnlockAccount(id, admin.id);
  }

  /** Invalidate all JWT sessions by rotating the user's jwtVersion. */
  @Post('admin/:id/force-logout')
  @UseGuards(JwtAuthGuard, AdminGuard)
  forceLogout(@Param('id') id: string, @CurrentUser() admin: any) {
    return this.usersService.adminForceLogout(id, admin.id);
  }

  /** Full account detail for admin support view. */
  @Get('admin/:id/detail')
  @UseGuards(JwtAuthGuard, AdminGuard)
  accountDetail(@Param('id') id: string) {
    return this.usersService.adminAccountDetail(id);
  }

  // ── Public / self endpoints ────────────────────────────────────────────────

  @Get('search')
  @UseGuards(OptionalJwtAuthGuard)
  search(@Query('q') query: string, @CurrentUser() user: any) {
    return this.usersService.searchUsers(query ?? '', user?.id);
  }

  @Get('me/settings')
  @UseGuards(JwtAuthGuard)
  getSettings(@CurrentUser() user: any) {
    return this.usersService.getSettings(user.id);
  }

  @Get('me/blocked')
  @UseGuards(JwtAuthGuard)
  listBlocked(@CurrentUser() user: any) {
    return this.usersService.listBlocked(user.id);
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
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadAvatar(@CurrentUser() user: any, @UploadedFile() file: Express.Multer.File) {
    this.validateImageUpload(file, 'avatar');
    const avatarUrl = `/api/uploads/avatars/${file.filename}`;
    return this.usersService.updateAvatar(user.id, avatarUrl);
  }

  /** Native mobile upload path that avoids React Native multipart/FormData. */
  @Patch('me/avatar/raw')
  @UseGuards(JwtAuthGuard)
  async uploadAvatarRaw(@CurrentUser() user: any, @Req() req: Request) {
    const mimeType = String(req.headers['content-type'] || '').split(';', 1)[0].toLowerCase();
    const extensions: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'image/heic': '.heic',
      'image/heif': '.heif',
    };
    const extension = extensions[mimeType];
    if (!extension) {
      throw new UnsupportedMediaTypeException('Select a JPEG, PNG, WebP, GIF, or HEIC image');
    }

    const maxBytes = 10 * 1024 * 1024;
    const declaredBytes = Number(req.headers['content-length'] || 0);
    if (declaredBytes > maxBytes) {
      throw new BadRequestException('Profile photo must be smaller than 10 MB');
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.length;
      if (totalBytes > maxBytes) {
        throw new BadRequestException('Profile photo must be smaller than 10 MB');
      }
      chunks.push(buffer);
    }
    if (!totalBytes) {
      throw new BadRequestException('Select a profile photo before saving');
    }

    const filename = `${randomUUID()}${extension}`;
    const uploadDirectory = join(process.cwd(), 'uploads', 'avatars');
    await fs.mkdir(uploadDirectory, { recursive: true });
    await fs.writeFile(join(uploadDirectory, filename), Buffer.concat(chunks));

    return this.usersService.updateAvatar(user.id, `/api/uploads/avatars/${filename}`);
  }

  @Delete('me/avatar')
  @UseGuards(JwtAuthGuard)
  removeAvatar(@CurrentUser() user: any) {
    return this.usersService.removeAvatar(user.id);
  }

  @Patch('me/banner')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('banner', {
      storage: diskStorage({
        destination: './uploads/avatars',
        filename: (_req, file, cb) => {
          cb(null, `banner-${randomUUID()}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.match(/^image\/(jpeg|png|webp|gif)$/)) {
          return cb(new Error('Only image files allowed'), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadBanner(@CurrentUser() user: any, @UploadedFile() file: Express.Multer.File) {
    this.validateImageUpload(file, 'banner');
    const bannerUrl = `/api/uploads/avatars/${file.filename}`;
    return this.usersService.updateBanner(user.id, bannerUrl);
  }

  @Delete('me/banner')
  @UseGuards(JwtAuthGuard)
  removeBanner(@CurrentUser() user: any) {
    return this.usersService.removeBanner(user.id);
  }

  @Patch('me/settings')
  @UseGuards(JwtAuthGuard)
  updateSettings(@CurrentUser() user: any, @Body() dto: UpdateSettingsDto) {
    return this.usersService.updateSettings(user.id, dto);
  }

  @Delete('me')
  @UseGuards(JwtAuthGuard)
  deleteAccount(@CurrentUser() user: any) {
    return this.usersService.deleteAccount(user.id);
  }

  @Post(':username/block')
  @UseGuards(JwtAuthGuard)
  blockUser(@CurrentUser() user: any, @Param('username') username: string) {
    return this.usersService.blockUser(user.id, username);
  }

  @Delete(':username/block')
  @UseGuards(JwtAuthGuard)
  unblockUser(@CurrentUser() user: any, @Param('username') username: string) {
    return this.usersService.unblockUser(user.id, username);
  }
}
