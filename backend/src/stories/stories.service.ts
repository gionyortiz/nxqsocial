import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SafetyService } from '../safety/safety.service';
import { StorageService } from '../common/storage/storage.service';
import {
  cleanupOwnedMediaReferences,
  OwnedMediaReference,
  ownedLocalUploadPath,
  queueOwnedMediaCleanup,
} from '../common/storage/owned-media-cleanup';
import { canonicalPublicMediaUrl } from '../common/storage/public-media-url';
import { CreateStoryDto } from './stories.dto';

const STORY_ACTIVE_TTL_MS = 24 * 60 * 60 * 1000;
const EXPIRED_STORY_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
const EXPIRED_STORY_CLEANUP_BATCH = 50;
const MAX_EXPIRED_STORY_CLEANUP_BATCH = 100;
const IMMUTABLE_PROCESSING_PREFIX = 'processing/media-finalizing/';

function isImmutableProcessingKeyForMedia(
  reference: unknown,
  mediaId: string,
): reference is string {
  if (typeof reference !== 'string') return false;
  const safeMediaId = mediaId.replace(/[^A-Za-z0-9_-]/g, '_');
  return reference.startsWith(`${IMMUTABLE_PROCESSING_PREFIX}${safeMediaId}/`);
}

const STORY_LIFECYCLE_SELECT = {
  id: true,
  authorId: true,
  expiresAt: true,
  media: {
    select: {
      id: true,
      userId: true,
      postId: true,
      bucket: true,
      s3Key: true,
      url: true,
      thumbnailUrl: true,
      safetyResult: true,
    },
  },
};

const AUTHOR_SELECT = {
  id: true,
  username: true,
  profile: { select: { displayName: true, avatarUrl: true } },
};

const MEDIA_SELECT = {
  id: true,
  bucket: true,
  s3Key: true,
  url: true,
  thumbnailUrl: true,
  mimeType: true,
  width: true,
  height: true,
  durationSec: true,
};

const STORY_SELECT = {
  id: true,
  caption: true,
  visibility: true,
  status: true,
  expiresAt: true,
  createdAt: true,
  author: { select: AUTHOR_SELECT },
  media: { select: MEDIA_SELECT },
};

function mapStory(s: any, viewed: boolean) {
  const { author, media, ...rest } = s;
  const { profile, ...authorBase } = author;
  return {
    ...rest,
    viewed,
    author: {
      ...authorBase,
      ...(profile ?? {}),
      avatarUrl: canonicalPublicMediaUrl(profile?.avatarUrl),
    },
    media: media
      ? (() => {
          const { bucket, s3Key, ...publicMedia } = media;
          return {
            ...publicMedia,
            url: canonicalPublicMediaUrl(media.url, {
              bucket,
              objectKey: s3Key,
              allowedPrefixes: ['images', 'videos', 'audio', 'uploads'],
            }),
            thumbnailUrl: canonicalPublicMediaUrl(media.thumbnailUrl, {
              bucket,
              allowedPrefixes: ['thumbnails'],
            }),
          };
        })()
      : null,
  };
}

