import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Trust Score Rules
 *
 * Base from verification tier:
 *   UNVERIFIED       =  0
 *   BASIC            = 10
 *   HUMAN_VERIFIED   = 40   (+30 for selfie/phone verification)
 *   ID_VERIFIED      = 70   (+50 for government ID)
 *   BUSINESS_VERIFIED= 85
 *
 * Bonuses:
 *   +10  Email address verified via OTP
 *   +5   Phone number verified via OTP
 *   +20  Account older than 30 days
 *
 * Penalties:
 *   -20  per report received (ACTION_TAKEN status)
 *   -10  per report received (REVIEWED status)
 *   Minimum score: 0
 *   Maximum score: 100
 */

const TIER_BASE: Record<string, number> = {
  UNVERIFIED: 0,
  BASIC: 10,
  HUMAN_VERIFIED: 40,
  ID_VERIFIED: 70,
  BUSINESS_VERIFIED: 85,
};

@Injectable()
export class TrustEngineService {
  constructor(private prisma: PrismaService) {}

  async recalculate(userId: string): Promise<number> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        verificationStatus: true,
        email: true,
        emailVerified: true,
        phone: true,
        phoneVerified: true,
        createdAt: true,
        reportsReceived: { select: { status: true } },
      },
    });

    let score = TIER_BASE[user.verificationStatus] ?? 10;

    // +10 for confirmed email
    if (user.emailVerified) score += 10;

    // +5 for confirmed phone
    if (user.phoneVerified) score += 5;

    // +20 if account is older than 30 days
    const ageDays = (Date.now() - user.createdAt.getTime()) / 86_400_000;
    if (ageDays >= 30) score += 20;

    // Penalties from substantiated reports
    for (const r of user.reportsReceived) {
      if (r.status === 'ACTION_TAKEN') score -= 20;
      else if (r.status === 'REVIEWED') score -= 10;
    }

    score = Math.max(0, Math.min(100, score));

    await this.prisma.user.update({ where: { id: userId }, data: { trustScore: score } });
    return score;
  }

  /** Bulk-recalculate for a set of users (e.g. after a report is resolved) */
  async recalculateMany(userIds: string[]) {
    return Promise.all(userIds.map((id) => this.recalculate(id)));
  }

  async getLeaderboard(take = 50) {
    return this.prisma.user.findMany({
      orderBy: { trustScore: 'desc' },
      take,
      select: {
        id: true,
        username: true,
        verificationStatus: true,
        trustScore: true,
        profile: { select: { displayName: true, avatarUrl: true } },
      },
    });
  }

  /** Score band label for UI */
  static band(score: number): string {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    if (score >= 20) return 'Low';
    return 'Very Low';
  }
}

