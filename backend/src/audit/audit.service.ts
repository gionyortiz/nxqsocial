import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type AuditAction =
  | 'REPORT_ACTION_TAKEN'
  | 'REPORT_DISMISSED'
  | 'VERIFICATION_APPROVED'
  | 'VERIFICATION_REJECTED'
  | 'USER_BANNED'
  | 'USER_SUSPENDED'
  | 'POST_REMOVED'
  | 'SAFETY_FLAG_CREATED'
  | 'TRUST_SCORE_OVERRIDE';

export interface AuditMeta {
  adminId: string;
  action: AuditAction;
  targetUserId?: string;
  targetPostId?: string;
  reason?: string;
  meta?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(entry: AuditMeta) {
    return this.prisma.auditLog.create({
      data: {
        adminId: entry.adminId,
        actionType: entry.action,
        targetUserId: entry.targetUserId,
        targetPostId: entry.targetPostId,
        reason: entry.reason,
        meta: entry.meta as any,
      },
    });
  }

  /** Get recent audit logs for the admin dashboard */
  async getRecentLogs(take = 100) {
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        admin: { select: { id: true, username: true } },
      },
    });
  }

  /** Get audit logs for a specific user (target) */
  async getLogsForUser(targetUserId: string) {
    return this.prisma.auditLog.findMany({
      where: { targetUserId },
      orderBy: { createdAt: 'desc' },
      include: { admin: { select: { id: true, username: true } } },
    });
  }
}
