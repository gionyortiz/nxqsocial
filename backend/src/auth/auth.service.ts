import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  RegisterDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
  VerifyEmailDto,
  ResendEmailVerificationDto,
} from './auth.dto';
import { MailService } from './mail.service';
import {
  OtpService,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_MINUTES,
} from '../notifications/otp.service';
import { TurnstileService } from './turnstile.service';
import { signupHardeningEnabled } from './signup-hardening.config';
import type { Prisma } from '@prisma/client';

const SAFE_USER_SELECT = {
  id: true,
  email: true,
  username: true,
  role: true,
  verificationStatus: true,
  trustScore: true,
  emailVerified: true,
  emailVerificationRequired: true,
  phoneVerified: true,
  createdAt: true,
  updatedAt: true,
  profile: {
    select: {
      displayName: true,
      bio: true,
      avatarUrl: true,
      bannerUrl: true,
      location: true,
      website: true,
    },
  },
} as const satisfies Prisma.UserSelect;

type SafeUser = Prisma.UserGetPayload<{ select: typeof SAFE_USER_SELECT }>;

function flattenUser(user: SafeUser) {
  const { profile, ...base } = user;
  return { ...base, ...(profile ?? {}) };
}

// A real bcrypt hash (of a random string) used only for timing-safe dummy
// comparisons when a login email does not exist.
const DUMMY_PASSWORD_HASH =
  '$2a$12$C6UzMDM.H6dfI/f/IKcEeO6e9aQ2gqQ0iY8s9d1bq8eF1bQ7Z3pJK';
const EMAIL_VERIFICATION_TOKEN_TTL = '15m';

