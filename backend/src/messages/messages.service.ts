import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const USER_SELECT = {
  id: true,
  username: true,
  verificationStatus: true,
  profile: { select: { displayName: true, avatarUrl: true } },
};

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService) {}

  private async assertUsersCanMessage(userId: string, targetUserId: string) {
    const blocked = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: targetUserId },
          { blockerId: targetUserId, blockedId: userId },
        ],
      },
      select: { id: true },
    });
    if (blocked) {
      throw new ForbiddenException('Cannot send messages to this user');
    }
  }

  private async ensureParticipant(conversationId: string, userId: string) {
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!participant) throw new ForbiddenException('Conversation not found');
    return participant;
  }

  private formatUser(user: any) {
    return {
      id: user.id,
      username: user.username,
      verificationStatus: user.verificationStatus,
      displayName: user.profile?.displayName ?? user.username,
      avatarUrl: user.profile?.avatarUrl ?? null,
    };
  }

  async listConversations(userId: string) {
    const rows = await this.prisma.conversationParticipant.findMany({
      where: { userId },
      include: {
        conversation: {
          include: {
            participants: { include: { user: { select: USER_SELECT } } },
            messages: {
              take: 1,
              orderBy: { createdAt: 'desc' },
              include: { sender: { select: USER_SELECT } },
            },
          },
        },
      },
      orderBy: { conversation: { lastMessageAt: 'desc' } },
    });

    const conversations = await Promise.all(rows.map(async (row) => {
      const convo = row.conversation;
      const peer = convo.participants.find((p) => p.userId !== userId)?.user;
      const lastMessage = convo.messages[0] || null;
      const unreadCount = await this.prisma.directMessage.count({
        where: {
          conversationId: convo.id,
          senderId: { not: userId },
          ...(row.lastReadAt ? { createdAt: { gt: row.lastReadAt } } : {}),
        },
      });

      return {
        id: convo.id,
        participant: peer ? this.formatUser(peer) : null,
        lastMessage: lastMessage
          ? {
              id: lastMessage.id,
              content: lastMessage.content,
              createdAt: lastMessage.createdAt,
              sender: this.formatUser(lastMessage.sender),
            }
          : null,
        unreadCount,
        lastReadAt: row.lastReadAt,
        updatedAt: convo.updatedAt,
      };
    }));

    return { data: conversations };
  }

  async getMessages(userId: string, conversationId: string, cursor?: string, take = 30) {
    await this.ensureParticipant(conversationId, userId);

    const messages = await this.prisma.directMessage.findMany({
      where: { conversationId },
      include: { sender: { select: USER_SELECT } },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = messages.length > take;
    const page = messages.slice(0, take).reverse();

    return {
      data: page.map((message) => ({
        id: message.id,
        content: message.content,
        createdAt: message.createdAt,
        sender: this.formatUser(message.sender),
      })),
      nextCursor: hasMore ? messages[take - 1].id : null,
    };
  }

  async createConversation(userId: string, participantUsername: string) {
    const username = participantUsername.trim();
    if (!username) throw new BadRequestException('participantUsername is required');

    const target = await this.prisma.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
      select: USER_SELECT,
    });
    if (!target) throw new NotFoundException('User not found');
    if (target.id === userId) throw new BadRequestException('Cannot message yourself');
    await this.assertUsersCanMessage(userId, target.id);

    const candidate = await this.prisma.conversation.findFirst({
      where: {
        AND: [
          { participants: { some: { userId } } },
          { participants: { some: { userId: target.id } } },
        ],
      },
      include: {
        _count: { select: { participants: true } },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    if (candidate && candidate._count.participants === 2) {
      return { id: candidate.id };
    }

    const created = await this.prisma.conversation.create({
      data: {
        participants: {
          create: [
            { userId, lastReadAt: new Date() },
            { userId: target.id },
          ],
        },
      },
      select: { id: true },
    });

    return created;
  }

  async sendMessage(userId: string, conversationId: string, content: string) {
    await this.ensureParticipant(conversationId, userId);

    const participants = await this.prisma.conversationParticipant.findMany({
      where: { conversationId },
      select: { userId: true },
    });
    const peer = participants.find((participant) => participant.userId !== userId);
    if (peer) {
      await this.assertUsersCanMessage(userId, peer.userId);
    }

    const body = content.trim();
    if (!body) throw new BadRequestException('Message cannot be empty');

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.directMessage.create({
        data: {
          conversationId,
          senderId: userId,
          content: body,
        },
        include: { sender: { select: USER_SELECT } },
      });

      await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: created.createdAt },
      });

      await tx.conversationParticipant.update({
        where: { conversationId_userId: { conversationId, userId } },
        data: { lastReadAt: created.createdAt },
      });

      return created;
    });

    return {
      id: message.id,
      content: message.content,
      createdAt: message.createdAt,
      sender: this.formatUser(message.sender),
    };
  }

  async markRead(userId: string, conversationId: string) {
    await this.ensureParticipant(conversationId, userId);
    const now = new Date();

    await this.prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: now },
    });

    return { ok: true, readAt: now };
  }
}
