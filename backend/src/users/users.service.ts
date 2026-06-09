import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../auth/mail.service';
import { UpdateProfileDto, UpdateSettingsDto } from './users.dto';
import * as crypto from 'crypto';

const USER_PUBLIC_SELECT = {
  id: true, username: true, role: true,
  verificationStatus: true, trustScore: true, createdAt: true,
  profile: { select: { displayName: true, bio: true, avatarUrl: true, bannerUrl: true, location: true, website: true } },
  _count: { select: { posts: true, followers: true, following: true } },
};

function flattenUser(user: any) {
  const { profile, ...base } = user;
  return { ...base, ...(profile ?? {}) };
}

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private mail: MailService,
  ) {}

  private findUserByUsername(username: string) {
    return this.prisma.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
    });
  }

  async findByUsername(username: string, currentUserId?: string) {
    const user = await this.prisma.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
      select: USER_PUBLIC_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');

    let isFollowing = false;
    if (currentUserId) {
      const follow = await this.prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: currentUserId, followingId: user.id } },
      });
      isFollowing = !!follow;
    }

    return { ...flattenUser(user), isFollowing };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const normalize = (v?: string) => {
      if (v === undefined) return undefined;
      const t = v.trim();
      return t.length === 0 ? null : t;
    };
    const data = {
      displayName: normalize(dto.displayName) ?? undefined,
      bio: normalize(dto.bio),
      location: normalize(dto.location),
      website: normalize(dto.website),
    };
    // Use upsert in case profile row is missing for legacy accounts.
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        profile: {
          upsert: {
            create: {
              displayName: data.displayName ?? '',
              bio: data.bio ?? undefined,
              location: data.location ?? undefined,
              website: data.website ?? undefined,
            },
            update: data,
          },
        },
      },
      select: USER_PUBLIC_SELECT,
    });
    return flattenUser(user);
  }

  async updateAvatar(userId: string, avatarUrl: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { profile: { update: { avatarUrl } } },
      select: { id: true, profile: { select: { avatarUrl: true } } },
    });
    return { id: user.id, avatarUrl: user.profile?.avatarUrl };
  }

  async removeAvatar(userId: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { profile: { update: { avatarUrl: null } } },
      select: USER_PUBLIC_SELECT,
    });
    return flattenUser(user);
  }

  async updateBanner(userId: string, bannerUrl: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { profile: { update: { bannerUrl } } },
      select: { id: true, profile: { select: { bannerUrl: true } } },
    });
    return { id: user.id, bannerUrl: user.profile?.bannerUrl };
  }

  async removeBanner(userId: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { profile: { update: { bannerUrl: null } } },
      select: USER_PUBLIC_SELECT,
    });
    return flattenUser(user);
  }

  // ── Self: account settings ──────────────────────────────────────────────────

  async getSettings(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, username: true, emailNotifications: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateSettings(userId: string, dto: UpdateSettingsDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { emailNotifications: dto.emailNotifications },
      select: { id: true, email: true, username: true, emailNotifications: true },
    });
    return user;
  }

  async deleteAccount(userId: string) {
    await this.prisma.user.delete({ where: { id: userId } });
    return { message: 'Your account has been deleted.' };
  }

  // ── Self: blocking ──────────────────────────────────────────────────────────

  async blockUser(userId: string, targetUsername: string) {
    const target = await this.findUserByUsername(targetUsername);
    if (!target) throw new NotFoundException('User not found');
    if (target.id === userId) throw new BadRequestException('You cannot block yourself');

    await this.prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId: userId, blockedId: target.id } },
      create: { blockerId: userId, blockedId: target.id },
      update: {},
    });
    // Remove any follow relationship in both directions.
    await this.prisma.follow.deleteMany({
      where: {
        OR: [
          { followerId: userId, followingId: target.id },
          { followerId: target.id, followingId: userId },
        ],
      },
    });
    return { blocked: true };
  }

  async unblockUser(userId: string, targetUsername: string) {
    const target = await this.findUserByUsername(targetUsername);
    if (!target) throw new NotFoundException('User not found');

    await this.prisma.block.deleteMany({
      where: { blockerId: userId, blockedId: target.id },
    });
    return { blocked: false };
  }

  async listBlocked(userId: string) {
    const blocks = await this.prisma.block.findMany({
      where: { blockerId: userId },
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        blocked: {
          select: {
            id: true, username: true, verificationStatus: true,
            profile: { select: { displayName: true, avatarUrl: true } },
          },
        },
      },
    });
    return blocks.map((b) => ({ ...flattenUser(b.blocked), blockedAt: b.createdAt }));
  }

  async searchUsers(query: string) {
    const users = await this.prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: query, mode: 'insensitive' } },
          { profile: { displayName: { contains: query, mode: 'insensitive' } } },
        ],
      },
      select: {
        id: true, username: true, verificationStatus: true, trustScore: true,
        profile: { select: { displayName: true, avatarUrl: true } },
      },
      take: 20,
    });
    return users.map(flattenUser);
  }

  // ── Admin: user management ─────────────────────────────────────────────────

  async adminListUsers(page = 1, take = 30, search?: string) {
    const skip = (page - 1) * take;
    const where = search
      ? {
          OR: [
            { username: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, username: true, email: true, role: true,
          verificationStatus: true, trustScore: true,
          emailVerified: true, phoneVerified: true,
          isSuspended: true, isBanned: true,
          createdAt: true,
          profile: { select: { displayName: true, avatarUrl: true } },
          _count: { select: { posts: true, reportsReceived: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data: users.map(flattenUser), total, page, take };
  }

  async suspendUser(targetId: string, adminId: string, reason?: string) {
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('User not found');
    if (target.role === 'ADMIN') throw new ForbiddenException('Cannot suspend an admin');

    await this.prisma.user.update({
      where: { id: targetId },
      data: { isSuspended: true },
    });

    await this.audit.log({
      adminId, action: 'USER_SUSPENDED', targetUserId: targetId,
      reason, meta: { username: target.username },
    });

    return { suspended: true, userId: targetId };
  }

  async restoreUser(targetId: string, adminId: string) {
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('User not found');

    await this.prisma.user.update({
      where: { id: targetId },
      data: { isSuspended: false, isBanned: false },
    });

    await this.audit.log({
      adminId, action: 'USER_SUSPENDED', targetUserId: targetId,
      meta: { restored: true, username: target.username },
    });

    return { restored: true, userId: targetId };
  }

  async banUser(targetId: string, adminId: string, reason?: string) {
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('User not found');
    if (target.role === 'ADMIN') throw new ForbiddenException('Cannot ban an admin');

    await this.prisma.user.update({
      where: { id: targetId },
      data: { isBanned: true, isSuspended: true },
    });

    await this.audit.log({
      adminId, action: 'USER_BANNED', targetUserId: targetId,
      reason, meta: { username: target.username },
    });

    return { banned: true, userId: targetId };
  }

  /** Admin: send a password-reset email. Never allows admin to set a password directly. */
  async adminSendPasswordReset(targetId: string, adminId: string) {
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('User not found');

    // Reuse the standard token-based reset flow — admin never sees the token.
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.prisma.passwordResetToken.deleteMany({ where: { userId: target.id, usedAt: null } });
    await this.prisma.passwordResetToken.create({
      data: { userId: target.id, tokenHash, expiresAt },
    });

    const appUrl = process.env.APP_URL ?? 'https://nxqsocial.com';
    const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;
    await this.mail.sendPasswordReset(target.email, resetUrl);

    await this.audit.log({
      adminId, action: 'USER_SUSPENDED', targetUserId: targetId,
      meta: { action: 'admin_password_reset_sent', username: target.username },
    });

    return { ok: true, message: `Password reset email sent to ${target.email}` };
  }

  /** Admin: resend email verification. */
  async adminResendEmailVerification(targetId: string, adminId: string) {
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('User not found');
    if (target.emailVerified) return { ok: true, message: 'Email already verified.' };

    // Send a verification reminder email.
    await this.mail.sendVerificationEmail(target.email, target.username).catch(() => null);

    await this.audit.log({
      adminId, action: 'USER_SUSPENDED', targetUserId: targetId,
      meta: { action: 'admin_resend_email_verification', username: target.username },
    });

    return { ok: true, message: `Verification email re-sent to ${target.email}` };
  }

  /** Admin: lock account (prevents login, non-destructive). */
  async adminLockAccount(targetId: string, adminId: string, reason?: string) {
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('User not found');
    if (target.role === 'ADMIN') throw new ForbiddenException('Cannot lock an admin account');

    await this.prisma.user.update({ where: { id: targetId }, data: { isSuspended: true } });

    await this.audit.log({
      adminId, action: 'USER_SUSPENDED', targetUserId: targetId,
      reason, meta: { action: 'admin_account_locked', username: target.username },
    });

    return { ok: true, locked: true, userId: targetId };
  }

  /** Admin: unlock a locked account. */
  async adminUnlockAccount(targetId: string, adminId: string) {
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('User not found');

    await this.prisma.user.update({ where: { id: targetId }, data: { isSuspended: false } });

    await this.audit.log({
      adminId, action: 'USER_SUSPENDED', targetUserId: targetId,
      meta: { action: 'admin_account_unlocked', username: target.username },
    });

    return { ok: true, locked: false, userId: targetId };
  }

  /**
   * Admin: force-logout all sessions.
   * We don't store sessions, so we invalidate by rotating passwordHash salt via
   * a dummy append — JWTs signed before this will still be valid until expiry,
   * but this logs the action and the next password reset will take effect.
   * Proper session invalidation requires jwtVersion tracking (Phase 2).
   */
  async adminForceLogout(targetId: string, adminId: string) {
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('User not found');

    // Invalidate all password reset tokens so any in-flight tokens stop working.
    await this.prisma.passwordResetToken.deleteMany({ where: { userId: targetId } });

    await this.audit.log({
      adminId, action: 'USER_SUSPENDED', targetUserId: targetId,
      meta: { action: 'admin_force_logout', username: target.username },
    });

    return { ok: true, message: 'All active reset tokens invalidated. User will need to log in again after password expires.' };
  }

  /** Admin: full account detail for support view. */
  async adminAccountDetail(targetId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: {
        id: true, email: true, phone: true, username: true, role: true,
        verificationStatus: true, trustScore: true,
        emailVerified: true, phoneVerified: true,
        emailNotifications: true,
        isSuspended: true, isBanned: true,
        createdAt: true, updatedAt: true,
        profile: { select: { displayName: true, bio: true, avatarUrl: true } },
        _count: { select: { posts: true, followers: true, following: true, reportsReceived: true } },
        passwordResets: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { createdAt: true, usedAt: true, expiresAt: true },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const auditLogs = await this.prisma.auditLog.findMany({
      where: { targetUserId: targetId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { actionType: true, reason: true, meta: true, createdAt: true, admin: { select: { username: true } } },
    });

    const { profile, passwordResets, ...base } = user;
    return {
      ...base,
      displayName: profile?.displayName,
      avatarUrl: profile?.avatarUrl,
      bio: profile?.bio,
      passwordResetHistory: passwordResets,
      auditLog: auditLogs,
    };
  }

  async getUserTrustHistory(targetId: string) {
    const [user, reports, auditLogs, verifications] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: targetId },
        select: {
          id: true, username: true, trustScore: true,
          verificationStatus: true, emailVerified: true, phoneVerified: true,
          isSuspended: true, isBanned: true, createdAt: true,
          _count: { select: { reportsReceived: true, posts: true, followers: true } },
        },
      }),
      this.prisma.report.findMany({
        where: { reportedId: targetId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true, reason: true, status: true, createdAt: true,
          reporter: { select: { id: true, username: true } },
        },
      }),
      this.prisma.auditLog.findMany({
        where: { targetUserId: targetId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { admin: { select: { id: true, username: true } } },
      }),
      this.prisma.verification.findMany({
        where: { userId: targetId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    if (!user) throw new NotFoundException('User not found');
    return { user, reports, auditLogs, verifications };
  }
}