@Injectable()
export class StoriesService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(StoriesService.name);
  private expiredCleanupTimer?: NodeJS.Timeout;
  private expiredCleanupRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly safety: SafetyService,
    private readonly storage: StorageService,
  ) {}

  onApplicationBootstrap(): void {
    void this.cleanupExpiredStories().catch((error: any) => {
      this.logger.warn(
        `Initial expired-story cleanup failed: ${error?.message ?? 'unknown error'}`,
      );
    });
    this.expiredCleanupTimer = setInterval(() => {
      void this.cleanupExpiredStories().catch((error: any) => {
        this.logger.warn(
          `Periodic expired-story cleanup failed: ${error?.message ?? 'unknown error'}`,
        );
      });
    }, EXPIRED_STORY_CLEANUP_INTERVAL_MS);
    this.expiredCleanupTimer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.expiredCleanupTimer) clearInterval(this.expiredCleanupTimer);
  }

  async createFromAsset(authorId: string, dto: CreateStoryDto) {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: dto.mediaId },
    });
    if (!asset) throw new NotFoundException('Media asset not found');
    if (asset.userId !== authorId)
      throw new ForbiddenException('Not your media asset');
    if (asset.postId || asset.storyId) {
      throw new BadRequestException('Media asset is already attached');
    }
    if (
      asset.uploadStatus === 'PENDING' ||
      asset.uploadStatus === 'FINALIZING'
    ) {
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
        'Media safety review must finish before creating a story',
      );
    }

    const captionText = dto.caption ?? '';
    const scanResult = this.safety.scan(captionText);
    const status = scanResult.riskScore >= 50 ? 'UNDER_REVIEW' : 'PUBLISHED';
    const expiresAt = new Date(Date.now() + STORY_ACTIVE_TTL_MS);

    const story = await this.prisma.$transaction(async (tx) => {
      const created = await tx.story.create({
        data: {
          authorId,
          caption: dto.caption,
          visibility: dto.visibility ?? 'PUBLIC',
          status: status as any,
          expiresAt,
        },
        select: { id: true },
      });

      const reserved = await tx.mediaAsset.updateMany({
        where: {
          id: dto.mediaId,
          userId: authorId,
          postId: null,
          storyId: null,
          uploadStatus: 'PUBLISHED',
          moderationStatus: 'APPROVED',
          url: { not: null },
        },
        data: { storyId: created.id },
      });
      if (reserved.count !== 1) {
        throw new BadRequestException(
          'Media changed, failed review, or was already attached',
        );
      }

      const attached = await tx.story.findUnique({
        where: { id: created.id },
        select: STORY_SELECT,
      });
      if (!attached) throw new Error('Created story could not be reloaded');
      return attached;
    });

    if (!scanResult.safe) {
      this.safety
        .scanAndPersist('story', story.id, captionText)
        .catch(() => {});
    }

    return {
      ...mapStory(story, false),
      underReview: status === 'UNDER_REVIEW',
    };
  }

  /** Active stories from people the viewer follows, plus their own, grouped by author. */
  async getFeed(viewerId: string) {
    const follows = await this.prisma.follow.findMany({
      where: { followerId: viewerId },
      select: { followingId: true },
    });
    const followingIds = follows.map((f) => f.followingId);

    const stories = await this.prisma.story.findMany({
      where: {
        status: 'PUBLISHED',
        expiresAt: { gt: new Date() },
        OR: [
          { authorId: viewerId },
          {
            authorId: { in: followingIds },
            visibility: { in: ['PUBLIC', 'FOLLOWERS'] },
          },
        ],
      },
      select: STORY_SELECT,
      orderBy: { createdAt: 'asc' },
    });

    const seen = await this.prisma.storyView.findMany({
      where: { viewerId, storyId: { in: stories.map((s) => s.id) } },
      select: { storyId: true },
    });
    const seenIds = new Set(seen.map((v) => v.storyId));

    const groups = new Map<
      string,
      { author: any; hasUnseen: boolean; stories: any[] }
    >();
    for (const story of stories) {
      const key = story.author.id;
      if (!groups.has(key)) {
        const { profile, ...authorBase } = story.author;
        groups.set(key, {
          author: { ...authorBase, ...(profile ?? {}) },
          hasUnseen: false,
          stories: [],
        });
      }
      const group = groups.get(key)!;
      const viewed = seenIds.has(story.id);
      if (!viewed) group.hasUnseen = true;
      group.stories.push(mapStory(story, viewed));
    }

    const authors = Array.from(groups.values());

    authors.sort((a, b) => {
      if (a.author.id === viewerId) return -1;
      if (b.author.id === viewerId) return 1;
      if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
      const aLatest = a.stories[a.stories.length - 1]?.createdAt ?? 0;
      const bLatest = b.stories[b.stories.length - 1]?.createdAt ?? 0;
      return new Date(bLatest).getTime() - new Date(aLatest).getTime();
    });

    return { authors };
  }

  async getActiveStoriesForUser(username: string, viewerId: string) {
    const author = await this.prisma.user.findUnique({ where: { username } });
    if (!author) throw new NotFoundException('User not found');

    const isSelf = author.id === viewerId;
    const visibility = isSelf
      ? undefined
      : { in: ['PUBLIC' as const, 'FOLLOWERS' as const] };

    const stories = await this.prisma.story.findMany({
      where: {
        authorId: author.id,
        status: 'PUBLISHED',
        expiresAt: { gt: new Date() },
        ...(visibility ? { visibility } : {}),
      },
      select: STORY_SELECT,
      orderBy: { createdAt: 'asc' },
    });

    const seen = await this.prisma.storyView.findMany({
      where: { viewerId, storyId: { in: stories.map((s) => s.id) } },
      select: { storyId: true },
    });
    const seenIds = new Set(seen.map((v) => v.storyId));

    return { stories: stories.map((s) => mapStory(s, seenIds.has(s.id))) };
  }

  async recordView(storyId: string, viewerId: string) {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
    });
    if (!story) throw new NotFoundException('Story not found');
    if (story.authorId === viewerId) return { viewed: true };

    await this.prisma.storyView.upsert({
      where: { storyId_viewerId: { storyId, viewerId } },
      create: { storyId, viewerId },
      update: {},
    });
    return { viewed: true };
  }

  async deleteOwn(storyId: string, userId: string) {
    await this.deleteStoryAndExclusiveMedia(storyId, {
      expectedAuthorId: userId,
    });
    return { success: true };
  }

  /**
   * Reclaim a bounded batch of expired stories. Each row is revalidated inside
   * its transaction so overlapping application replicas remain safe.
   */
  async cleanupExpiredStories(limit = EXPIRED_STORY_CLEANUP_BATCH): Promise<{
    scanned: number;
    deleted: number;
    failed: number;
    busy: boolean;
  }> {
    if (this.expiredCleanupRunning) {
      return { scanned: 0, deleted: 0, failed: 0, busy: true };
    }

    this.expiredCleanupRunning = true;
    try {
      const batchSize = Math.max(
        1,
        Math.min(MAX_EXPIRED_STORY_CLEANUP_BATCH, Math.trunc(limit) || 1),
      );
      const expiredBefore = new Date();
      const candidates = await this.prisma.story.findMany({
        where: { expiresAt: { lte: expiredBefore } },
        orderBy: { expiresAt: 'asc' },
        take: batchSize,
        select: { id: true },
      });

      let deleted = 0;
      let failed = 0;
      for (const candidate of candidates) {
        try {
          const removed = await this.deleteStoryAndExclusiveMedia(
            candidate.id,
            {
              expiredBefore,
              missingIsNoop: true,
            },
          );
          if (removed) deleted += 1;
        } catch (error: any) {
          failed += 1;
          this.logger.warn(
            `Could not reclaim expired story ${candidate.id}: ${error?.message ?? 'unknown error'}`,
          );
        }
      }

      return {
        scanned: candidates.length,
        deleted,
        failed,
        busy: false,
      };
    } finally {
      this.expiredCleanupRunning = false;
    }
  }

  private async deleteStoryAndExclusiveMedia(
    storyId: string,
    options: {
      expectedAuthorId?: string;
      expiredBefore?: Date;
      missingIsNoop?: boolean;
    },
  ): Promise<boolean> {
    const result = await this.prisma.$transaction(async (tx) => {
      const story = await tx.story.findUnique({
        where: { id: storyId },
        select: STORY_LIFECYCLE_SELECT,
      });
      if (!story) {
        if (options.missingIsNoop) {
          return { removed: false, media: null, references: [] };
        }
        throw new NotFoundException('Story not found');
      }
      if (
        options.expectedAuthorId &&
        story.authorId !== options.expectedAuthorId
      ) {
        throw new ForbiddenException();
      }
      if (
        options.expiredBefore &&
        story.expiresAt.getTime() > options.expiredBefore.getTime()
      ) {
        return { removed: false, media: null, references: [] };
      }

      // A legacy asset may also be attached to a post. In that case the post
      // remains its owner and deleting the story only detaches storyId through
      // the schema's onDelete: SetNull relation.
      const exclusiveMedia =
        story.media && !story.media.postId ? story.media : null;
      const references = this.storyMediaReferences(exclusiveMedia);
      await queueOwnedMediaCleanup(
        tx,
        this.storage,
        references,
        options.expiredBefore ? 'expired-story-delete' : 'story-delete',
      );
      if (exclusiveMedia) {
        const safetyResult = exclusiveMedia.safetyResult as any;
        const source = options.expiredBefore
          ? 'expired-story-delete'
          : 'story-delete';
        const auxiliaryJobs = new Map<
          string,
          {
            kind: 'QUARANTINE_STORAGE' | 'MODERATION_STORAGE';
            reference: string;
            allowedPrefixes: string[];
            source: string;
          }
        >();
        const addQuarantine = (reference: unknown) => {
          if (typeof reference !== 'string') return;
          const isOwnedIncoming =
            reference === exclusiveMedia.s3Key &&
            reference.startsWith(`incoming/${story.authorId}/`);
          if (
            !isOwnedIncoming &&
            !isImmutableProcessingKeyForMedia(reference, exclusiveMedia.id)
          ) {
            return;
          }
          auxiliaryJobs.set(`QUARANTINE_STORAGE:${reference}`, {
            kind: 'QUARANTINE_STORAGE',
            reference,
            allowedPrefixes: [],
            source,
          });
        };
        if (exclusiveMedia.bucket === this.storage.quarantineBucketName) {
          addQuarantine(exclusiveMedia.s3Key);
        }
        addQuarantine(safetyResult?.immutableSourceKey);
        if (
          typeof safetyResult?.moderationObjectKey === 'string' &&
          safetyResult.moderationObjectKey.startsWith('nxq-social/')
        ) {
          auxiliaryJobs.set(
            `MODERATION_STORAGE:${safetyResult.moderationObjectKey}`,
            {
              kind: 'MODERATION_STORAGE',
              reference: safetyResult.moderationObjectKey,
              allowedPrefixes: [],
              source,
            },
          );
        }
        if (auxiliaryJobs.size > 0) {
          await tx.objectCleanupJob.createMany({
            data: [...auxiliaryJobs.values()],
            skipDuplicates: true,
          });
        }
      }
      if (exclusiveMedia) {
        const deletedMedia = await tx.mediaAsset.deleteMany({
          where: {
            id: exclusiveMedia.id,
            storyId: story.id,
            postId: null,
          },
        });
        if (deletedMedia.count !== 1) {
          throw new ConflictException(
            'Story media changed concurrently. Please try again.',
          );
        }
      }

      const deletedStory = await tx.story.deleteMany({
        where: {
          id: story.id,
          ...(options.expiredBefore
            ? { expiresAt: { lte: options.expiredBefore } }
            : {}),
        },
      });
      if (deletedStory.count !== 1) {
        throw new ConflictException(
          'Story changed concurrently. Please try again.',
        );
      }

      return { removed: true, media: exclusiveMedia, references };
    });

    if (!result.removed || !result.media) return result.removed;

    await cleanupOwnedMediaReferences(
      this.storage,
      result.references,
      (error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Story object cleanup failed: ${message}`);
      },
    );
    return true;
  }

  private storyMediaReferences(
    media: {
      bucket: string;
      s3Key: string;
      url: string | null;
      thumbnailUrl: string | null;
      safetyResult: unknown;
    } | null,
  ): OwnedMediaReference[] {
    if (!media) return [];
    const primaryPrefixes = ['images', 'videos', 'audio', 'uploads'] as const;
    const references: OwnedMediaReference[] = [];
    const finalKey = (media.safetyResult as any)?.finalKey;
    if (typeof finalKey === 'string') {
      references.push({ value: finalKey, prefixes: primaryPrefixes });
    }
    if (media.bucket === this.storage.bucketName) {
      references.push({ value: media.s3Key, prefixes: primaryPrefixes });
      references.push({
        value: media.thumbnailUrl,
        prefixes: ['thumbnails'],
      });
    } else {
      if (ownedLocalUploadPath(media.url, primaryPrefixes)) {
        references.push({ value: media.url, prefixes: primaryPrefixes });
      }
      if (ownedLocalUploadPath(media.thumbnailUrl, ['thumbnails'])) {
        references.push({
          value: media.thumbnailUrl,
          prefixes: ['thumbnails'],
        });
      }
    }
    return references;
  }
}
