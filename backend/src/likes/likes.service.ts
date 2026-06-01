import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const PERSON_SELECT = {
  id: true,
  username: true,
  verificationStatus: true,
  profile: { select: { displayName: true, avatarUrl: true } },
};

@Injectable()
export class LikesService {
  constructor(private prisma: PrismaService) {}

  async findByPost(postId: string) {
    return this.prisma.like.findMany({
      where: { postId },
      select: {
        id: true,
        createdAt: true,
        user: { select: PERSON_SELECT },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async toggle(userId: string, postId: string) {
    const existing = await this.prisma.like.findUnique({
      where: { userId_postId: { userId, postId } },
    });

    if (existing) {
      await this.prisma.like.delete({ where: { id: existing.id } });
      const count = await this.prisma.like.count({ where: { postId } });
      return { liked: false, count };
    }

    await this.prisma.like.create({ data: { userId, postId } });
    const count = await this.prisma.like.count({ where: { postId } });
    return { liked: true, count };
  }
}
