import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationType } from '@prisma/client';

const ACTOR_SELECT = {
  id: true,
  username: true,
  verificationStatus: true,
  profile: { select: { displayName: true, avatarUrl: true } },
};

@Injectable()
export class NotificationFeedService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create an in-app notification. Silently no-ops when:
   *  - the actor is the recipient (you never notify yourself),
   *  - either party has blocked the other,
   *  - an identical actor/type/target notification was created very recently
   *    (anti-spam dedupe),
   * and on any write error, so callers can fire-and-forget without affecting
   * the primary action.
   */
  async create(params: {
    recipientId: string;
    actorId?: string;
    type: NotificationType;
    postId?: string;
    commentId?: string;
  }): Promise<void> {
    const { recipientId, actorId, type, postId, commentId } = params;
    if (actorId && actorId === recipientId) return;
    try {
      if (actorId) {
        // Respect blocks in either direction.
        const block = await this.prisma.block.findFirst({
          where: {
            OR: [
              { blockerId: recipientId, blockedId: actorId },
              { blockerId: actorId, blockedId: recipientId },
            ],
          },
          select: { id: true },
        });
        if (block) return;

        // Anti-spam: skip if the same actor produced the same notification
        // for the same target within the last 60 seconds.
        const recent = await this.prisma.notification.findFirst({
          where: {
            recipientId,
            actorId,
            type,
            postId: postId ?? null,
            createdAt: { gte: new Date(Date.now() - 60_000) },
          },
          select: { id: true },
        });
        if (recent) return;
      }

      await this.prisma.notification.create({
        data: { recipientId, actorId, type, postId, commentId },
      });
    } catch {
      // Never let a notification failure break the underlying action.
    }
  }

  async list(userId: string, cursor?: string) {
    const items = await this.prisma.notification.findMany({
      where: { recipientId: userId },
      orderBy: { createdAt: 'desc' },
      take: 31,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        type: true,
        postId: true,
        commentId: true,
        read: true,
        createdAt: true,
        actor: { select: ACTOR_SELECT },
      },
    });

    const hasMore = items.length > 30;
    return { data: items.slice(0, 30), nextCursor: hasMore ? items[29].id : null };
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { recipientId: userId, read: false },
    });
    return { count };
  }

  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({
      where: { id, recipientId: userId },
      data: { read: true },
    });
    return { ok: true };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { recipientId: userId, read: false },
      data: { read: true },
    });
    return { ok: true };
  }
}
