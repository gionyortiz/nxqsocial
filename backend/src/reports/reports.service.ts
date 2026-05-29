import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TrustEngineService } from '../trust-engine/trust-engine.service';
import { AuditService } from '../audit/audit.service';
import { IsEnum, IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateReportDto {
  @IsEnum(['SPAM', 'SCAM', 'FAKE_ACCOUNT', 'HARASSMENT', 'HATE_SPEECH', 'VIOLENCE', 'NUDITY', 'MISINFORMATION', 'DEEPFAKE', 'OTHER'])
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  reportedPostId?: string;

  @IsOptional()
  @IsString()
  reportedUserId?: string;
}

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private trustEngine: TrustEngineService,
    private audit: AuditService,
  ) {}

  async createReport(reporterId: string, dto: CreateReportDto) {
    if (!dto.reportedPostId && !dto.reportedUserId) {
      throw new ForbiddenException('Must report a post or a user');
    }

    return this.prisma.report.create({
      data: {
        reporterId,
        reason: dto.reason as any,
        description: dto.description,
        postId: dto.reportedPostId,
        reportedId: dto.reportedUserId,
        status: 'PENDING',
      },
    });
  }

  /** Admin: get pending reports queue with full context */
  async getPendingReports(take = 50) {
    return this.prisma.report.findMany({
      where: { status: 'PENDING' },
      include: {
        reporter: { select: { id: true, username: true } },
        post: { select: { id: true, caption: true } },
        reported: { select: { id: true, username: true, trustScore: true, verificationStatus: true } },
      },
      orderBy: { createdAt: 'asc' },
      take,
    });
  }

  async resolveReport(reportId: string, reviewerId: string, action: 'REVIEWED' | 'ACTION_TAKEN' | 'DISMISSED') {
    const report = await this.prisma.report.update({
      where: { id: reportId },
      data: { status: action as any },
      select: { reportedId: true, postId: true },
    });

    // Recalculate trust for the reported user when a report is actioned/reviewed
    if (report.reportedId && (action === 'ACTION_TAKEN' || action === 'REVIEWED')) {
      await this.trustEngine.recalculate(report.reportedId);
    }

    // Audit log every admin action
    await this.audit.log({
      adminId: reviewerId,
      action: action === 'ACTION_TAKEN' ? 'REPORT_ACTION_TAKEN' : 'REPORT_DISMISSED',
      targetUserId: report.reportedId ?? undefined,
      targetPostId: report.postId ?? undefined,
      meta: { reportId, action },
    });

    return report;
  }
}