interface EmailVerificationTokenPayload {
  sub: string;
  email: string;
  purpose: 'email_verification';
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private mailService: MailService,
    private otpService: OtpService,
    private turnstileService: TurnstileService,
  ) {}

  async register(dto: RegisterDto, remoteIp = 'unknown') {
    const hardeningEnabled = signupHardeningEnabled();
    if (hardeningEnabled) {
      if (dto.agreeToTerms !== true) {
        throw new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          code: 'TERMS_ACCEPTANCE_REQUIRED',
          message:
            'You must agree to the Terms of Service and Community Guidelines.',
        });
      }
      await this.turnstileService.verifySignup(dto.turnstileToken, remoteIp);
    }

    const normalizedUsername = dto.username.trim().toLowerCase();

    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: dto.email },
          { username: { equals: normalizedUsername, mode: 'insensitive' } },
        ],
      },
    });
    if (existing)
      throw new ConflictException('Email or username already taken');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    let user: SafeUser;
    try {
      user = await this.prisma.user.create({
        data: {
          email: dto.email,
          username: normalizedUsername,
          passwordHash,
          verificationStatus: 'BASIC',
          trustScore: 10,
          emailVerificationRequired: hardeningEnabled,
          profile: { create: { displayName: dto.displayName } },
        },
        select: SAFE_USER_SELECT,
      });
    } catch (error: any) {
      // The preflight lookup is intentionally user-friendly, but it cannot
      // prevent two concurrent requests from racing the database constraints.
      if (error?.code === 'P2002') {
        throw new ConflictException('Email or username already taken');
      }
      throw error;
    }

    if (hardeningEnabled) {
      try {
        await this.otpService.sendEmailOtp(user.id);
      } catch {
        await this.prisma.user
          .delete({ where: { id: user.id } })
          .catch(() => undefined);
        throw new ServiceUnavailableException({
          statusCode: 503,
          error: 'Service Unavailable',
          code: 'EMAIL_VERIFICATION_UNAVAILABLE',
          message: 'We could not send a verification code. Please try again.',
        });
      }
    }

    try {
      await this.prisma.analyticsEvent.create({
        data: {
          name: 'signup_completed',
          userId: user.id,
          properties: {
            source: 'open_registration',
            requireInvite: false,
          },
        },
      });
    } catch {
      // Analytics is non-critical. Never report registration as failed after
      // the account (and, when enabled, its verification OTP) already exists.
      this.logger.warn(`Could not record signup analytics for user ${user.id}`);
    }

    if (hardeningEnabled) {
      return this.emailVerificationEnvelope(user, true);
    }

    const token = this.jwtService.sign({ sub: user.id, email: user.email });
    return { access_token: token, user: flattenUser(user) };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { ...SAFE_USER_SELECT, passwordHash: true },
    });

    // Timing-safe: always run a bcrypt comparison even when the user does not
    // exist, so response time does not reveal whether an email is registered.
    if (!user) {
      await bcrypt.compare(dto.password, DUMMY_PASSWORD_HASH);
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const { passwordHash, ...rest } = user;
    void passwordHash;
    if (user.emailVerificationRequired) {
      return this.emailVerificationEnvelope(rest, false);
    }

    const token = this.jwtService.sign({ sub: user.id, email: user.email });
    return { access_token: token, user: flattenUser(rest) };
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const user = await this.resolveEmailVerificationToken(
      dto.verificationToken,
    );
    try {
      await this.otpService.verifyOtp(user.id, 'email', dto.code);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          code: 'EMAIL_VERIFICATION_CODE_INVALID',
          message: 'The verification code is invalid or expired.',
        });
      }
      throw error;
    }

    const verifiedUser = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: SAFE_USER_SELECT,
    });
    const accessToken = this.jwtService.sign({
      sub: verifiedUser.id,
      email: verifiedUser.email,
    });
    return {
      verified: true,
      channel: 'email',
      access_token: accessToken,
      user: flattenUser(verifiedUser),
    };
  }

  async resendEmailVerification(dto: ResendEmailVerificationDto) {
    const user = await this.resolveEmailVerificationToken(
      dto.verificationToken,
    );
    return this.otpService.sendEmailOtp(user.id);
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    // Always respond the same way so we never reveal whether an email exists.
    if (user) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto
        .createHash('sha256')
        .update(rawToken)
        .digest('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Invalidate any previous unused tokens for this user.
      await this.prisma.passwordResetToken.deleteMany({
        where: { userId: user.id, usedAt: null },
      });
      const resetToken = await this.prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expiresAt },
      });

      const appUrl = process.env.APP_BASE_URL ?? 'https://nxqsocial.com';
      const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;
      const accepted = await this.mailService.sendPasswordReset(
        user.email,
        resetUrl,
      );
      if (!accepted) {
        await this.prisma.passwordResetToken.delete({
          where: { id: resetToken.id },
        });
        // Keep the public response generic to prevent account enumeration, but
        // do not retain a token that the user never received. Leave a
        // production-visible signal when the provider rejects delivery.
        this.logger.error(
          `Password reset email delivery was not accepted for user ${user.id}`,
        );
      }
    }
    return {
      message: 'If that email is registered, a reset link has been sent.',
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = crypto
      .createHash('sha256')
      .update(dto.token)
      .digest('hex');
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException(
        'This reset link is invalid or has expired.',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);
    return { message: 'Your password has been reset. You can now log in.' };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });
    if (!user) throw new UnauthorizedException('User not found');

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid)
      throw new UnauthorizedException('Your current password is incorrect.');

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
    return { message: 'Your password has been changed.' };
  }

  private emailVerificationEnvelope(user: SafeUser, sent: boolean) {
    const verificationToken = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        purpose: 'email_verification',
      } satisfies EmailVerificationTokenPayload,
      { expiresIn: EMAIL_VERIFICATION_TOKEN_TTL },
    );
    return {
      status: 'EMAIL_VERIFICATION_REQUIRED',
      requiresEmailVerification: true,
      verification_token: verificationToken,
      // Compatibility alias only. JwtStrategy rejects purpose-scoped tokens.
      access_token: verificationToken,
      user: flattenUser(user),
      verification: {
        required: true,
        channel: 'email',
        sent,
        expiresInMinutes: OTP_TTL_MINUTES,
        resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
      },
    };
  }

  private async resolveEmailVerificationToken(rawToken: string) {
    let payload: EmailVerificationTokenPayload;
    try {
      payload = this.jwtService.verify<EmailVerificationTokenPayload>(rawToken);
    } catch (error) {
      if ((error as { name?: string })?.name === 'TokenExpiredError') {
        throw emailVerificationTokenError(true);
      }
      throw emailVerificationTokenError();
    }
    if (
      payload.purpose !== 'email_verification' ||
      !payload.sub ||
      !payload.email
    ) {
      throw emailVerificationTokenError();
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: SAFE_USER_SELECT,
    });
    if (!user || user.email !== payload.email)
      throw emailVerificationTokenError();
    if (!user.emailVerificationRequired) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'EMAIL_ALREADY_VERIFIED',
        message: 'This email is already verified.',
      });
    }
    return user;
  }
}

function emailVerificationTokenError(expired = false) {
  return new UnauthorizedException({
    statusCode: 401,
    error: 'Unauthorized',
    code: expired
      ? 'EMAIL_VERIFICATION_TOKEN_EXPIRED'
      : 'EMAIL_VERIFICATION_TOKEN_INVALID',
    message: 'The email verification session is invalid or expired.',
  });
}
