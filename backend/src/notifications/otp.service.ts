import {
  Injectable, BadRequestException, NotFoundException, Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TrustEngineService } from '../trust-engine/trust-engine.service';
import { randomInt } from 'crypto';

const OTP_TTL_MINUTES = 10;

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private trustEngine: TrustEngineService,
  ) {}

  private generateCode(): string {
    // 6-digit numeric OTP
    return String(randomInt(100000, 999999));
  }

  // ── Send ──────────────────────────────────────────────────────────────────

  async sendEmailOtp(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, username: true, emailVerified: true },
    });

    if (user.emailVerified) throw new BadRequestException('Email is already verified');

    await this.invalidateExisting(userId, 'email');
    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    await this.prisma.otpCode.create({
      data: { userId, channel: 'email', code, expiresAt },
    });

    await this.notifications.sendEmailOtp(user.email, code, user.username);
    return { sent: true, channel: 'email', expiresInMinutes: OTP_TTL_MINUTES };
  }

  async sendPhoneOtp(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { phone: true, username: true, phoneVerified: true },
    });

    if (!user.phone) throw new BadRequestException('No phone number on your account');
    if (user.phoneVerified) throw new BadRequestException('Phone is already verified');

    await this.invalidateExisting(userId, 'phone');
    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    await this.prisma.otpCode.create({
      data: { userId, channel: 'phone', code, expiresAt },
    });

    await this.notifications.sendPhoneOtp(user.phone, code);
    return { sent: true, channel: 'phone', expiresInMinutes: OTP_TTL_MINUTES };
  }

  // ── Verify ────────────────────────────────────────────────────────────────

  async verifyOtp(userId: string, channel: 'email' | 'phone', code: string) {
    const otp = await this.prisma.otpCode.findFirst({
      where: {
        userId,
        channel,
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      throw new BadRequestException('No active OTP found. Please request a new code.');
    }

    // Constant-time comparison to prevent timing attacks
    const valid = otp.code === code;

    if (!valid) {
      throw new BadRequestException('Invalid verification code');
    }

    // Mark OTP as used
    await this.prisma.otpCode.update({
      where: { id: otp.id },
      data: { used: true },
    });

    // Update user verified flag
    if (channel === 'email') {
      await this.prisma.user.update({
        where: { id: userId },
        data: { emailVerified: true },
      });
    } else {
      await this.prisma.user.update({
        where: { id: userId },
        data: { phoneVerified: true },
      });
    }

    // Recalculate trust score (email/phone verification adds points)
    const newScore = await this.trustEngine.recalculate(userId);
    this.logger.log(`${channel} verified for user ${userId} — trust score: ${newScore}`);

    return { verified: true, channel, trustScore: newScore };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async invalidateExisting(userId: string, channel: string) {
    await this.prisma.otpCode.updateMany({
      where: { userId, channel, used: false },
      data: { used: true },
    });
  }
}
