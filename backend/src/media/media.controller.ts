import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MediaService } from './media.service';
import { CreateUploadUrlDto, CompleteUploadDto } from './media.dto';

@UseGuards(JwtAuthGuard)
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  /** Step 1: request a presigned S3 PUT URL */
  @Post('create-upload-url')
  createUploadUrl(@Req() req: any, @Body() dto: CreateUploadUrlDto) {
    return this.media.createUploadUrl(req.user.id, dto.mimeType, dto.size);
  }

  /** Step 2: notify backend the upload is done → triggers safety scan */
  @Post('complete-upload')
  completeUpload(@Req() req: any, @Body() dto: CompleteUploadDto) {
    return this.media.completeUpload(req.user.id, dto.mediaId);
  }

  /** Step 3: poll for scan result */
  @Get(':id/status')
  getStatus(@Req() req: any, @Param('id') id: string) {
    return this.media.getStatus(req.user.id, id);
  }
}
