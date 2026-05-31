import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFeedbackDto, FeedbackAdminQueryDto, UpdateFeedbackStatusDto } from './feedback.dto';

const ACTIVE_STATUSES = ['OPEN', 'TRIAGED', 'IN_PROGRESS'] as const;

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateFeedbackDto, userAgent?: string) {
    const browser = (dto.browser?.trim() || userAgent?.trim() || 'unknown').slice(0, 400);

    const created = await this.prisma.betaFeedback.create({
      data: {
        userId,
        type: dto.type,
        severity: dto.severity,
        route: dto.route,
        deviceType: dto.deviceType,
        browser,
        description: dto.description,
        screenshotUrl: dto.screenshotUrl,
      },
      select: { id: true, status: true, createdAt: true },
    });

    await this.prisma.analyticsEvent.create({
      data: {
        name: 'feedback_submitted',
        userId,
        properties: {
          feedbackType: dto.type,
          severity: dto.severity,
          route: dto.route,
          deviceType: dto.deviceType,
        },
      },
      select: { id: true },
    });

    return created;
  }

  async list(query: FeedbackAdminQueryDto) {
    const take = Math.max(1, Math.min(200, Number(query.take) || 100));

    return this.prisma.betaFeedback.findMany({
      where: {
        status: query.status,
        severity: query.severity,
        type: query.type,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            profile: { select: { displayName: true } },
          },
        },
      },
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
      take,
    });
  }

  async stats() {
    const [open, blocking, high, resolved] = await Promise.all([
      this.prisma.betaFeedback.count({ where: { status: 'OPEN' } }),
      this.prisma.betaFeedback.count({
        where: {
          severity: 'BLOCKING',
          status: { in: [...ACTIVE_STATUSES] },
        },
      }),
      this.prisma.betaFeedback.count({
        where: {
          severity: 'HIGH',
          status: { in: [...ACTIVE_STATUSES] },
        },
      }),
      this.prisma.betaFeedback.count({ where: { status: 'RESOLVED' } }),
    ]);

    return { open, blocking, high, resolved };
  }

  async updateStatus(id: string, dto: UpdateFeedbackStatusDto) {
    return this.prisma.betaFeedback.update({
      where: { id },
      data: { status: dto.status },
      select: {
        id: true,
        status: true,
        updatedAt: true,
      },
    });
  }
}
