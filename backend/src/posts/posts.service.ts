import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SafetyService } from '../safety/safety.service';
import { MediaSafetyService } from '../safety/media-safety.service';
import { StorageService } from '../common/storage/storage.service';
import { CreatePostDto } from './posts.dto';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

const MEDIA_SELECT = {
  id: true, url: true, thumbnailUrl: true,
  mimeType: true, width: true, height: true, durationSec: true, order: true,
};

const AUTHOR_SELECT = {
  id: true, username: true,
  verificationStatus: true, trustScore: true, role: true,
  profile: { select: { displayName: true, avatarUrl: true } },
};

const BASE_POST_SELECT = {
  id: true, caption: true, type: true, visibility: true,
  status: true, aiLabel: true, createdAt: true,
  author: { select: AUTHOR_SELECT },
  media: { select: MEDIA_SELECT, orderBy: { order: 'asc' as const } },
  _count: { select: { likes: true, comments: true } },
};

function postSelect(userId: string) {
  return { ...BASE_POST_SELECT, likes: { where: { userId }, select: { id: true } } };
}

function mapPost(p: any) {
  const { likes, author, ...rest } = p;
  const { profile, ...authorBase } = author;
  return {
    ...rest,
    isLiked: likes?.length > 0,
    author: { ...authorBase, ...(profile ?? {}) },
  };
}

