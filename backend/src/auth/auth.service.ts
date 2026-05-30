import { Injectable, ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto, LoginDto, ForgotPasswordDto, ResetPasswordDto, ChangePasswordDto } from './auth.dto';
import { MailService } from './mail.service';

const SAFE_USER_SELECT = {
  id: true, email: true, username: true,
  role: true, verificationStatus: true, trustScore: true,
  createdAt: true, updatedAt: true,
  profile: { select: { displayName: true, bio: true, avatarUrl: true, bannerUrl: true, location: true, website: true } },
};

function flattenUser(user: any) {
  const { profile, ...base } = user;
  return { ...base, ...(profile ?? {}) };
}

// A real bcrypt hash (of a random string) used only for timing-safe dummy
// comparisons when a login email does not exist.
const DUMMY_PASSWORD_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEeO6e9aQ2gqQ0iY8s9d1bq8eF1bQ7Z3pJK';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private mailService: MailService,
  ) {}

  async register(dto: RegisterDto) {
    const requiredCode = process.env.BETA_INVITE_CODE;
    if (requiredCode && dto.inviteCode !== requiredCode) {
      throw new ForbiddenException('Invalid invite code — this is a closed beta');
    }

    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { username: dto.username }] },
    });
    if (existing) throw new ConflictException('Email or username already taken');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        username: dto.username,
        passwordHash,
        verificationStatus: 'BASIC',
        trustScore: 10,
        profile: { create: { displayName: dto.displayName } },
      },
      select: SAFE_USER_SELECT,
    });

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

    const token = this.jwtService.sign({ sub: user.id, email: user.email });
    const { passwordHash: _, ...rest } = user;
    return { access_token: token, user: flattenUser(rest) };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    // Always respond the same way so we never reveal whether an email exists.
    if (user) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Invalidate any previous unused tokens for this user.
      await this.prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
      await this.prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expiresAt },
      });

      const appUrl = process.env.APP_URL ?? 'https://nxqsocial.com';
      const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;
      await this.mailService.sendPasswordReset(user.email, resetUrl);
    }
    return { message: 'If that email is registered, a reset link has been sent.' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = crypto.createHash('sha256').update(dto.token).digest('hex');
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException('This reset link is invalid or has expired.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
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
    if (!valid) throw new UnauthorizedException('Your current password is incorrect.');

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    return { message: 'Your password has been changed.' };
  }
}

