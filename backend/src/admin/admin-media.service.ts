import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../common/storage/storage.service';
import { AdminMediaFilter, AdminMediaQueryDto } from './admin-media.dto';

const USER_SELECT = {
  id: true,
  username: true,
  trustScore: true,
  verificationStatus: true,
};

const POST_SELECT = {
  id: true,
  caption: true,
  status: true,
};

@Injectable()
export class AdminMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async list(query: AdminMediaQueryDto) {
    const take = query.take ?? 20;
    const filter = query.status ?? AdminMediaFilter.FLAGGED;

    let where: Record<string, any> = {};
    switch (filter) {
      case AdminMediaFilter.FLAGGED:
        where = { moderationStatus: 'FLAGGED' };
        break;
      case AdminMediaFilter.REJECTED:
        where = { uploadStatus: 'REJECTED' };
        break;
      case AdminMediaFilter.SCANNING:
        where = { uploadStatus: 'SCANNING' };
        break;
      case AdminMediaFilter.ALL:
        where = { uploadStatus: { not: 'PENDING' } };
        break;
    }

    const items = await this.prisma.mediaAsset.findMany({
      where,
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        url: true,
        mimeType: true,
        size: true,
        uploadStatus: true,
        moderationStatus: true,
        safetyResult: true,
        safetyJobId: true,
        createdAt: true,
        user: { select: USER_SELECT },
        post: { select: POST_SELECT },
      },
    });

    const hasMore = items.length > take;
    const page = hasMore ? items.slice(0, take) : items;
    return {
      items: page,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async approve(mediaId: string) {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: mediaId },
      include: { post: true },
    });
    if (!asset) throw new NotFoundException('MediaAsset not found');

    await this.prisma.mediaAsset.update({
      where: { id: mediaId },
      data: { moderationStatus: 'APPROVED' },
    });

    if (asset.post?.status === 'UNDER_REVIEW') {
      await this.prisma.post.update({
        where: { id: asset.post.id },
        data: { status: 'PUBLISHED' },
      });
    }

    return { success: true, id: mediaId, moderationStatus: 'APPROVED' };
  }

  async reject(mediaId: string, reason?: string) {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: mediaId },
      include: { post: true },
    });
    if (!asset) throw new NotFoundException('MediaAsset not found');

    const safetyResult = asset.safetyResult
      ? { ...(asset.safetyResult as object), adminRejectionReason: reason ?? null }
      : { adminRejectionReason: reason ?? null };

    await this.prisma.mediaAsset.update({
      where: { id: mediaId },
      data: {
        moderationStatus: 'REJECTED',
        uploadStatus: 'REJECTED',
        safetyResult,
      },
    });

    if (asset.post) {
      await this.prisma.post.update({
        where: { id: asset.post.id },
        data: { status: 'REMOVED' },
      });
    }

    return { success: true, id: mediaId, moderationStatus: 'REJECTED' };
  }

  async remove(mediaId: string) {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: mediaId },
      include: { post: true },
    });
    if (!asset) throw new NotFoundException('MediaAsset not found');

    await this.prisma.mediaAsset.update({
      where: { id: mediaId },
      data: {
        moderationStatus: 'REMOVED',
        uploadStatus: 'REJECTED',
        url: null,
      },
    });

    if (asset.post) {
      await this.prisma.post.update({
        where: { id: asset.post.id },
        data: { status: 'REMOVED' },
      });
    }

    // Best-effort S3 deletion — non-fatal
    if (this.storage.isEnabled && asset.s3Key) {
      this.storage.delete(asset.s3Key).catch(() => {});
    }

    return { success: true, id: mediaId, moderationStatus: 'REMOVED' };
  }
}