@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name);

  constructor(
    private prisma: PrismaService,
    private safety: SafetyService,
    private mediaSafety: MediaSafetyService,
    private storage: StorageService,
  ) {}

  async createPost(authorId: string, dto: CreatePostDto, file?: Express.Multer.File) {
    if (dto.mediaId && !file) {
      return this.createPostFromAsset(authorId, dto);
    }
    if (!file) {
      throw new BadRequestException('A media file or mediaId is required');
    }
    const isVideo = file.mimetype.startsWith('video/');
    const type = dto.type ?? (isVideo ? 'VIDEO' : 'PHOTO');

    // ── Upload media to R2/S3 (or fall back to local disk) ───────────────────
    let url: string;
    if (this.storage.isEnabled) {
      const folder = isVideo ? 'videos' : 'images';
      url = await this.storage.upload(file.buffer, file.originalname, file.mimetype, folder);
      this.logger.log(`Media uploaded to R2: ${url}`);
    } else {
      // Local disk fallback — write buffer to uploads directory
      const isVid = file.mimetype.startsWith('video/');
      const dir = isVid ? 'videos' : 'images';
      const ext = path.extname(file.originalname) || (isVid ? '.mp4' : '.jpg');
      const filename = `${randomUUID()}${ext}`;
      const dest = path.join(process.cwd(), 'uploads', dir, filename);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, file.buffer);
      url = `/uploads/${dir}/${filename}`;
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ── Content moderation pipeline ──────────────────────────────────────────
    const captionText = dto.caption ?? '';
    const scanResult = this.safety.scan(captionText);
    let postStatus: string = scanResult.riskScore >= 50 ? 'UNDER_REVIEW' : 'PUBLISHED';
    let mediaModerationStatus = postStatus === 'UNDER_REVIEW' ? 'PENDING' : 'APPROVED';

    // ── Media safety scan (image only; video uses async job) ─────────────
    let videoScanJobId: string | null = null;
    if (!isVideo && this.mediaSafety.isEnabled) {
      const mediaScan = await this.mediaSafety.scanImage(file.buffer);
      const mediaStatus = this.mediaSafety.statusFromScan(mediaScan);
      if (mediaStatus === 'REJECTED') {
        postStatus = 'REJECTED';
        mediaModerationStatus = 'REJECTED';
      } else if (mediaStatus === 'UNDER_REVIEW' && postStatus === 'PUBLISHED') {
        postStatus = 'UNDER_REVIEW';
        mediaModerationStatus = 'PENDING';
      }
      if (!mediaScan.safe) {
        this.logger.warn(`Media scan flagged image: ${mediaScan.topCategory} (${mediaScan.maxConfidence.toFixed(1)}%)`);
      }
    } else if (isVideo && this.mediaSafety.isEnabled && this.storage.isEnabled) {
      // Start async video scan job (non-blocking)
      const s3Bucket = process.env.S3_BUCKET ?? '';
      const s3Key = url.replace(`${process.env.S3_PUBLIC_BASE ?? ''}/`, '');
      this.mediaSafety.startVideoScan(s3Bucket, s3Key)
        .then((jobId) => { videoScanJobId = jobId; })
        .catch(() => {});
      // Video stays PUBLISHED until the async job completes
    }
    // ─────────────────────────────────────────────────────────────────────────

    if (postStatus === 'REJECTED') {
      // Hard-blocked by media scanner — don't persist, clean up uploaded file
      if (this.storage.isEnabled) { this.storage.delete(url).catch(() => {}); }
      throw new ForbiddenException('Media contains content that violates community guidelines');
    }

    const post = await this.prisma.post.create({
      data: {
        authorId,
        caption: dto.caption,
        type,
        visibility: dto.visibility ?? 'PUBLIC',
        aiLabel: dto.aiLabel ?? 'NONE',
        status: postStatus as any,
        media: {
          create: {
            userId: authorId,
            s3Key: `legacy/${randomUUID()}`,
            bucket: process.env.S3_BUCKET_NAME ?? process.env.S3_BUCKET ?? 'local',
            size: file.size ?? 0,
            url,
            mimeType: file.mimetype,
            uploadStatus: 'PUBLISHED',
            moderationStatus: mediaModerationStatus as any,
          },
        },
      },
      select: postSelect(authorId),
    });

    // Persist text safety flags asynchronously
    if (!scanResult.safe) {
      this.safety.scanAndPersist('post', post.id, captionText).catch(() => {});
    }

    return {
      ...mapPost(post),
      underReview: postStatus === 'UNDER_REVIEW',
      videoScanJobId,
    };
  }

  async getFeed(userId: string, mode = 'FOR_YOU', cursor?: string, take = 20) {
    let where: any = { status: 'PUBLISHED', visibility: 'PUBLIC' };

    if (mode === 'FOLLOWING') {
      const following = await this.prisma.follow.findMany({
        where: { followerId: userId },
        select: { followingId: true },
      });
      const ids = [userId, ...following.map((f) => f.followingId)];
      where = { ...where, authorId: { in: ids } };
    } else if (mode === 'VERIFIED_HUMANS') {
      where = {
        ...where,
        author: {
          verificationStatus: { in: ['HUMAN_VERIFIED', 'ID_VERIFIED', 'BUSINESS_VERIFIED'] },
        },
      };
    } else if (mode === 'FAMILY_SAFE') {
      where = {
        ...where,
        aiLabel: 'NONE',
        author: { verificationStatus: { not: 'UNVERIFIED' } },
      };
    }

    const posts = await this.prisma.post.findMany({
      where,
      select: postSelect(userId),
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = posts.length > take;
    const data = posts.slice(0, take).map(mapPost);
    return { data, nextCursor: hasMore ? data[data.length - 1].id : null, mode };
  }

  async getReels(userId: string, cursor?: string, take = 10) {
    const posts = await this.prisma.post.findMany({
      where: { status: 'PUBLISHED', visibility: 'PUBLIC', type: { in: ['VIDEO', 'SHORT_VIDEO'] } },
      select: postSelect(userId),
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = posts.length > take;
    const data = posts.slice(0, take).map(mapPost);
    return { data, nextCursor: hasMore ? data[data.length - 1].id : null };
  }

  async getUserPosts(username: string, userId: string, cursor?: string) {
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user) throw new NotFoundException('User not found');

    const posts = await this.prisma.post.findMany({
      where: { authorId: user.id, status: 'PUBLISHED' },
      select: postSelect(userId),
      orderBy: { createdAt: 'desc' },
      take: 21,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = posts.length > 20;
    const data = posts.slice(0, 20).map(mapPost);
    return { data, nextCursor: hasMore ? data[data.length - 1].id : null };
  }

  async deletePost(postId: string, userId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');
    if (post.authorId !== userId) throw new ForbiddenException();
    await this.prisma.post.delete({ where: { id: postId } });
    return { success: true };
  }

  async toggleSave(userId: string, postId: string) {
    const existing = await this.prisma.save.findUnique({
      where: { userId_postId: { userId, postId } },
    });
    if (existing) {
      await this.prisma.save.delete({ where: { id: existing.id } });
      return { saved: false };
    }
    await this.prisma.save.create({ data: { userId, postId } });
    return { saved: true };
  }

  /**
   * Create a post that references a pre-uploaded MediaAsset (Sprint 5 pipeline).
   * The asset must already be in PUBLISHED or SCANNING status.
   */
  private async createPostFromAsset(authorId: string, dto: CreatePostDto) {
    const mediaId = dto.mediaId!;
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id: mediaId } });
    if (!asset) throw new NotFoundException('Media asset not found');
    if (asset.userId !== authorId) throw new ForbiddenException('Not your media asset');
    if (asset.postId) throw new BadRequestException('Media asset is already attached to a post');
    if (asset.uploadStatus === 'PENDING') {
      throw new BadRequestException('Upload not confirmed yet — call complete-upload first');
    }
    if (asset.uploadStatus === 'REJECTED') {
      throw new BadRequestException('Media was rejected by the safety scanner');
    }

    const captionText = dto.caption ?? '';
    const scanResult = this.safety.scan(captionText);
    const postStatus = scanResult.riskScore >= 50 ? 'UNDER_REVIEW' : 'PUBLISHED';
    const type = dto.type ?? (asset.mimeType.startsWith('video/') ? 'VIDEO' : 'PHOTO');

    const post = await this.prisma.post.create({
      data: {
        authorId,
        caption: dto.caption,
        type,
        visibility: dto.visibility ?? 'PUBLIC',
        aiLabel: dto.aiLabel ?? 'NONE',
        status: postStatus as any,
        media: { connect: { id: mediaId } },
      },
      select: postSelect(authorId),
    });

    if (!scanResult.safe) {
      this.safety.scanAndPersist('post', post.id, captionText).catch(() => {});
    }

    return {
      ...mapPost(post),
      underReview: postStatus === 'UNDER_REVIEW' || asset.uploadStatus === 'SCANNING',
      videoScanJobId: null,
    };
  }
}

