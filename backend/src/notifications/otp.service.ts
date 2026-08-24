import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TrustEngineService } from '../trust-engine/trust-engine.service';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';
import { signupHardeningEnabled } from '../auth/signup-hardening.config';

export const OTP_TTL_MINUTES = 10;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
export const OTP_MAX_VERIFY_ATTEMPTS = 5;

const INCREMENT_ATTEMPTS_SCRIPT = `
local attempts = redis.call('INCR', KEYS[1])
if attempts == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return attempts
`;

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private trustEngine: TrustEngineService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {
    const pepper = this.config.get<string>('OTP_PEPPER', '').trim();
    if (
      process.env.NODE_ENV === 'production' &&
      signupHardeningEnabled() &&
      pepper.length < 32
    ) {
      throw new Error(
        'OTP_PEPPER must contain at least 32 characters when signup hardening is enabled in production.',
      );
    }
  }

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

    if (user.emailVerified)
      throw new BadRequestException('Email is already verified');

    const cooldownKey = await this.acquireSendCooldown(userId, 'email');

    try {
      await this.invalidateExisting(userId, 'email');
      const code = this.generateCode();
      const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

      await this.prisma.otpCode.create({
        data: {
          userId,
          channel: 'email',
          code: this.encodeCode(userId, 'email', code),
          expiresAt,
        },
      });

      await this.notifications.sendEmailOtp(user.email, code, user.username);
      return {
        sent: true,
        channel: 'email',
        expiresInMinutes: OTP_TTL_MINUTES,
        resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
      };
    } catch (error) {
      await this.redis.del(cooldownKey).catch(() => undefined);
      throw error;
    }
  }

  async sendPhoneOtp(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { phone: true, username: true, phoneVerified: true },
    });

    if (!user.phone)
      throw new BadRequestException('No phone number on your account');
    if (user.phoneVerified)
      throw new BadRequestException('Phone is already verified');

    const cooldownKey = await this.acquireSendCooldown(userId, 'phone');

    try {
      await this.invalidateExisting(userId, 'phone');
      const code = this.generateCode();
      const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

      await this.prisma.otpCode.create({
        data: {
          userId,
          channel: 'phone',
          code: this.encodeCode(userId, 'phone', code),
          expiresAt,
        },
      });

      await this.notifications.sendPhoneOtp(user.phone, code);
      return {
        sent: true,
        channel: 'phone',
        expiresInMinutes: OTP_TTL_MINUTES,
        resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
      };
    } catch (error) {
      await this.redis.del(cooldownKey).catch(() => undefined);
      throw error;
    }
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
      throw new BadRequestException(
        'No active OTP found. Please request a new code.',
      );
    }

    const attempt = await this.recordVerifyAttempt(otp.id, otp.expiresAt);
    if (attempt > OTP_MAX_VERIFY_ATTEMPTS) {
      await this.consumeOtp(otp.id);
      throw verificationAttemptsExceeded();
    }

    const valid = this.codeMatches(
      otp.code,
      code,
      userId,
      channel,
      otp.createdAt,
    );

    if (!valid) {
      if (attempt >= OTP_MAX_VERIFY_ATTEMPTS) {
        await this.consumeOtp(otp.id);
        throw verificationAttemptsExceeded();
      }
      throw new BadRequestException('Invalid verification code');
    }

    // Atomically consume the code so concurrent replays cannot both succeed.
    const consumed = await this.prisma.otpCode.updateMany({
      where: { id: otp.id, used: false },
      data: { used: true },
    });
    if (consumed.count !== 1) {
      throw new BadRequestException('Invalid verification code');
    }
    await this.redis.del(this.verifyAttemptsKey(otp.id)).catch(() => undefined);

    // Update user verified flag
    if (channel === 'email') {
      await this.prisma.user.update({
        where: { id: userId },
        data: { emailVerified: true, emailVerificationRequired: false },
      });
    } else {
      await this.prisma.user.update({
        where: { id: userId },
        data: { phoneVerified: true },
      });
    }

    // Recalculate trust score (email/phone verification adds points)
    const newScore = await this.trustEngine.recalculate(userId);
    this.logger.log(
      `${channel} verified for user ${userId} — trust score: ${newScore}`,
    );

    return { verified: true, channel, trustScore: newScore };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async invalidateExisting(userId: string, channel: string) {
    await this.prisma.otpCode.updateMany({
      where: { userId, channel, used: false },
      data: { used: true },
    });
  }

  private async recordVerifyAttempt(
    otpId: string,
    expiresAt: Date,
  ): Promise<number> {
    const remainingSeconds = Math.max(
      1,
      Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000),
    );
    try {
      const result = await this.redis.eval(
        INCREMENT_ATTEMPTS_SCRIPT,
        1,
        this.verifyAttemptsKey(otpId),
        String(remainingSeconds),
      );
      const attempts = Number(result);
      if (!Number.isSafeInteger(attempts) || attempts < 1)
        throw new Error('Invalid Redis attempt counter');
      return attempts;
    } catch {
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: 'Service Unavailable',
        code: 'EMAIL_VERIFICATION_UNAVAILABLE',
        message: 'Verification is temporarily unavailable.',
      });
    }
  }

  private async consumeOtp(otpId: string): Promise<void> {
    await this.prisma.otpCode.updateMany({
      where: { id: otpId, used: false },
      data: { used: true },
    });
  }

  private verifyAttemptsKey(otpId: string): string {
    return `otp:verify-attempts:${otpId}`;
  }

  private async acquireSendCooldown(
    userId: string,
    channel: 'email' | 'phone',
  ): Promise<string> {
    const key = `otp:send-cooldown:${channel}:${userId}`;
    let acquired: string | null;
    try {
      acquired = await this.redis.set(
        key,
        '1',
        'EX',
        OTP_RESEND_COOLDOWN_SECONDS,
        'NX',
      );
    } catch {
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: 'Service Unavailable',
        code: 'EMAIL_VERIFICATION_UNAVAILABLE',
        message: 'Verification delivery is temporarily unavailable.',
      });
    }

    if (acquired === 'OK') return key;

    const ttl = await this.redis
      .ttl(key)
      .catch(() => OTP_RESEND_COOLDOWN_SECONDS);
    const retryAfter = ttl > 0 ? ttl : OTP_RESEND_COOLDOWN_SECONDS;
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Too Many Requests',
        code: 'EMAIL_VERIFICATION_COOLDOWN',
        message: `Wait ${retryAfter} seconds before requesting another code.`,
        retryAfter,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private encodeCode(
    userId: string,
    channel: 'email' | 'phone',
    code: string,
  ): string {
    const pepper = this.config.get<string>('OTP_PEPPER', '').trim();
    if (!pepper) {
      if (process.env.NODE_ENV === 'production' && signupHardeningEnabled()) {
        throw new ServiceUnavailableException({
          statusCode: 503,
          error: 'Service Unavailable',
          code: 'EMAIL_VERIFICATION_UNAVAILABLE',
          message: 'Verification delivery is temporarily unavailable.',
        });
      }
      return code;
    }
    const digest = createHmac('sha256', pepper)
      .update(`${userId}:${channel}:${code}`)
      .digest('hex');
    return `hmac-sha256:${digest}`;
  }

  private codeMatches(
    stored: string,
    submitted: string,
    userId: string,
    channel: 'email' | 'phone',
    createdAt: Date,
  ): boolean {
    if (stored.startsWith('hmac-sha256:')) {
      const expected = this.encodeCode(userId, channel, submitted);
      return safeEqual(stored, expected);
    }

    // Compatibility for codes issued immediately before deployment. This path
    // is bounded by the same ten-minute lifetime as an active OTP row.
    const ageMs = Date.now() - new Date(createdAt).getTime();
    const legacyStillValid =
      Number.isFinite(ageMs) &&
      ageMs >= 0 &&
      ageMs <= OTP_TTL_MINUTES * 60 * 1000;
    return (
      legacyStillValid && /^\d{6}$/.test(stored) && safeEqual(stored, submitted)
    );
  }
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function verificationAttemptsExceeded(): HttpException {
  return new HttpException(
    {
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      error: 'Too Many Requests',
      code: 'EMAIL_VERIFICATION_ATTEMPTS_EXCEEDED',
      message: 'Too many incorrect verification attempts. Request a new code.',
      retryAfter: OTP_RESEND_COOLDOWN_SECONDS,
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}
