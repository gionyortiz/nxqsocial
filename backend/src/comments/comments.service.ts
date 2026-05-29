import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SafetyService } from '../safety/safety.service';
import { CreateCommentDto } from './comments.dto';

@Injectable()
export class CommentsService {
  constructor(
    private prisma: PrismaService,
    private safety: SafetyService,
  ) {}

  async create(userId: string, postId: string, dto: CreateCommentDto) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');

    // Block high-risk comments immediately
    const scan = this.safety.scan(dto.content);
    if (scan.riskScore >= 75) {
      throw new BadRequestException('Your comment was flagged as potentially harmful and could not be posted.');
    }

    const comment = await this.prisma.comment.create({
      data: { userId, postId, content: dto.content },
      select: {
        id: true,
        content: true,
        createdAt: true,
        user: { select: { id: true, username: true, verificationStatus: true, profile: { select: { displayName: true, avatarUrl: true } } } },
      },
    });

    // Persist lower-risk flags asynchronously
    if (!scan.safe) {
      this.safety.scanAndPersist('comment', comment.id, dto.content).catch(() => {});
    }

    return comment;
  }

  async findByPost(postId: string, cursor?: string) {
    const comments = await this.prisma.comment.findMany({
      where: { postId },
      select: {
        id: true,
        content: true,
        createdAt: true,
        user: { select: { id: true, username: true, verificationStatus: true, profile: { select: { displayName: true, avatarUrl: true } } } },
      },
      orderBy: { createdAt: 'asc' },
      take: 31,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = comments.length > 30;
    return { data: comments.slice(0, 30), nextCursor: hasMore ? comments[29].id : null };
  }

  async delete(commentId: string, userId: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.userId !== userId) throw new ForbiddenException();
    await this.prisma.comment.delete({ where: { id: commentId } });
    return { success: true };
  }
}
