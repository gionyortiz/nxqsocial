import {
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { AdminMediaService } from './admin-media.service';
import { AdminMediaQueryDto, AdminMediaRejectDto } from './admin-media.dto';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/media')
export class AdminMediaController {
  constructor(private readonly service: AdminMediaService) {}

  @Get()
  list(@Query() query: AdminMediaQueryDto) {
    return this.service.list(query);
  }

  @Patch(':id/approve')
  approve(@Param('id') id: string) {
    return this.service.approve(id);
  }

  @Patch(':id/reject')
  reject(@Param('id') id: string, @Body() dto: AdminMediaRejectDto) {
    return this.service.reject(id, dto.reason);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
