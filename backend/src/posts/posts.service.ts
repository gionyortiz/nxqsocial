import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SafetyService } from '../safety/safety.service';
import { MediaSafetyService } from '../safety/media-safety.service';
import {
  ManagedStoragePrefix,
  StorageService,
} from '../common/storage/storage.service';
import { VideoTranscodeService } from '../media/video-transcode.service';
import { CreatePostDto } from './posts.dto';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import {
  OwnedMediaReference,
  queueOwnedMediaCleanup,
} from '../common/storage/owned-media-cleanup';

const MEDIA_SELECT = {
  id: true,
  url: true,
  thumbnailUrl: true,
  mimeType: true,
  width: true,
  height: true,
  durationSec: true,
  order: true,
};

const AUTHOR_SELECT = {
  id: true,
  username: true,
  verificationStatus: true,
  trustScore: true,
  role: true,
  profile: { select: { displayName: true, avatarUrl: true } },
};

const BASE_POST_SELECT = {
  id: true,
  caption: true,
  type: true,
  visibility: true,
  status: true,
  aiLabel: true,
  createdAt: true,
  author: { select: AUTHOR_SELECT },
  media: { select: MEDIA_SELECT, orderBy: { order: 'asc' as const } },
  _count: { select: { likes: true, comments: true } },
};

function postSelect(userId: string) {
  return {
    ...BASE_POST_SELECT,
    likes: { where: { userId }, select: { id: true } },
  };
}

function resolveMediaUrl(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  // Convert relative URL to absolute HTTPS URL
  const apiBase = process.env.API_BASE_URL || 'https://api.nxqsocial.com/api';
  return `${apiBase}${url}`;
}

function localUploadFilePath(url: string | null): string | null {
  if (!url) return null;

  let pathname = url;
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const parsed = new URL(url);
      const configuredOrigins = [
        process.env.API_BASE_URL ?? 'https://api.nxqsocial.com/api',
        ...(process.env.LEGACY_LOCAL_MEDIA_ORIGINS ?? '').split(','),
      ]
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => {
          try {
            return new URL(value).origin;
          } catch {
            return null;
          }
        })
        .filter((origin): origin is string => Boolean(origin));
      if (!configuredOrigins.includes(parsed.origin)) return null;
      pathname = parsed.pathname;
    } catch {
      return null;
    }
  }

  if (pathname.startsWith('/api/uploads/')) {
    pathname = pathname.slice('/api'.length);
  }
  if (!pathname.startsWith('/uploads/')) return null;

  const uploadRoot = path.resolve(process.cwd(), 'uploads');
  const relativePath = pathname.slice('/uploads/'.length);
  const filePath = path.resolve(uploadRoot, relativePath);
  const relativeToRoot = path.relative(uploadRoot, filePath);
  return relativeToRoot &&
    !relativeToRoot.startsWith('..') &&
    !path.isAbsolute(relativeToRoot)
    ? filePath
    : null;
}

function mediaIsAvailable(media: any): boolean {
  const filePath = localUploadFilePath(media?.url);
  return filePath ? fs.existsSync(filePath) : true;
}

function postHasAvailableMedia(post: any): boolean {
  if (!post.media?.length) return false;
  return post.media.some(mediaIsAvailable);
}

function mapPost(p: any) {
  const { likes, author, media, ...rest } = p;
  const { profile, ...authorBase } = author;
  return {
    ...rest,
    isLiked: likes?.length > 0,
    author: { ...authorBase, ...(profile ?? {}) },
    media:
      media?.filter(mediaIsAvailable).map((m: any) => ({
        ...m,
        url: resolveMediaUrl(m.url),
        thumbnailUrl: resolveMediaUrl(m.thumbnailUrl),
      })) ?? [],
  };
}

interface StoryCandidate {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isLive: boolean;
  hasRecentPost: boolean;
  liveRoom?: string | null;
}

