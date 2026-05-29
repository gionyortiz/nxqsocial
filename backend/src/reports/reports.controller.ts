import { Controller, Post, Get, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { ReportsService, CreateReportDto } from './reports.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { IsString, IsIn } from 'class-validator';

class ResolveReportDto {
  @IsString()
  @IsIn(['REVIEWED', 'ACTION_TAKEN', 'DISMISSED'])
  action!: 'REVIEWED' | 'ACTION_TAKEN' | 'DISMISSED';
}

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Post()
  createReport(@CurrentUser() user: any, @Body() dto: CreateReportDto) {
    return this.reportsService.createReport(user.id, dto);
  }

  @Get('admin/pending')
  @UseGuards(AdminGuard)
  getPending() {
    return this.reportsService.getPendingReports();
  }

  @Patch('admin/:id/resolve')
  @UseGuards(AdminGuard)
  resolve(@Param('id') id: string, @CurrentUser() user: any, @Body() dto: ResolveReportDto) {
    return this.reportsService.resolveReport(id, user.id, dto.action);
  }
}
