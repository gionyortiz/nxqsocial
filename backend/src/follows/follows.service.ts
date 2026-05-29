import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FollowsService {
  constructor(private prisma: PrismaService) {}

  async toggle(followerId: string, targetUsername: string) {
    const target = await this.prisma.user.findUnique({ where: { username: targetUsername } });
    if (!target) throw new NotFoundException('User not found');
    if (target.id === followerId) return { following: false };

    const existing = await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId: target.id } },
    });

    if (existing) {
      await this.prisma.follow.delete({ where: { id: existing.id } });
      return { following: false };
    }

    await this.prisma.follow.create({ data: { followerId, followingId: target.id } });
    return { following: true };
  }

  async getFollowers(username: string) {
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.follow.findMany({
      where: { followingId: user.id },
      select: {
        follower: { select: { id: true, username: true, verificationStatus: true, profile: { select: { displayName: true, avatarUrl: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getFollowing(username: string) {
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.follow.findMany({
      where: { followerId: user.id },
      select: {
        following: { select: { id: true, username: true, verificationStatus: true, profile: { select: { displayName: true, avatarUrl: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
