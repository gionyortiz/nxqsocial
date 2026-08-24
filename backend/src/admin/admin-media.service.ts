import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { MediaAsset, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ManagedStoragePrefix,
  StorageService,
} from '../common/storage/storage.service';
import { MediaSafetyService } from '../safety/media-safety.service';
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

const PRIMARY_MEDIA_PREFIXES = [
  'images',
  'videos',
  'audio',
  'uploads',
] as const;
const IMMUTABLE_PROCESSING_PREFIX = 'processing/media-finalizing/';

function isImmutableProcessingKeyForMedia(
  reference: unknown,
  mediaId: string,
): reference is string {
  if (typeof reference !== 'string') return false;
  const safeMediaId = mediaId.replace(/[^A-Za-z0-9_-]/g, '_');
  return reference.startsWith(`${IMMUTABLE_PROCESSING_PREFIX}${safeMediaId}/`);
}

type CleanupJob = {
  kind: 'PUBLIC_STORAGE' | 'QUARANTINE_STORAGE' | 'MODERATION_STORAGE';
  reference: string;
  allowedPrefixes: ManagedStoragePrefix[];
  source: string;
};

@Injectable()
export class AdminMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly safety: MediaSafetyService,
  ) {}

  private jsonObject(value: Prisma.JsonValue | null): Prisma.JsonObject {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : {};
  }

  private async cleanupAssetObjects(asset: MediaAsset): Promise<void> {
    if (this.storage.isEnabled && asset.s3Key) {
      if (asset.bucket === this.storage.quarantineBucketName) {
        if (
          asset.s3Key.startsWith('incoming/') ||
          isImmutableProcessingKeyForMedia(asset.s3Key, asset.id)
        ) {
          await this.storage.deleteIncoming(asset.s3Key);
        }
      } else if (asset.bucket === this.storage.bucketName) {
        await this.storage.deleteManagedObject(asset.s3Key);
        await this.storage.deleteManagedObject(asset.thumbnailUrl);
      }
    }
    const safetyResult = this.jsonObject(asset.safetyResult);
    const immutableSourceKey = safetyResult.immutableSourceKey;
    if (
      this.storage.isEnabled &&
      immutableSourceKey !== asset.s3Key &&
      isImmutableProcessingKeyForMedia(immutableSourceKey, asset.id)
    ) {
      await this.storage.deleteIncoming(immutableSourceKey);
    }
    await Promise.all([
      this.storage.deleteManagedObject(
        safetyResult.finalKey as string | undefined,
        ['images', 'videos', 'audio'],
      ),
      this.storage.deleteManagedObject(
        safetyResult.transcodeOutputKey as string | undefined,
        ['videos'],
      ),
      this.storage.deleteManagedObject(
        safetyResult.transcodeThumbnailKey as string | undefined,
        ['thumbnails'],
      ),
    ]);
    await this.safety.cleanupVideoScanObject(
      safetyResult.moderationObjectKey as string | undefined,
    );
  }

  private exactSnapshotWhere(asset: MediaAsset): Prisma.MediaAssetWhereInput {
    return {
      id: asset.id,
      uploadStatus: asset.uploadStatus,
      s3Key: asset.s3Key,
      safetyJobId: asset.safetyJobId,
      finalizationToken: asset.finalizationToken,
      updatedAt: asset.updatedAt,
    };
  }

  private cleanupJobsForSnapshot(
    asset: MediaAsset,
    source: string,
  ): CleanupJob[] {
    const jobs = new Map<string, CleanupJob>();
    const addQuarantine = (reference: unknown, allowIncoming = false) => {
      if (typeof reference !== 'string') return;
      if (
        !(allowIncoming && reference.startsWith('incoming/')) &&
        !isImmutableProcessingKeyForMedia(reference, asset.id)
      ) {
        return;
      }
      jobs.set(`QUARANTINE_STORAGE:${reference}`, {
        kind: 'QUARANTINE_STORAGE',
        reference,
        allowedPrefixes: [],
        source,
      });
    };
    const addPublic = (
      reference: string | null | undefined,
      allowedPrefixes: readonly ManagedStoragePrefix[],
    ) => {
      const key = this.storage.managedKeyFromReference(
        reference,
        allowedPrefixes,
      );
      if (!key) return;
      jobs.set(`PUBLIC_STORAGE:${key}`, {
        kind: 'PUBLIC_STORAGE',
        reference: key,
        allowedPrefixes: [...allowedPrefixes],
        source,
      });
    };

    const safetyResult = this.jsonObject(asset.safetyResult);
    if (this.storage.isEnabled && asset.s3Key) {
      if (asset.bucket === this.storage.quarantineBucketName) {
        addQuarantine(asset.s3Key, true);
      } else if (asset.bucket === this.storage.bucketName) {
        addPublic(asset.s3Key, PRIMARY_MEDIA_PREFIXES);
        addPublic(asset.thumbnailUrl, ['thumbnails']);
      }
    }
    addQuarantine(safetyResult.immutableSourceKey);

    addPublic(
      typeof safetyResult.finalKey === 'string'
        ? safetyResult.finalKey
        : undefined,
      ['images', 'videos', 'audio'],
    );
    addPublic(
      typeof safetyResult.transcodeOutputKey === 'string'
        ? safetyResult.transcodeOutputKey
        : undefined,
      ['videos'],
    );
    addPublic(
      typeof safetyResult.transcodeThumbnailKey === 'string'
        ? safetyResult.transcodeThumbnailKey
        : undefined,
      ['thumbnails'],
    );

    const moderationObjectKey = safetyResult.moderationObjectKey;
    if (
      typeof moderationObjectKey === 'string' &&
      moderationObjectKey.startsWith('nxq-social/')
    ) {
      jobs.set(`MODERATION_STORAGE:${moderationObjectKey}`, {
        kind: 'MODERATION_STORAGE',
        reference: moderationObjectKey,
        allowedPrefixes: [],
        source,
      });
    }

    return [...jobs.values()];
  }

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
    });
    if (!asset) throw new NotFoundException('MediaAsset not found');
    if (asset.uploadStatus !== 'PUBLISHED' || !asset.url) {
      throw new BadRequestException(
        'Rejected or removed media has no retained object to approve',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const approved = await tx.mediaAsset.updateMany({
        where: { id: mediaId, uploadStatus: 'PUBLISHED', url: { not: null } },
        data: { moderationStatus: 'APPROVED' },
      });
      if (approved.count !== 1) {
        throw new BadRequestException(
          'Media changed while approval was applied',
        );
      }
      await tx.post.updateMany({
        where: { status: 'UNDER_REVIEW', media: { some: { id: mediaId } } },
        data: { status: 'PUBLISHED' },
      });
      await tx.story.updateMany({
        where: { status: 'UNDER_REVIEW', media: { is: { id: mediaId } } },
        data: { status: 'PUBLISHED' },
      });
    });

    return { success: true, id: mediaId, moderationStatus: 'APPROVED' };
  }

  async reject(mediaId: string, reason?: string) {
    const asset = await this.prisma.$transaction(async (tx) => {
      const snapshot = await tx.mediaAsset.findUnique({
        where: { id: mediaId },
      });
      if (!snapshot) throw new NotFoundException('MediaAsset not found');
      if (
        snapshot.uploadStatus === 'FINALIZING' ||
        snapshot.uploadStatus === 'TRANSCODING'
      ) {
        throw new BadRequestException(
          'Media processing is in progress; retry shortly',
        );
      }
      if (snapshot.uploadStatus === 'REMOVING') {
        throw new BadRequestException('Media is already being removed');
      }

      const priorSafetyResult = this.jsonObject(snapshot.safetyResult);
      const safetyResult: Prisma.InputJsonObject = {
        ...priorSafetyResult,
        status: 'ADMIN_REJECTED',
        adminRejectionReason: reason ?? null,
        cleanupPending: true,
        rejectedAt: new Date().toISOString(),
      };
      const rejected = await tx.mediaAsset.updateMany({
        where: this.exactSnapshotWhere(snapshot),
        data: {
          moderationStatus: 'REJECTED',
          uploadStatus: 'REJECTED',
          url: null,
          safetyResult,
        },
      });
      if (rejected.count !== 1) {
        throw new BadRequestException(
          'Media changed while rejection was applied; retry',
        );
      }
      await tx.post.updateMany({
        where: { media: { some: { id: mediaId } } },
        data: { status: 'REMOVED' },
      });
      await tx.story.updateMany({
        where: { media: { is: { id: mediaId } } },
        data: { status: 'REMOVED' },
      });

      const cleanupJobs = this.cleanupJobsForSnapshot(
        snapshot,
        'admin-media-reject',
      );
      if (cleanupJobs.length > 0) {
        await tx.objectCleanupJob.createMany({
          data: cleanupJobs,
          skipDuplicates: true,
        });
      }
      return snapshot;
    });

    // The transaction above owns durability. This best-effort pass only
    // shortens the deletion window; the queued jobs and rejected-media
    // recovery remain authoritative after a process crash.
    await this.cleanupAssetObjects(asset).catch(() => {});

    return { success: true, id: mediaId, moderationStatus: 'REJECTED' };
  }

  async remove(mediaId: string) {
    const asset = await this.prisma.$transaction(async (tx) => {
      const snapshot = await tx.mediaAsset.findUnique({
        where: { id: mediaId },
      });
      if (!snapshot) throw new NotFoundException('MediaAsset not found');
      if (
        snapshot.uploadStatus === 'FINALIZING' ||
        snapshot.uploadStatus === 'TRANSCODING'
      ) {
        throw new BadRequestException(
          'Media processing is in progress; retry shortly',
        );
      }
      if (snapshot.uploadStatus === 'REMOVING') {
        throw new BadRequestException('Media is already being removed');
      }

      const priorSafetyResult = this.jsonObject(snapshot.safetyResult);
      const claimed = await tx.mediaAsset.updateMany({
        where: this.exactSnapshotWhere(snapshot),
        data: {
          moderationStatus: 'REMOVED',
          uploadStatus: 'REMOVING',
          url: null,
          safetyResult: {
            ...priorSafetyResult,
            status: 'REMOVING',
            removalStartedAt: new Date().toISOString(),
          },
        },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException(
          'Media changed while removal was applied; retry',
        );
      }
      await tx.post.updateMany({
        where: { media: { some: { id: mediaId } } },
        data: { status: 'REMOVED' },
      });
      await tx.story.updateMany({
        where: { media: { is: { id: mediaId } } },
        data: { status: 'REMOVED' },
      });

      const cleanupJobs = this.cleanupJobsForSnapshot(
        snapshot,
        'admin-media-remove',
      );
      if (cleanupJobs.length > 0) {
        await tx.objectCleanupJob.createMany({
          data: cleanupJobs,
          skipDuplicates: true,
        });
      }
      return snapshot;
    });

    await this.cleanupAssetObjects(asset)
      .then(() =>
        this.prisma.mediaAsset.deleteMany({
          where: {
            id: mediaId,
            uploadStatus: 'REMOVING',
            s3Key: asset.s3Key,
            safetyJobId: asset.safetyJobId,
            finalizationToken: asset.finalizationToken,
          },
        }),
      )
      .catch(() => {});

    return { success: true, id: mediaId, moderationStatus: 'REMOVED' };
  }
}
