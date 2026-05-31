import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UpdateProfileDto, UpdateSettingsDto } from './users.dto';

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
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { profile: { update: dto } },
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