@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name);

  constructor(
    private prisma: PrismaService,
    private safety: SafetyService,
    private mediaSafety: MediaSafetyService,
    private storage: StorageService,
    private videoTranscode: VideoTranscodeService,
  ) {}

  private async deleteMediaReference(
    reference: string | null | undefined,
    allowedPrefixes: readonly ManagedStoragePrefix[],
  ): Promise<void> {
    if (!reference) return;

    const localPath = localUploadFilePath(reference);
    if (localPath) {
      await fs.promises
        .unlink(localPath)
        .catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') throw error;
        });
      return;
    }

    await this.storage.deleteManagedObject(reference, allowedPrefixes);
  }

  private async cleanupMediaReferences(
    references: Array<{
      value: string | null | undefined;
      prefixes: readonly ManagedStoragePrefix[];
    }>,
  ): Promise<void> {
    await queueOwnedMediaCleanup(
      this.prisma,
      this.storage,
      references,
      'post-media-lifecycle',
    ).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Could not persist media cleanup retry: ${message}`);
    });
    const results = await Promise.allSettled(
      references.map(({ value, prefixes }) =>
        this.deleteMediaReference(value, prefixes),
      ),
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        const message =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
        this.logger.warn(`Media lifecycle cleanup failed: ${message}`);
      }
    }
  }

  async createPost(
    authorId: string,
    dto: CreatePostDto,
    file?: Express.Multer.File,
  ) {
    if (dto.mediaId && !file) {
      return this.createPostFromAsset(authorId, dto);
    }
    if (!file) {
      throw new BadRequestException('A media file or mediaId is required');
    }
    const isVideo = file.mimetype.startsWith('video/');
    const type = dto.type ?? (isVideo ? 'VIDEO' : 'PHOTO');

    if (!isVideo && file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('Images must be 5 MiB or smaller');
    }

    if (!this.storage.localDiskFallbackAllowed) {
      throw new BadRequestException(
        'Production media uploads must use the direct upload flow before creating a post',
      );
    }

    // ── Normalize video to H.264/AAC faststart MP4 before storing ────────────
    // Devices frequently produce containers/codecs some players can't decode
    // (HEVC-in-QuickTime, non-faststart MP4). This path is synchronous since
    // it's the dev/local-only upload flow; the production flow (media.service.ts
    // completeUpload) does this asynchronously instead.
    let thumbnailBuffer: Buffer | null = null;
    let durationSec: number | null = null;
    let width: number | null = null;
    let height: number | null = null;
    if (isVideo) {
      const transcoded = await this.videoTranscode.transcodeBuffer(
        file.buffer,
        file.mimetype,
      );
      file.buffer = transcoded.buffer;
      file.mimetype = transcoded.mimeType;
      thumbnailBuffer = transcoded.thumbnailBuffer;
      durationSec = transcoded.durationSec;
      width = transcoded.width;
      height = transcoded.height;
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ── Upload media to R2/S3 (local disk is development-only) ───────────────
    const writeLocalMedia = (): {
      url: string;
      thumbnailUrl: string | null;
    } => {
      const isVid = file.mimetype.startsWith('video/');
      const dir = isVid ? 'videos' : 'images';
      const ext = path.extname(file.originalname) || (isVid ? '.mp4' : '.jpg');
      const filename = `${randomUUID()}${ext}`;
      const dest = path.join(process.cwd(), 'uploads', dir, filename);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, file.buffer);

      let localThumbnailUrl: string | null = null;
      if (thumbnailBuffer) {
        const thumbFilename = `${randomUUID()}.jpg`;
        const thumbDest = path.join(
          process.cwd(),
          'uploads',
          'thumbnails',
          thumbFilename,
        );
        fs.mkdirSync(path.dirname(thumbDest), { recursive: true });
        fs.writeFileSync(thumbDest, thumbnailBuffer);
        localThumbnailUrl = `/uploads/thumbnails/${thumbFilename}`;
      }

      return {
        url: `/uploads/${dir}/${filename}`,
        thumbnailUrl: localThumbnailUrl,
      };
    };

    let url: string;
    let thumbnailUrl: string | null = null;
    let uploadedPrimaryUrl: string | null = null;
    if (this.storage.isEnabled) {
      try {
        const folder = isVideo ? 'videos' : 'images';
        url = await this.storage.upload(
          file.buffer,
          file.originalname,
          file.mimetype,
          folder,
        );
        uploadedPrimaryUrl = url;
        this.logger.log(`Media uploaded to R2/S3: ${url}`);
        if (thumbnailBuffer) {
          thumbnailUrl = await this.storage.upload(
            thumbnailBuffer,
            'thumb.jpg',
            'image/jpeg',
            'thumbnails',
          );
        }
      } catch (err: any) {
        // The primary object may have succeeded before a thumbnail failure.
        // Best-effort cleanup avoids leaving an orphan for a rejected request.
        if (uploadedPrimaryUrl) {
          await this.cleanupMediaReferences([
            {
              value: uploadedPrimaryUrl,
              prefixes: isVideo ? ['videos'] : ['images'],
            },
          ]);
        }
        if (!this.storage.localDiskFallbackAllowed) {
          this.logger.error(
            `Persistent media upload failed; refusing ephemeral local storage: ${err?.message ?? 'unknown error'}`,
          );
          throw new ServiceUnavailableException(
            'Media storage is temporarily unavailable. Please try again shortly.',
          );
        }
        this.logger.warn(
          `Cloud media upload failed in development; using local disk: ${err?.message ?? 'unknown error'}`,
        );
        const local = writeLocalMedia();
        url = local.url;
        thumbnailUrl = local.thumbnailUrl;
      }
    } else {
      if (!this.storage.localDiskFallbackAllowed) {
        throw new ServiceUnavailableException(
          'Media storage is not configured. Please contact support.',
        );
      }
      const local = writeLocalMedia();
      url = local.url;
      thumbnailUrl = local.thumbnailUrl;
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ── Content moderation pipeline ──────────────────────────────────────────
    const captionText = dto.caption ?? '';
    let scanResult: ReturnType<SafetyService['scan']>;
    let postStatus: string;
    let mediaModerationStatus: string;
    let videoScanJobId: string | null = null;
    let startVideoScanAfterCommit = false;

    try {
      scanResult = this.safety.scan(captionText);
      postStatus = scanResult.riskScore >= 50 ? 'UNDER_REVIEW' : 'PUBLISHED';
      mediaModerationStatus =
        postStatus === 'UNDER_REVIEW' ? 'PENDING' : 'APPROVED';

      // ── Media safety scan (image only; video uses async job) ─────────────
      if (!isVideo && this.mediaSafety.isEnabled) {
        const mediaScan = await this.mediaSafety.scanImage(file.buffer);
        const mediaStatus = this.mediaSafety.statusFromScan(mediaScan);
        if (mediaStatus === 'REJECTED') {
          postStatus = 'REJECTED';
          mediaModerationStatus = 'REJECTED';
        } else if (
          mediaStatus === 'UNDER_REVIEW' &&
          postStatus === 'PUBLISHED'
        ) {
          postStatus = 'UNDER_REVIEW';
          mediaModerationStatus = 'PENDING';
        }
        if (!mediaScan.safe) {
          this.logger.warn(
            `Media scan flagged image: ${mediaScan.topCategory} (${mediaScan.maxConfidence.toFixed(1)}%)`,
          );
        }
      } else if (
        isVideo &&
        this.mediaSafety.isEnabled &&
        this.storage.isEnabled
      ) {
        // Start async video scan job (non-blocking)
        startVideoScanAfterCommit = true;
        // Video stays PUBLISHED until the async job completes
      }
      // ─────────────────────────────────────────────────────────────────────────
    } catch (error) {
      await this.cleanupMediaReferences([
        { value: url, prefixes: isVideo ? ['videos'] : ['images'] },
        { value: thumbnailUrl, prefixes: ['thumbnails'] },
      ]);
      throw error;
    }

    if (postStatus === 'REJECTED') {
      // Hard-blocked by media scanner — don't persist, clean up uploaded file
      await this.cleanupMediaReferences([
        { value: url, prefixes: isVideo ? ['videos'] : ['images'] },
        { value: thumbnailUrl, prefixes: ['thumbnails'] },
      ]);
      throw new ForbiddenException(
        'Media contains content that violates community guidelines',
      );
    }

    let post: any;
    try {
      post = await this.prisma.post.create({
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
              s3Key: this.storage.isEnabled
                ? this.storage.keyFromUrl(url)
                : `legacy/${randomUUID()}`,
              bucket:
                process.env.S3_BUCKET_NAME ?? process.env.S3_BUCKET ?? 'local',
              size: file.size ?? 0,
              url,
              thumbnailUrl,
              mimeType: file.mimetype,
              durationSec: durationSec ?? undefined,
              width: width ?? undefined,
              height: height ?? undefined,
              uploadStatus: 'PUBLISHED',
              moderationStatus: mediaModerationStatus as any,
            },
          },
        },
        select: postSelect(authorId),
      });
    } catch (error) {
      await this.cleanupMediaReferences([
        { value: url, prefixes: isVideo ? ['videos'] : ['images'] },
        { value: thumbnailUrl, prefixes: ['thumbnails'] },
      ]);
      throw error;
    }

    if (startVideoScanAfterCommit) {
      const s3Bucket =
        process.env.S3_BUCKET_NAME ?? process.env.S3_BUCKET ?? '';
      const s3Key = this.storage.keyFromUrl(url);
      this.mediaSafety
        .startVideoScan(s3Bucket, s3Key)
        .then((jobId) => {
          videoScanJobId = jobId;
        })
        .catch(() => {});
    }

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
          verificationStatus: {
            in: ['HUMAN_VERIFIED', 'ID_VERIFIED', 'BUSINESS_VERIFIED'],
          },
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
      take: Math.max(take + 1, take * 3),
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const availablePosts = posts.filter(postHasAvailableMedia);
    const hasMore = availablePosts.length > take;
    const data = availablePosts.slice(0, take).map(mapPost);
    return {
      data,
      nextCursor: hasMore ? data[data.length - 1].id : null,
      mode,
    };
  }

  async getStoryCandidates(userId: string, take = 20) {
    const recentPostCutoff = new Date(Date.now() - 1000 * 60 * 60 * 48);
    const liveCutoff = new Date(Date.now() - 45_000);

    const [currentUser, followingRows, liveSessions] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          profile: { select: { displayName: true, avatarUrl: true } },
        },
      }),
      this.prisma.follow.findMany({
        where: { followerId: userId },
        orderBy: { createdAt: 'desc' },
        select: {
          following: {
            select: {
              id: true,
              username: true,
              profile: { select: { displayName: true, avatarUrl: true } },
            },
          },
        },
      }),
      this.prisma.liveSession.findMany({
        where: { status: 'LIVE', updatedAt: { gte: liveCutoff } },
        include: {
          host: {
            select: {
              id: true,
              username: true,
              profile: { select: { displayName: true, avatarUrl: true } },
            },
          },
        },
        orderBy: { viewerCount: 'desc' },
      }),
    ]);

    const followingUsers = followingRows.map((row) => row.following);
    const followingIds = followingUsers.map((user) => user.id);

    const recentPostRows = followingIds.length
      ? await this.prisma.post.findMany({
          where: {
            status: 'PUBLISHED',
            visibility: 'PUBLIC',
            authorId: { in: followingIds },
            createdAt: { gte: recentPostCutoff },
          },
          select: { authorId: true },
          orderBy: { createdAt: 'desc' },
          distinct: ['authorId'],
        })
      : [];

    const recentAuthorIds = new Set(recentPostRows.map((row) => row.authorId));

    const candidates = new Map<string, StoryCandidate>();

    for (const person of followingUsers) {
      candidates.set(person.id, {
        id: person.id,
        username: person.username,
        displayName: person.profile?.displayName ?? person.username,
        avatarUrl: person.profile?.avatarUrl ?? null,
        isLive: false,
        hasRecentPost: recentAuthorIds.has(person.id),
        liveRoom: null,
      });
    }

    for (const session of liveSessions) {
      const host = session.host;
      if (!host || host.id === userId) continue;
      const existing = candidates.get(host.id);
      if (existing) {
        existing.isLive = true;
        existing.liveRoom = session.room;
      } else {
        candidates.set(host.id, {
          id: host.id,
          username: host.username,
          displayName: host.profile?.displayName ?? host.username,
          avatarUrl: host.profile?.avatarUrl ?? null,
          isLive: true,
          hasRecentPost: false,
          liveRoom: session.room,
        });
      }
    }

    const storyCandidates = Array.from(candidates.values())
      .sort((left, right) => {
        if (left.isLive !== right.isLive)
          return Number(right.isLive) - Number(left.isLive);
        if (left.hasRecentPost !== right.hasRecentPost)
          return Number(right.hasRecentPost) - Number(left.hasRecentPost);
        return left.username.localeCompare(right.username);
      })
      .slice(0, take);

    const suggestedCreators = followingUsers.length
      ? []
      : await this.prisma.user
          .findMany({
            where: {
              id: { not: userId },
              posts: { some: { status: 'PUBLISHED', visibility: 'PUBLIC' } },
            },
            take: 5,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              username: true,
              profile: { select: { displayName: true, avatarUrl: true } },
            },
          })
          .then((rows) =>
            rows.map((row) => ({
              id: row.id,
              username: row.username,
              displayName: row.profile?.displayName ?? row.username,
              avatarUrl: row.profile?.avatarUrl ?? null,
            })),
          );

    return {
      currentUser: currentUser
        ? {
            id: currentUser.id,
            username: currentUser.username,
            displayName:
              currentUser.profile?.displayName ?? currentUser.username,
            avatarUrl: currentUser.profile?.avatarUrl ?? null,
          }
        : null,
      storyCandidates,
      suggestedCreators,
    };
  }

  async getReels(userId: string, mode = 'FOR_YOU', cursor?: string, take = 10) {
    let where: any = {
      status: 'PUBLISHED',
      visibility: 'PUBLIC',
      type: { in: ['VIDEO', 'SHORT_VIDEO'] },
    };

    if (mode === 'FOLLOWING') {
      const following = await this.prisma.follow.findMany({
        where: { followerId: userId },
        select: { followingId: true },
      });
      const ids = [userId, ...following.map((f) => f.followingId)];
      where = { ...where, authorId: { in: ids } };
    }

    const posts = await this.prisma.post.findMany({
      where,
      select: postSelect(userId),
      orderBy: { createdAt: 'desc' },
      take: Math.max(take + 1, take * 3),
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const availablePosts = posts.filter(postHasAvailableMedia);
    const hasMore = availablePosts.length > take;
    const data = availablePosts.slice(0, take).map(mapPost);
    return {
      data,
      nextCursor: hasMore ? data[data.length - 1].id : null,
      mode,
    };
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

    const availablePosts = posts.filter(postHasAvailableMedia);
    const hasMore = availablePosts.length > 20;
    const data = availablePosts.slice(0, 20).map(mapPost);
    return { data, nextCursor: hasMore ? data[data.length - 1].id : null };
  }

  async deletePost(postId: string, userId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: {
        authorId: true,
        media: {
          select: {
            id: true,
            bucket: true,
            s3Key: true,
            url: true,
            thumbnailUrl: true,
            storyId: true,
          },
        },
      },
    });
    if (!post) throw new NotFoundException('Post not found');
    if (post.authorId !== userId) throw new ForbiddenException();

    // A legacy row can be referenced by both a post and a story. In that case
    // deleting the post must only detach the relation (via onDelete: SetNull),
    // not delete media that the story still owns.
    const disposableMedia = post.media.filter((asset) => !asset.storyId);
    const mediaIds = disposableMedia.map((asset) => asset.id);
    const references: OwnedMediaReference[] = [];
    for (const asset of disposableMedia) {
      const localPrimary = localUploadFilePath(asset.url);
      const localThumbnail = localUploadFilePath(asset.thumbnailUrl);

      if (localPrimary) {
        references.push({
          value: asset.url,
          prefixes: ['images', 'videos', 'uploads'],
        });
      } else if (asset.bucket === this.storage.bucketName) {
        references.push({
          value: asset.s3Key,
          prefixes: ['images', 'videos', 'uploads'],
        });
      }

      if (localThumbnail || asset.bucket === this.storage.bucketName) {
        references.push({
          value: asset.thumbnailUrl,
          prefixes: ['thumbnails'],
        });
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await queueOwnedMediaCleanup(
        tx,
        this.storage,
        references,
        'post-delete',
      );
      if (mediaIds.length > 0) {
        await tx.mediaAsset.deleteMany({ where: { id: { in: mediaIds } } });
      }
      await tx.post.delete({ where: { id: postId } });
    });
    await this.cleanupMediaReferences(references);

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
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: mediaId },
    });
    if (!asset) throw new NotFoundException('Media asset not found');
    if (asset.userId !== authorId)
      throw new ForbiddenException('Not your media asset');
    if (asset.postId || asset.storyId)
      throw new BadRequestException(
        'Media asset is already attached',
      );
    if (asset.uploadStatus === 'PENDING' || asset.uploadStatus === 'FINALIZING') {
      throw new BadRequestException(
        'Upload not confirmed yet — call complete-upload first',
      );
    }
    if (asset.uploadStatus === 'TRANSCODING') {
      throw new BadRequestException(
        'Video is still processing — check status and retry shortly',
      );
    }
    if (asset.uploadStatus === 'REJECTED') {
      throw new BadRequestException('Media was rejected by the safety scanner');
    }
    if (
      asset.uploadStatus !== 'PUBLISHED' ||
      asset.moderationStatus !== 'APPROVED' ||
      !asset.url
    ) {
      throw new BadRequestException(
        'Media safety review must finish before creating a post',
      );
    }

    const captionText = dto.caption ?? '';
    const scanResult = this.safety.scan(captionText);
    const postStatus =
      scanResult.riskScore >= 50 ? 'UNDER_REVIEW' : 'PUBLISHED';
    const type =
      dto.type ?? (asset.mimeType.startsWith('video/') ? 'VIDEO' : 'PHOTO');

    const post = await this.prisma.$transaction(async (tx) => {
      const created = await tx.post.create({
        data: {
          authorId,
          caption: dto.caption,
          type,
          visibility: dto.visibility ?? 'PUBLIC',
          aiLabel: dto.aiLabel ?? 'NONE',
          status: postStatus as any,
        },
        select: { id: true },
      });

      const reserved = await tx.mediaAsset.updateMany({
        where: {
          id: mediaId,
          userId: authorId,
          postId: null,
          storyId: null,
          uploadStatus: 'PUBLISHED',
          moderationStatus: 'APPROVED',
          url: { not: null },
        },
        data: { postId: created.id },
      });
      if (reserved.count !== 1) {
        throw new BadRequestException(
          'Media changed, failed review, or was already attached',
        );
      }

      const attached = await tx.post.findUnique({
        where: { id: created.id },
        select: postSelect(authorId),
      });
      if (!attached) throw new Error('Created post could not be reloaded');
      return attached;
    });

    if (!scanResult.safe) {
      this.safety.scanAndPersist('post', post.id, captionText).catch(() => {});
    }

    return {
      ...mapPost(post),
      underReview: postStatus === 'UNDER_REVIEW',
      videoScanJobId: null,
    };
  }
}
