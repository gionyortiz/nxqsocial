import {
  Injectable,
  Inject,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import {
  CLIENT_UPLOAD_PREFIX,
  IMMUTABLE_MEDIA_PREFIX,
  isManagedQuarantineObjectKey,
  StorageService,
} from '../common/storage/storage.service';
import { MediaSafetyService } from '../safety/media-safety.service';
import { VideoTranscodeService } from './video-transcode.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import {
  ALLOWED_MIME_TYPES,
  AUDIO_SIZE_LIMIT,
  IMAGE_SIZE_LIMIT,
  VIDEO_SIZE_LIMIT,
} from './media.dto';

const PRESIGN_TTL_SECONDS = 600; // 10 minutes
const VIDEO_SCAN_TIMEOUT_MS = 5 * 60 * 1000;
const TRANSCODE_WORKER_LOCK = 'nxq:media:transcode:worker';
const TRANSCODE_LOCK_TTL_MS = 2 * 60 * 1000;
const TRANSCODE_LOCK_RENEW_MS = 20 * 1000;
const MEDIA_RECOVERY_INTERVAL_MS = 30 * 1000;
const FINALIZING_STALE_MS = 15 * 60 * 1000;
const TRANSCODE_ATTEMPT_STALE_MS = 12 * 60 * 1000;
// A presigned request is authorized when the PUT begins and may continue after
// URL expiry. Keep an additional hour of application-level retention for a
// slow 200 MiB mobile upload before considering the row abandoned.
const ABANDONED_UPLOAD_GRACE_MS = 60 * 60 * 1000;
const ABANDONED_PENDING_MS =
  PRESIGN_TTL_SECONDS * 1000 + ABANDONED_UPLOAD_GRACE_MS;

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
    'audio/mp4': '.m4a',
  };
  return map[mime] ?? '';
}

function isVideo(mime: string): boolean {
  return mime.startsWith('video/');
}

function isAudio(mime: string): boolean {
  return mime.startsWith('audio/');
}

function finalObjectKey(userId: string, mimeType: string): string {
  const folder = isVideo(mimeType)
    ? 'videos'
    : isAudio(mimeType)
      ? 'audio'
      : 'images';
  return `${folder}/${userId}/${randomUUID()}${extFromMime(mimeType)}`;
}

export function videoStartFailureData(reason?: string, userMessage?: string) {
  return {
    status: 'FAILED_TO_START',
    failureReason: reason ?? null,
    userMessage: userMessage ?? 'Video processing failed. Please try again.',
    cleanupPending: true,
  };
}

function videoTimeoutData() {
  return {
    status: 'PROCESSING_TIMEOUT',
    reviewReason: 'Video processing failed or timed out',
    userMessage: 'Video safety review timed out. Please upload the video again.',
    cleanupPending: true,
  };
}

export function videoTranscodeFailureData(reason?: string) {
  return {
    status: 'TRANSCODE_FAILED',
    failureReason: reason ?? null,
    userMessage: 'Video could not be processed. Please try a different file.',
    cleanupPending: true,
    failedAt: new Date().toISOString(),
  };
}

interface TranscodePlan {
  token: string;
  videoKey: string;
  thumbnailKey: string;
  moderationObjectKey: string;
}

interface CleanupJobData {
  kind: 'PUBLIC_STORAGE' | 'QUARANTINE_STORAGE' | 'MODERATION_STORAGE';
  reference: string;
  allowedPrefixes: string[];
  source: string;
}

interface PersistedTranscodeReplacement {
  url: string;
  thumbnailUrl: string;
  mimeType: 'video/mp4';
  durationSec: number;
  width: number;
  height: number;
  s3Key: string;
  bucket: string;
  outputBytes: number;
  thumbnailBytes: number;
  outputSha256: string;
  thumbnailSha256: string;
}

function transcodePlan(mediaId: string, token: string): TranscodePlan {
  const safeMediaId = mediaId.replace(/[^A-Za-z0-9_-]/g, '_');
  if (!safeMediaId || !/^[0-9a-f-]{36}$/i.test(token)) {
    throw new Error('Invalid persisted video transcode plan');
  }
  return {
    token,
    videoKey: `videos/transcodes/${safeMediaId}/${token}.mp4`,
    thumbnailKey: `thumbnails/transcodes/${safeMediaId}/${token}.jpg`,
    moderationObjectKey: `nxq-social/transcodes/${safeMediaId}/${token}.mp4`,
  };
}

function planSafetyResult(asset: any, plan: TranscodePlan) {
  return {
    ...((asset.safetyResult as object) ?? {}),
    status: 'TRANSCODING',
    transcodePlanId: plan.token,
    transcodeOutputKey: plan.videoKey,
    transcodeThumbnailKey: plan.thumbnailKey,
    moderationObjectKey: plan.moderationObjectKey,
    transcodePlannedAt:
      (asset.safetyResult as any)?.transcodePlannedAt ?? new Date().toISOString(),
  };
}

function planCleanupJobs(plan: TranscodePlan, source: string): CleanupJobData[] {
  return [
    {
      kind: 'PUBLIC_STORAGE',
      reference: plan.videoKey,
      allowedPrefixes: ['videos'],
      source,
    },
    {
      kind: 'PUBLIC_STORAGE',
      reference: plan.thumbnailKey,
      allowedPrefixes: ['thumbnails'],
      source,
    },
    {
      kind: 'MODERATION_STORAGE',
      reference: plan.moderationObjectKey,
      allowedPrefixes: [],
      source,
    },
  ];
}

function originalCleanupJob(
  asset: any,
  storage: StorageService,
  source: string,
): CleanupJobData {
  return asset.bucket === storage.quarantineBucketName
    ? {
        kind: 'QUARANTINE_STORAGE',
        reference: asset.s3Key,
        allowedPrefixes: [],
        source,
      }
    : {
        kind: 'PUBLIC_STORAGE',
        reference: asset.s3Key,
        allowedPrefixes: ['videos', 'uploads'],
        source,
      };
}

async function deleteOriginalBestEffort(
  asset: any,
  storage: StorageService,
): Promise<void> {
  if (asset.bucket === storage.quarantineBucketName) {
    await storage.deleteIncoming(asset.s3Key).catch(() => {});
    return;
  }
  await storage
    .deleteManagedObject(asset.s3Key, ['videos', 'uploads'])
    .catch(() => false);
}

async function deletePlanBestEffort(
  deps: { storage: StorageService; safety: MediaSafetyService },
  plan: TranscodePlan,
): Promise<void> {
  await Promise.all([
    deps.storage.deleteManagedObject(plan.videoKey, ['videos']).catch(() => false),
    deps.storage
      .deleteManagedObject(plan.thumbnailKey, ['thumbnails'])
      .catch(() => false),
    deps.safety.cleanupVideoScanObject(plan.moderationObjectKey).catch(() => {}),
  ]);
}

async function ensureTranscodePlan(
  deps: { prisma: PrismaService },
  asset: any,
): Promise<TranscodePlan | null> {
  const existingToken = asset.finalizationToken;
  if (typeof existingToken === 'string' && existingToken) {
    const plan = transcodePlan(asset.id, existingToken);
    const safetyResult = asset.safetyResult as any;
    if (
      safetyResult?.transcodePlanId !== plan.token ||
      safetyResult?.transcodeOutputKey !== plan.videoKey ||
      safetyResult?.transcodeThumbnailKey !== plan.thumbnailKey ||
      safetyResult?.moderationObjectKey !== plan.moderationObjectKey
    ) {
      const repaired = await deps.prisma.mediaAsset.updateMany({
        where: {
          id: asset.id,
          uploadStatus: 'TRANSCODING',
          s3Key: asset.s3Key,
          finalizationToken: plan.token,
        },
        data: { safetyResult: planSafetyResult(asset, plan) as any },
      });
      if (repaired.count !== 1) return null;
    }
    return plan;
  }

  const plan = transcodePlan(asset.id, randomUUID());
  const claimed = await deps.prisma.mediaAsset.updateMany({
    where: {
      id: asset.id,
      uploadStatus: 'TRANSCODING',
      s3Key: asset.s3Key,
      finalizationToken: null,
    },
    data: {
      finalizationToken: plan.token,
      safetyResult: planSafetyResult(asset, plan) as any,
    },
  });
  if (claimed.count === 1) return plan;

  const current = await deps.prisma.mediaAsset.findUnique({
    where: { id: asset.id },
  });
  if (
    current?.uploadStatus !== 'TRANSCODING' ||
    current.s3Key !== asset.s3Key ||
    typeof current.finalizationToken !== 'string'
  ) {
    return null;
  }
  return transcodePlan(current.id, current.finalizationToken);
}

async function persistedTranscodeReplacement(
  storage: StorageService,
  asset: any,
  plan: TranscodePlan,
): Promise<PersistedTranscodeReplacement | null> {
  const result = asset.safetyResult as any;
  const hasPersistedOutput =
    result?.status === 'TRANSCODED' ||
    typeof result?.transcodeOutputSha256 === 'string';
  if (!hasPersistedOutput) return null;

  const fieldsAreValid =
    result?.transcodeOutputKey === plan.videoKey &&
    result?.transcodeThumbnailKey === plan.thumbnailKey &&
    Number.isSafeInteger(result?.transcodeOutputBytes) &&
    result.transcodeOutputBytes > 0 &&
    Number.isSafeInteger(result?.transcodeThumbnailBytes) &&
    result.transcodeThumbnailBytes > 0 &&
    /^[0-9a-f]{64}$/i.test(result?.transcodeOutputSha256 ?? '') &&
    /^[0-9a-f]{64}$/i.test(result?.transcodeThumbnailSha256 ?? '') &&
    Number.isSafeInteger(result?.durationSec) &&
    result.durationSec > 0 &&
    Number.isSafeInteger(result?.width) &&
    result.width > 0 &&
    Number.isSafeInteger(result?.height) &&
    result.height > 0;
  if (!fieldsAreValid) {
    throw new Error('Persisted transcode output metadata is incomplete');
  }

  const [videoMetadata, thumbnailMetadata, videoDigest, thumbnailDigest] =
    await Promise.all([
      storage.inspect(plan.videoKey),
      storage.inspect(plan.thumbnailKey),
      storage.sha256(plan.videoKey, VIDEO_SIZE_LIMIT),
      storage.sha256(plan.thumbnailKey, IMAGE_SIZE_LIMIT),
    ]);
  if (
    !videoMetadata ||
    videoMetadata.bytes !== result.transcodeOutputBytes ||
    videoMetadata.contentType !== 'video/mp4' ||
    !thumbnailMetadata ||
    thumbnailMetadata.bytes !== result.transcodeThumbnailBytes ||
    thumbnailMetadata.contentType !== 'image/jpeg' ||
    videoDigest.bytes !== result.transcodeOutputBytes ||
    videoDigest.sha256 !== result.transcodeOutputSha256 ||
    thumbnailDigest.bytes !== result.transcodeThumbnailBytes ||
    thumbnailDigest.sha256 !== result.transcodeThumbnailSha256
  ) {
    throw new Error(
      'Persisted transcode output changed after checksum binding',
    );
  }

  return {
    url: storage.publicUrl(plan.videoKey),
    thumbnailUrl: storage.publicUrl(plan.thumbnailKey),
    mimeType: 'video/mp4',
    durationSec: result.durationSec,
    width: result.width,
    height: result.height,
    s3Key: plan.videoKey,
    bucket: storage.bucketName,
    outputBytes: result.transcodeOutputBytes,
    thumbnailBytes: result.transcodeThumbnailBytes,
    outputSha256: result.transcodeOutputSha256,
    thumbnailSha256: result.transcodeThumbnailSha256,
  };
}

async function claimTranscodeAttempt(
  deps: { prisma: PrismaService },
  asset: any,
  currentPlan: TranscodePlan,
): Promise<{ asset: any; plan: TranscodePlan; attemptId: string } | null> {
  const previousSafety = asset.safetyResult as any;
  const startedAt = Date.parse(previousSafety?.transcodeAttemptStartedAt ?? '');
  const activeAndFresh =
    previousSafety?.status === 'TRANSCODING_ACTIVE' &&
    Number.isFinite(startedAt) &&
    Date.now() - startedAt < TRANSCODE_ATTEMPT_STALE_MS;
  if (activeAndFresh) return null;

  const rotatePlan = previousSafety?.status === 'TRANSCODING_ACTIVE';
  const plan = rotatePlan
    ? transcodePlan(asset.id, randomUUID())
    : currentPlan;
  const attemptId = plan.token;
  const attemptSafety = {
    ...planSafetyResult(asset, plan),
    status: 'TRANSCODING_ACTIVE',
    transcodeAttemptId: attemptId,
    transcodeAttemptStartedAt: new Date().toISOString(),
  };

  const claimed = await deps.prisma.$transaction(async (tx) => {
    const result = await tx.mediaAsset.updateMany({
      where: {
        id: asset.id,
        uploadStatus: 'TRANSCODING',
        s3Key: asset.s3Key,
        finalizationToken: currentPlan.token,
        updatedAt: asset.updatedAt,
      },
      data: {
        finalizationToken: plan.token,
        safetyResult: attemptSafety as any,
      },
    });
    if (result.count === 1 && rotatePlan) {
      await tx.objectCleanupJob.createMany({
        data: planCleanupJobs(currentPlan, 'video-transcode-stale-attempt'),
        skipDuplicates: true,
      });
    }
    return result;
  });
  if (claimed.count !== 1) return null;
  return {
    asset: { ...asset, finalizationToken: plan.token, safetyResult: attemptSafety },
    plan,
    attemptId,
  };
}

async function startPlannedVideoScan(
  deps: { storage: StorageService; safety: MediaSafetyService },
  plan: TranscodePlan,
  expected: Pick<
    PersistedTranscodeReplacement,
    'outputBytes' | 'outputSha256'
  >,
) {
  if (!deps.safety.isEnabled) {
    return deps.safety.startVideoScanFile('', plan.moderationObjectKey);
  }

  const localPath = path.join(
    os.tmpdir(),
    `${randomUUID()}-rekognition-stage.mp4`,
  );
  try {
    await deps.storage.downloadToFile(plan.videoKey, localPath);
    const localMetadata = await fs.promises.stat(localPath);
    const localDigest = createHash('sha256');
    const localStream = fs.createReadStream(localPath);
    try {
      for await (const chunk of localStream) localDigest.update(chunk);
    } finally {
      localStream.destroy();
    }
    if (
      localMetadata.size !== expected.outputBytes ||
      localDigest.digest('hex') !== expected.outputSha256
    ) {
      throw new Error('Video changed before Rekognition staging');
    }
    return await deps.safety.startVideoScanFile(
      localPath,
      plan.moderationObjectKey,
    );
  } finally {
    await fs.promises.unlink(localPath).catch(() => {});
  }
}

/**
 * Transcode a video asset in place, then hand off to the existing Rekognition
 * scan flow — shared between MediaService's fire-and-forget completeUpload
 * hook and the standalone backfill script, so both go through identical logic.
 */
export async function runVideoTranscodeJob(
  deps: {
    prisma: PrismaService;
    storage: StorageService;
    safety: MediaSafetyService;
    videoTranscode: VideoTranscodeService;
    logger: Logger;
  },
  mediaId: string,
): Promise<'completed' | 'skipped'> {
  const foundAsset = await deps.prisma.mediaAsset.findUnique({
    where: { id: mediaId },
  });
  if (
    !foundAsset ||
    foundAsset.uploadStatus !== 'TRANSCODING' ||
    !isVideo(foundAsset.mimeType)
  ) {
    return 'skipped';
  }
  let asset = foundAsset;

  const ensuredPlan = await ensureTranscodePlan(deps, asset);
  if (!ensuredPlan) return 'skipped';
  let plan: TranscodePlan = ensuredPlan;
  const plannedAsset = await deps.prisma.mediaAsset.findUnique({
    where: { id: mediaId },
  });
  if (
    !plannedAsset ||
    plannedAsset.uploadStatus !== 'TRANSCODING' ||
    plannedAsset.finalizationToken !== plan.token
  ) {
    return 'skipped';
  }
  asset = plannedAsset;

  try {
    const immutableSourceKey = (asset.safetyResult as any)?.immutableSourceKey;
    const immutableSha256 = (asset.safetyResult as any)?.immutableSha256;
    if (typeof immutableSourceKey === 'string') {
      if (
        !immutableSourceKey.startsWith(IMMUTABLE_MEDIA_PREFIX) ||
        asset.bucket !== deps.storage.quarantineBucketName ||
        asset.s3Key !== immutableSourceKey ||
        typeof immutableSha256 !== 'string'
      ) {
        throw new Error('Video immutable-source binding is invalid');
      }
      const sourceDigest = await deps.storage.sha256Incoming(
        immutableSourceKey,
        asset.size,
      );
      if (
        sourceDigest.bytes !== asset.size ||
        sourceDigest.sha256 !== immutableSha256
      ) {
        throw new Error('Video immutable source changed after snapshot binding');
      }
    }

    let replacement = await persistedTranscodeReplacement(
      deps.storage,
      asset,
      plan,
    );
    if (!replacement) {
      const attempt = await claimTranscodeAttempt(deps, asset, plan);
      if (!attempt) return 'skipped';
      asset = attempt.asset;
      plan = attempt.plan;
      replacement = await deps.videoTranscode.transcodeAndReplace(
        {
          s3Key: asset.s3Key,
          bucket: asset.bucket,
          mimeType: asset.mimeType,
        },
        { videoKey: plan.videoKey, thumbnailKey: plan.thumbnailKey },
      );
      const boundSafetyResult = {
        ...planSafetyResult(asset, plan),
        status: 'TRANSCODED',
        transcodeAttemptId: attempt.attemptId,
        transcodeOutputBytes: replacement.outputBytes,
        transcodeThumbnailBytes: replacement.thumbnailBytes,
        transcodeOutputSha256: replacement.outputSha256,
        transcodeThumbnailSha256: replacement.thumbnailSha256,
        durationSec: replacement.durationSec,
        width: replacement.width,
        height: replacement.height,
        transcodeCompletedAt: new Date().toISOString(),
      };
      const bound = await deps.prisma.mediaAsset.updateMany({
        where: {
          id: mediaId,
          uploadStatus: 'TRANSCODING',
          s3Key: asset.s3Key,
          finalizationToken: plan.token,
          safetyResult: {
            path: ['transcodeAttemptId'],
            equals: attempt.attemptId,
          },
        },
        data: { safetyResult: boundSafetyResult as any },
      });
      if (bound.count !== 1) {
        throw new Error('Video transcode attempt lost its checksum-binding claim');
      }
      asset = { ...asset, safetyResult: boundSafetyResult } as any;
    }

    const scanStart = await startPlannedVideoScan(deps, plan, replacement);
    const published = scanStart.status === 'BYPASSED';
    const rejected = scanStart.status === 'FAILED';
    const committed = await deps.prisma.$transaction(async (tx) => {
      const result = await tx.mediaAsset.updateMany({
        where: {
          id: mediaId,
          uploadStatus: 'TRANSCODING',
          s3Key: asset.s3Key,
          finalizationToken: plan.token,
        },
        data: {
        url: published ? replacement.url : null,
        thumbnailUrl: replacement.thumbnailUrl,
        mimeType: replacement.mimeType,
        durationSec: replacement.durationSec ?? undefined,
        width: replacement.width ?? undefined,
        height: replacement.height ?? undefined,
        s3Key: replacement.s3Key,
        bucket: replacement.bucket,
        finalizationToken: null,
        uploadStatus:
          scanStart.status === 'STARTED'
            ? 'SCANNING'
            : scanStart.status === 'BYPASSED'
              ? 'PUBLISHED'
              : 'REJECTED',
        moderationStatus:
          scanStart.status === 'FAILED'
            ? 'FLAGGED'
            : scanStart.status === 'BYPASSED'
              ? 'APPROVED'
              : 'PENDING',
        safetyJobId: scanStart.jobId ?? null,
        safetyResult:
          scanStart.status === 'STARTED'
            ? ({
                ...planSafetyResult(asset, plan),
                status: 'SCANNING',
                scanStartedAt: new Date().toISOString(),
                moderationObjectKey: plan.moderationObjectKey,
              } as any)
            : scanStart.status === 'FAILED'
              ? ({
                  ...planSafetyResult(asset, plan),
                  ...videoStartFailureData(
                    scanStart.failureReason,
                    scanStart.userMessage,
                  ),
                  moderationObjectKey: plan.moderationObjectKey,
                } as any)
              : ({
                  ...planSafetyResult(asset, plan),
                  status: 'BYPASSED',
                  completedAt: new Date().toISOString(),
                } as any),
        },
      });
      if (result.count === 1) {
        const cleanupJobs: CleanupJobData[] = [
          originalCleanupJob(
            asset,
            deps.storage,
            'video-transcode-replacement',
          ),
        ];
        if (rejected) {
          cleanupJobs.push(
            ...planCleanupJobs(plan, 'video-transcode-rejected'),
          );
        }
        await tx.objectCleanupJob.createMany({
          data: cleanupJobs,
          skipDuplicates: true,
        });
      }
      return result;
    });

    if (committed.count !== 1) {
      const current = await deps.prisma.mediaAsset.findUnique({
        where: { id: mediaId },
        select: { s3Key: true },
      });
      if (current?.s3Key === plan.videoKey) return 'completed';

      await deps.prisma.objectCleanupJob.createMany({
        data: planCleanupJobs(plan, 'video-transcode-lost-claim'),
        skipDuplicates: true,
      });
      await deletePlanBestEffort(deps, plan);
      return 'skipped';
    }

    await deleteOriginalBestEffort(asset, deps.storage);
    if (rejected) await deletePlanBestEffort(deps, plan);
    return 'completed';
  } catch (err: any) {
    deps.logger.error(`Transcode failed for asset ${mediaId}: ${err?.message}`);
    const currentAfterError = await deps.prisma.mediaAsset
      .findUnique({
        where: { id: mediaId },
        select: { s3Key: true },
      })
      .catch(() => null);
    if (currentAfterError?.s3Key === plan.videoKey) return 'completed';

    const rejectedOriginal = await deps.prisma
      .$transaction(async (tx) => {
        const result = await tx.mediaAsset.updateMany({
          where: {
            id: mediaId,
            uploadStatus: 'TRANSCODING',
            s3Key: asset.s3Key,
            finalizationToken: plan.token,
          },
          data: {
            uploadStatus: 'REJECTED',
            moderationStatus: 'FLAGGED',
            finalizationToken: null,
            safetyResult: {
              ...planSafetyResult(asset, plan),
              ...videoTranscodeFailureData(err?.message),
            } as any,
          },
        });
        if (result.count === 1) {
          await tx.objectCleanupJob.createMany({
            data: [
              originalCleanupJob(
                asset,
                deps.storage,
                'video-transcode-failure',
              ),
              ...planCleanupJobs(plan, 'video-transcode-failure'),
            ],
            skipDuplicates: true,
          });
        }
        return result;
      })
      .catch(() => null);

    if (rejectedOriginal?.count === 1) {
      await Promise.all([
        deleteOriginalBestEffort(asset, deps.storage),
        deletePlanBestEffort(deps, plan),
      ]);
    } else if (rejectedOriginal?.count === 0) {
      const current = await deps.prisma.mediaAsset
        .findUnique({
          where: { id: mediaId },
          select: { s3Key: true, uploadStatus: true, finalizationToken: true },
        })
        .catch(() => null);
      if (current?.s3Key === plan.videoKey) return 'completed';
      const samePlanStillActive =
        current?.uploadStatus === 'TRANSCODING' &&
        current.s3Key === asset.s3Key &&
        current.finalizationToken === plan.token;
      if (current && !samePlanStillActive) {
        await deps.prisma.objectCleanupJob
          .createMany({
            data: planCleanupJobs(plan, 'video-transcode-lost-claim'),
            skipDuplicates: true,
          })
          .catch(() => null);
        await deletePlanBestEffort(deps, plan);
      }
    }
    throw err;
  }
}

@Injectable()
export class MediaService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(MediaService.name);
  private mediaRecoveryTimer?: NodeJS.Timeout;
  private transcodeWorkerRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly safety: MediaSafetyService,
    private readonly videoTranscode: VideoTranscodeService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  onApplicationBootstrap() {
    void this.recoverStalledMediaWork();
    this.mediaRecoveryTimer = setInterval(
      () => void this.recoverStalledMediaWork(),
      MEDIA_RECOVERY_INTERVAL_MS,
    );
    this.mediaRecoveryTimer.unref();
  }

  onApplicationShutdown() {
    if (this.mediaRecoveryTimer) {
      clearInterval(this.mediaRecoveryTimer);
      this.mediaRecoveryTimer = undefined;
    }
  }

  private async recoverStalledMediaWork() {
    try {
      await this.recoverStaleFinalizations();
      await this.reclaimAbandonedPendingUploads();
      await this.retryFinalizationCleanup();
      await this.recoverRemovingMedia();
      await this.recoverRejectedCleanup();
      await this.recoverScanningMedia();
      this.kickVideoTranscodeWorker();
    } catch (error: any) {
      this.logger.error(
        `Could not recover media jobs: ${error?.message ?? 'unknown error'}`,
      );
    }
  }

  private async reclaimAbandonedPendingUploads() {
    const staleBefore = new Date(Date.now() - ABANDONED_PENDING_MS);
    const assets = await this.prisma.mediaAsset.findMany({
      where: {
        uploadStatus: 'PENDING',
        updatedAt: { lt: staleBefore },
      },
      orderBy: { updatedAt: 'asc' },
      take: 25,
    });

    for (const asset of assets) {
      const previousSafety = (asset.safetyResult as any) ?? {};
      const removalSafety = {
        ...previousSafety,
        status: 'ABANDONED_UPLOAD_REMOVING',
        cleanupPending: true,
        removalStartedAt: new Date().toISOString(),
      };
      const claimed = await this.prisma.$transaction(async (tx) => {
        const result = await tx.mediaAsset.updateMany({
          where: {
            id: asset.id,
            uploadStatus: 'PENDING',
            s3Key: asset.s3Key,
            updatedAt: asset.updatedAt,
          },
          data: {
            uploadStatus: 'REMOVING',
            url: null,
            safetyResult: removalSafety as any,
          },
        });
        if (result.count !== 1) return result;

        const jobs: CleanupJobData[] = [];
        const addQuarantine = (reference: unknown) => {
          if (isManagedQuarantineObjectKey(reference)) {
            jobs.push({
              kind: 'QUARANTINE_STORAGE',
              reference,
              allowedPrefixes: [],
              source: 'abandoned-pending-upload',
            });
          }
        };
        addQuarantine(asset.s3Key);
        addQuarantine(previousSafety.immutableSourceKey);
        if (typeof previousSafety.finalKey === 'string') {
          jobs.push({
            kind: 'PUBLIC_STORAGE',
            reference: previousSafety.finalKey,
            allowedPrefixes: ['images', 'videos', 'audio'],
            source: 'abandoned-pending-upload',
          });
        }
        if (jobs.length > 0) {
          await tx.objectCleanupJob.createMany({
            data: jobs,
            skipDuplicates: true,
          });
        }
        return result;
      });
      if (claimed.count !== 1) continue;

      try {
        await this.cleanupAssetObjects({
          ...asset,
          uploadStatus: 'REMOVING',
          safetyResult: removalSafety,
        });
        await this.prisma.mediaAsset.deleteMany({
          where: { id: asset.id, uploadStatus: 'REMOVING' },
        });
      } catch (error: any) {
        this.logger.warn(
          `Deferred abandoned upload cleanup ${asset.id}: ${error?.message ?? 'unknown error'}`,
        );
      }
    }
  }

  private async recoverStaleFinalizations() {
    const staleBefore = new Date(Date.now() - FINALIZING_STALE_MS);
    const assets = await this.prisma.mediaAsset.findMany({
      where: {
        uploadStatus: 'FINALIZING',
        updatedAt: { lt: staleBefore },
      },
      select: {
        id: true,
        s3Key: true,
        safetyResult: true,
        finalizationToken: true,
      },
      take: 25,
    });

    for (const asset of assets) {
      const previousSafety = asset.safetyResult as any;
      const finalKey = previousSafety?.finalKey;
      const immutableSourceKey = previousSafety?.immutableSourceKey;
      await this.prisma.$transaction(async (tx) => {
        const reset = await tx.mediaAsset.updateMany({
          where: {
            id: asset.id,
            uploadStatus: 'FINALIZING',
            s3Key: asset.s3Key,
            finalizationToken: asset.finalizationToken,
          },
          data: {
            uploadStatus: 'PENDING',
            finalizationToken: null,
            safetyResult: {
              status: 'FINALIZATION_RECOVERED',
              finalKey: typeof finalKey === 'string' ? finalKey : null,
              immutableSourceKey: isManagedQuarantineObjectKey(immutableSourceKey)
                ? immutableSourceKey
                : null,
              cleanupPending:
                typeof finalKey === 'string' ||
                isManagedQuarantineObjectKey(immutableSourceKey),
              recoveredAt: new Date().toISOString(),
            } as any,
          },
        });
        if (reset.count !== 1) return;

        const jobs: CleanupJobData[] = [];
        if (isManagedQuarantineObjectKey(immutableSourceKey)) {
          jobs.push({
            kind: 'QUARANTINE_STORAGE',
            reference: immutableSourceKey,
            allowedPrefixes: [],
            source: 'media-finalization-recovery',
          });
        }
        if (typeof finalKey === 'string') {
          jobs.push({
            kind: 'PUBLIC_STORAGE',
            reference: finalKey,
            allowedPrefixes: ['images', 'videos', 'audio'],
            source: 'media-finalization-recovery',
          });
        }
        if (jobs.length > 0) {
          await tx.objectCleanupJob.createMany({
            data: jobs,
            skipDuplicates: true,
          });
        }
      });
    }
  }

  private async retryFinalizationCleanup() {
    const pending = await this.prisma.mediaAsset.findMany({
      where: { uploadStatus: 'PENDING' },
      select: { id: true, s3Key: true, safetyResult: true },
      take: 50,
    });

    for (const asset of pending) {
      const result = asset.safetyResult as any;
      if (!result?.cleanupPending) continue;
      const cleanups: Promise<unknown>[] = [];
      if (typeof result.finalKey === 'string') {
        cleanups.push(
          this.storage.deleteManagedObject(result.finalKey, [
            'images',
            'videos',
            'audio',
          ]),
        );
      }
      if (isManagedQuarantineObjectKey(result.immutableSourceKey)) {
        cleanups.push(this.storage.deleteIncoming(result.immutableSourceKey));
      }
      const cleanupResults = await Promise.allSettled(cleanups);
      if (
        cleanupResults.some(
          (cleanup) =>
            cleanup.status === 'rejected' ||
            (cleanup.status === 'fulfilled' && cleanup.value === false),
        )
      ) {
        continue;
      }
      await this.prisma.mediaAsset.updateMany({
        where: { id: asset.id, uploadStatus: 'PENDING', s3Key: asset.s3Key },
        data: {
          safetyResult: {
            status: 'FINALIZATION_CLEANED',
            cleanedAt: new Date().toISOString(),
          } as any,
        },
      });
    }
  }

  private async recoverRemovingMedia() {
    const assets = await this.prisma.mediaAsset.findMany({
      where: { uploadStatus: 'REMOVING' },
      take: 25,
      orderBy: { updatedAt: 'asc' },
    });

    for (const asset of assets) {
      try {
        await this.cleanupAssetObjects(asset);
        await this.prisma.mediaAsset.deleteMany({
          where: { id: asset.id, uploadStatus: 'REMOVING' },
        });
      } catch (error: any) {
        this.logger.warn(
          `Could not finish media removal ${asset.id}: ${error?.message ?? 'unknown error'}`,
        );
      }
    }
  }

  private async recoverRejectedCleanup() {
    const assets = await this.prisma.mediaAsset.findMany({
      where: {
        uploadStatus: 'REJECTED',
        safetyResult: { path: ['cleanupPending'], equals: true },
      },
      take: 25,
      orderBy: { updatedAt: 'asc' },
    });

    for (const asset of assets) {
      try {
        await this.cleanupAssetObjects(asset);
        await this.prisma.mediaAsset.updateMany({
          where: {
            id: asset.id,
            uploadStatus: 'REJECTED',
            s3Key: asset.s3Key,
            updatedAt: asset.updatedAt,
          },
          data: {
            safetyResult: {
              ...((asset.safetyResult as object) ?? {}),
              cleanupPending: false,
              cleanedAt: new Date().toISOString(),
            } as any,
          },
        });
      } catch (error: any) {
        this.logger.warn(
          `Could not clean rejected media ${asset.id}: ${error?.message ?? 'unknown error'}`,
        );
      }
    }
  }

  private async recoverScanningMedia() {
    const assets = await this.prisma.mediaAsset.findMany({
      where: {
        uploadStatus: 'SCANNING',
        safetyJobId: { not: null },
      },
      take: 25,
      orderBy: { updatedAt: 'asc' },
    });

    for (const asset of assets) {
      await this.refreshVideoScanStatus(asset).catch((error: any) => {
        this.logger.warn(
          `Could not refresh media scan ${asset.id}: ${error?.message ?? 'unknown error'}`,
        );
      });
    }
  }

  private async cleanupAssetObjects(asset: any): Promise<void> {
    const operations: Promise<unknown>[] = [];
    if (this.storage.isEnabled && asset.s3Key) {
      if (asset.bucket === this.storage.quarantineBucketName) {
        operations.push(this.storage.deleteIncoming(asset.s3Key));
      } else if (asset.bucket === this.storage.bucketName) {
        operations.push(
          this.storage.deleteManagedObject(asset.s3Key).then((deleted) => {
            if (!deleted) throw new Error('Primary object is outside managed prefixes');
          }),
        );
        if (asset.thumbnailUrl) {
          operations.push(
            this.storage
              .deleteManagedObject(asset.thumbnailUrl, ['thumbnails'])
              .then((deleted) => {
                if (!deleted) throw new Error('Thumbnail is outside managed prefixes');
              }),
          );
        }
      }
    }

    const safetyResult = asset.safetyResult as any;
    if (this.storage.isEnabled) {
      for (const quarantineKey of [
        safetyResult?.originalSourceKey,
        safetyResult?.immutableSourceKey,
      ]) {
        if (
          isManagedQuarantineObjectKey(quarantineKey) &&
          quarantineKey !== asset.s3Key
        ) {
          operations.push(this.storage.deleteIncoming(quarantineKey));
        }
      }
    }
    if (this.storage.isEnabled) {
      const plannedObjects: Array<{
        reference: unknown;
        prefixes: Array<'images' | 'videos' | 'audio' | 'thumbnails'>;
        label: string;
      }> = [
        {
          reference: safetyResult?.finalKey,
          prefixes: ['images', 'videos', 'audio'],
          label: 'planned final object',
        },
        {
          reference: safetyResult?.transcodeOutputKey,
          prefixes: ['videos'],
          label: 'planned transcode output',
        },
        {
          reference: safetyResult?.transcodeThumbnailKey,
          prefixes: ['thumbnails'],
          label: 'planned transcode thumbnail',
        },
      ];
      for (const planned of plannedObjects) {
        if (
          typeof planned.reference !== 'string' ||
          planned.reference === asset.s3Key ||
          planned.reference === asset.thumbnailUrl
        ) {
          continue;
        }
        operations.push(
          this.storage
            .deleteManagedObject(planned.reference, planned.prefixes)
            .then((deleted) => {
              if (!deleted) {
                throw new Error(`${planned.label} is outside managed prefixes`);
              }
            }),
        );
      }
    }
    operations.push(
      this.safety.cleanupVideoScanObject(
        safetyResult?.moderationObjectKey as string | undefined,
      ),
    );

    const results = await Promise.allSettled(operations);
    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (failure) throw failure.reason;
  }

  private kickVideoTranscodeWorker() {
    if (this.transcodeWorkerRunning) return;
    this.transcodeWorkerRunning = true;
    void this.drainVideoTranscodeQueue().finally(() => {
      this.transcodeWorkerRunning = false;
    });
  }

  private async drainVideoTranscodeQueue() {
    const lockToken = randomUUID();
    let acquired = false;
    let leaseValid = true;
    let renewalTimer: NodeJS.Timeout | undefined;
    try {
      acquired =
        (await this.redis.set(
          TRANSCODE_WORKER_LOCK,
          lockToken,
          'PX',
          TRANSCODE_LOCK_TTL_MS,
          'NX',
        )) === 'OK';
      if (!acquired) return;

      renewalTimer = setInterval(() => {
        void this.redis
          .eval(
            'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("pexpire", KEYS[1], ARGV[2]) else return 0 end',
            1,
            TRANSCODE_WORKER_LOCK,
            lockToken,
            String(TRANSCODE_LOCK_TTL_MS),
          )
          .then((renewed) => {
            if (Number(renewed) !== 1) leaseValid = false;
          })
          .catch(() => {
            leaseValid = false;
          });
      }, TRANSCODE_LOCK_RENEW_MS);
      renewalTimer.unref();

      while (leaseValid) {
        const queued = await this.prisma.mediaAsset.findFirst({
          where: {
            uploadStatus: 'TRANSCODING',
            mimeType: { startsWith: 'video/' },
          },
          select: { id: true },
          orderBy: { updatedAt: 'asc' },
        });
        if (!queued) break;

        try {
          const outcome = await runVideoTranscodeJob(
            {
              prisma: this.prisma,
              storage: this.storage,
              safety: this.safety,
              videoTranscode: this.videoTranscode,
              logger: this.logger,
            },
            queued.id,
          );
          if (outcome === 'skipped') break;
        } catch (error: any) {
          this.logger.error(
            `Video transcode job failed for ${queued.id}: ${error?.message ?? 'unknown error'}`,
          );
          // Leave the persisted plan in place and let the bounded recovery
          // interval retry it. Continuing here would hot-loop the same oldest
          // row during a storage/database outage.
          break;
        }
      }
    } catch (error: any) {
      this.logger.error(
        `Video transcode worker failed: ${error?.message ?? 'unknown error'}`,
      );
    } finally {
      if (renewalTimer) clearInterval(renewalTimer);
      if (!acquired) return;
      await this.redis
        .eval(
          'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
          1,
          TRANSCODE_WORKER_LOCK,
          lockToken,
        )
        .catch(() => {});
    }
  }

  /**
   * Generate a presigned S3 PUT URL and create a PENDING MediaAsset row.
   * The client uploads directly to S3, then calls completeUpload.
   */
  async createUploadUrl(
    userId: string,
    mimeType: string,
    size: number,
  ): Promise<{ uploadUrl: string; mediaId: string; s3Key: string; expiresIn: number }> {
    if (!ALLOWED_MIME_TYPES.includes(mimeType as any)) {
      throw new BadRequestException(`Unsupported mime type: ${mimeType}`);
    }

    const sizeLimit = isVideo(mimeType)
      ? VIDEO_SIZE_LIMIT
      : isAudio(mimeType)
        ? AUDIO_SIZE_LIMIT
        : IMAGE_SIZE_LIMIT;
    if (size > sizeLimit) {
      throw new BadRequestException(
        `File size ${size} exceeds limit of ${sizeLimit} bytes for ${mimeType}`,
      );
    }

    if (!this.storage.isEnabled) {
      throw new BadRequestException('Media upload is not configured on this server');
    }

    const ext = extFromMime(mimeType);
    const s3Key = `${CLIENT_UPLOAD_PREFIX}${userId}/${randomUUID()}${ext}`;
    const bucket = this.storage.quarantineBucketName;

    const uploadUrl = await this.storage.presignUpload(
      s3Key,
      mimeType,
      size,
      PRESIGN_TTL_SECONDS,
    );

    const asset = await this.prisma.mediaAsset.create({
      data: {
        userId,
        s3Key,
        bucket,
        mimeType,
        size,
        uploadStatus: 'PENDING',
      },
    });

    return { uploadUrl, mediaId: asset.id, s3Key, expiresIn: PRESIGN_TTL_SECONDS };
  }

  /**
   * Confirm an upload: verify the object exists in S3, run safety scan,
   * and update the MediaAsset status to PUBLISHED, SCANNING, or REJECTED.
   */
  async completeUpload(
    userId: string,
    mediaId: string,
  ): Promise<{ id: string; uploadStatus: string; url: string | null; message?: string }> {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id: mediaId } });
    if (!asset) throw new NotFoundException('MediaAsset not found');
    if (asset.userId !== userId) throw new ForbiddenException('Not your upload');
    if (asset.uploadStatus !== 'PENDING') {
      throw new BadRequestException('Upload already completed or processing');
    }

    const sourceKey = asset.s3Key;
    const finalKey = finalObjectKey(userId, asset.mimeType);
    const finalizationToken = randomUUID();
    const safeMediaId = mediaId.replace(/[^A-Za-z0-9_-]/g, '_');
    const immutableSourceKey =
      `${IMMUTABLE_MEDIA_PREFIX}${safeMediaId}/${finalizationToken}` +
      extFromMime(asset.mimeType);
    const claimed = await this.prisma.mediaAsset.updateMany({
      where: { id: mediaId, userId, uploadStatus: 'PENDING', s3Key: sourceKey },
      data: {
        uploadStatus: 'FINALIZING',
        finalizationToken,
        safetyResult: {
          status: 'FINALIZING',
          finalKey,
          originalSourceKey: sourceKey,
          immutableSourceKey,
          startedAt: new Date().toISOString(),
        } as any,
      },
    });
    if (claimed.count !== 1) {
      throw new BadRequestException('Upload already completed or processing');
    }

    let promoted = false;
    let committed = false;
    try {
      const uploaded = await this.storage.inspectIncoming(sourceKey);
      if (!uploaded) {
        throw new BadRequestException(
          'File not found in storage - complete the upload first',
        );
      }
      if (uploaded.bytes !== asset.size) {
        throw new BadRequestException(
          `Uploaded file size does not match the declared ${asset.size} bytes`,
        );
      }
      if (uploaded.contentType !== asset.mimeType.toLowerCase()) {
        throw new BadRequestException(
          'Uploaded file type does not match the requested content type',
        );
      }

      await this.storage.snapshotIncoming(sourceKey, immutableSourceKey);
      const immutableMetadata = await this.storage.inspectIncoming(
        immutableSourceKey,
      );
      if (
        !immutableMetadata ||
        immutableMetadata.bytes !== asset.size ||
        immutableMetadata.contentType !== asset.mimeType.toLowerCase()
      ) {
        throw new BadRequestException(
          'The private upload snapshot failed its storage integrity check',
        );
      }
      const immutableDigest = await this.storage.sha256Incoming(
        immutableSourceKey,
        asset.size,
      );
      if (immutableDigest.bytes !== asset.size) {
        throw new BadRequestException(
          'The private upload snapshot changed during verification',
        );
      }

      if (isVideo(asset.mimeType)) {
        const queued = await this.prisma.$transaction(async (tx) => {
          const result = await tx.mediaAsset.updateMany({
            where: {
              id: mediaId,
              userId,
              uploadStatus: 'FINALIZING',
              s3Key: sourceKey,
              finalizationToken,
            },
            data: {
              s3Key: immutableSourceKey,
              url: null,
              uploadStatus: 'TRANSCODING',
              moderationStatus: 'PENDING',
              safetyResult: {
                status: 'TRANSCODE_QUEUED',
                originalSourceKey: sourceKey,
                immutableSourceKey,
                immutableSha256: immutableDigest.sha256,
                immutableBytes: immutableDigest.bytes,
              } as any,
            },
          });
          if (result.count === 1) {
            await tx.objectCleanupJob.createMany({
              data: [
                {
                  kind: 'QUARANTINE_STORAGE',
                  reference: sourceKey,
                  allowedPrefixes: [],
                  source: 'media-immutable-snapshot',
                },
              ],
              skipDuplicates: true,
            });
          }
          return result;
        });
        if (queued.count !== 1) {
          throw new Error('Upload finalization lost its database claim');
        }
        committed = true;
        await this.storage.deleteIncoming(sourceKey).catch(() => {});
        this.kickVideoTranscodeWorker();
        return { id: mediaId, uploadStatus: 'TRANSCODING', url: null };
      }

      let imageScanResult: Awaited<
        ReturnType<MediaSafetyService['scanImage']>
      > | null = null;
      if (!isAudio(asset.mimeType)) {
        const privateImage = await this.storage.downloadIncoming(
          immutableSourceKey,
        );
        const scannedDigest = createHash('sha256')
          .update(privateImage)
          .digest('hex');
        if (
          privateImage.length !== immutableDigest.bytes ||
          scannedDigest !== immutableDigest.sha256
        ) {
          throw new BadRequestException(
            'The private image snapshot changed before safety review',
          );
        }
        imageScanResult = await this.safety.scanImage(privateImage);
        if (!imageScanResult.safe) {
          const rejected = await this.prisma.$transaction(async (tx) => {
            const result = await tx.mediaAsset.updateMany({
              where: {
                id: mediaId,
                userId,
                uploadStatus: 'FINALIZING',
                s3Key: sourceKey,
                finalizationToken,
              },
              data: {
                url: null,
                uploadStatus: 'REJECTED',
                moderationStatus: 'FLAGGED',
                finalizationToken: null,
                safetyResult: {
                  ...(imageScanResult as any),
                  originalSourceKey: sourceKey,
                  immutableSourceKey,
                  immutableSha256: immutableDigest.sha256,
                  cleanupPending: true,
                } as any,
              },
            });
            if (result.count === 1) {
              await tx.objectCleanupJob.createMany({
                data: [sourceKey, immutableSourceKey].map((reference) => ({
                  kind: 'QUARANTINE_STORAGE' as const,
                  reference,
                  allowedPrefixes: [],
                  source: 'media-unsafe-snapshot',
                })),
                skipDuplicates: true,
              });
            }
            return result;
          });
          if (rejected.count !== 1) {
            throw new Error('Upload finalization lost its database claim');
          }
          committed = true;
          await Promise.all([
            this.storage.deleteIncoming(sourceKey).catch(() => {}),
            this.storage.deleteIncoming(immutableSourceKey).catch(() => {}),
          ]);
          return { id: mediaId, uploadStatus: 'REJECTED', url: null };
        }
      }

      await this.storage.promoteIncoming(immutableSourceKey, finalKey);
      promoted = true;
      const promotedMetadata = await this.storage.inspect(finalKey);
      if (
        !promotedMetadata ||
        promotedMetadata.bytes !== asset.size ||
        promotedMetadata.contentType !== asset.mimeType.toLowerCase()
      ) {
        throw new BadRequestException(
          'The promoted upload failed its storage integrity check',
        );
      }
      const promotedDigest = await this.storage.sha256(finalKey, asset.size);
      if (
        promotedDigest.bytes !== immutableDigest.bytes ||
        promotedDigest.sha256 !== immutableDigest.sha256
      ) {
        throw new BadRequestException(
          'The promoted upload does not match its reviewed private snapshot',
        );
      }

      const publicUrl = this.storage.publicUrl(finalKey);
      const safetyResult = {
        ...(imageScanResult ?? ({ status: 'BYPASSED' } as any)),
        immutableSha256: immutableDigest.sha256,
      };

      const finalized = await this.prisma.$transaction(async (tx) => {
        const result = await tx.mediaAsset.updateMany({
          where: {
            id: mediaId,
            userId,
            uploadStatus: 'FINALIZING',
            s3Key: sourceKey,
            finalizationToken,
          },
          data: {
            s3Key: finalKey,
            bucket: this.storage.bucketName,
            url: publicUrl,
            uploadStatus: 'PUBLISHED',
            moderationStatus: 'APPROVED',
            finalizationToken: null,
            safetyResult,
          },
        });
        if (result.count === 1) {
          await tx.objectCleanupJob.createMany({
            data: [sourceKey, immutableSourceKey].map((reference) => ({
                kind: 'QUARANTINE_STORAGE',
                reference,
                allowedPrefixes: [],
                source: 'media-finalization',
              })),
            skipDuplicates: true,
          });
        }
        return result;
      });
      if (finalized.count !== 1) {
        throw new Error('Upload finalization lost its database claim');
      }
      committed = true;

      await Promise.all(
        [sourceKey, immutableSourceKey].map((key) =>
          this.storage.deleteIncoming(key).catch((error: any) => {
            this.logger.warn(
              `Could not delete finalized quarantine object ${key}: ${error?.message ?? 'unknown error'}`,
            );
          }),
        ),
      );
      return { id: mediaId, uploadStatus: 'PUBLISHED', url: publicUrl };
    } catch (error) {
      if (!committed) {
        const reset = await this.prisma
          .$transaction(async (tx) => {
            const result = await tx.mediaAsset.updateMany({
              where: {
                id: mediaId,
                userId,
                uploadStatus: 'FINALIZING',
                s3Key: sourceKey,
                finalizationToken,
              },
              data: {
                uploadStatus: 'PENDING',
                finalizationToken: null,
                safetyResult: {
                  status: 'FINALIZATION_FAILED',
                  originalSourceKey: sourceKey,
                  immutableSourceKey,
                  finalKey: promoted ? finalKey : null,
                  cleanupPending: true,
                  failedAt: new Date().toISOString(),
                } as any,
              },
            });
            if (result.count === 1) {
              const jobs: CleanupJobData[] = [
                {
                  kind: 'QUARANTINE_STORAGE',
                  reference: immutableSourceKey,
                  allowedPrefixes: [],
                  source: 'media-finalization-failure',
                },
              ];
              if (promoted) {
                jobs.push({
                  kind: 'PUBLIC_STORAGE',
                  reference: finalKey,
                  allowedPrefixes: ['images', 'videos', 'audio'],
                  source: 'media-finalization-failure',
                });
              }
              await tx.objectCleanupJob.createMany({
                data: jobs,
                skipDuplicates: true,
              });
            }
            return result;
          })
          .catch(() => null);
        if (reset?.count === 1) {
          await this.storage.deleteIncoming(immutableSourceKey).catch(() => {});
          if (promoted) {
            await this.storage.deleteManagedObject(finalKey).catch(() => false);
          }
        } else {
          const current = await this.prisma.mediaAsset
            .findUnique({
              where: { id: mediaId },
              select: { s3Key: true, uploadStatus: true },
            })
            .catch(() => null);
          const immutableIsLive =
            current?.s3Key === immutableSourceKey &&
            current.uploadStatus === 'TRANSCODING';
          const finalIsLive = current?.s3Key === finalKey;
          const jobs: CleanupJobData[] = [];
          if (!immutableIsLive) {
            jobs.push({
              kind: 'QUARANTINE_STORAGE',
              reference: immutableSourceKey,
              allowedPrefixes: [],
              source: 'media-finalization-race',
            });
          }
          if (promoted && !finalIsLive) {
            jobs.push({
              kind: 'PUBLIC_STORAGE',
              reference: finalKey,
              allowedPrefixes: ['images', 'videos', 'audio'],
              source: 'media-finalization-race',
            });
          }
          if (jobs.length > 0) {
            await this.prisma.objectCleanupJob
              .createMany({
                data: jobs,
                skipDuplicates: true,
              })
              .catch(() => null);
          }
          if (!immutableIsLive) {
            await this.storage.deleteIncoming(immutableSourceKey).catch(() => {});
          }
          if (promoted && !finalIsLive) {
            await this.storage.deleteManagedObject(finalKey).catch(() => false);
          }
        }
      }
      throw error;
    }
  }

  /**
   * Get the current status of a media asset.
   * Only the owner can query their own uploads.
   */
  async getStatus(
    userId: string,
    mediaId: string,
  ): Promise<{ id: string; uploadStatus: string; url: string | null; mimeType: string; size: number; moderationStatus?: string; message?: string }> {
    let asset: any = await this.prisma.mediaAsset.findUnique({ where: { id: mediaId } });
    if (!asset) throw new NotFoundException('MediaAsset not found');
    if (asset.userId !== userId) throw new ForbiddenException('Not your upload');

    if (asset.uploadStatus === 'TRANSCODING') {
      this.kickVideoTranscodeWorker();
    }

    if (asset.uploadStatus === 'SCANNING' && asset.safetyJobId) {
      asset = await this.refreshVideoScanStatus(asset);
    }

    return {
      id: asset.id,
      uploadStatus: asset.uploadStatus,
      url: asset.url,
      mimeType: asset.mimeType,
      size: asset.size,
      moderationStatus: asset.moderationStatus,
      message: (asset.safetyResult as any)?.userMessage,
    };
  }

  async removeUpload(userId: string, mediaId: string) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id: mediaId } });
    if (!asset) throw new NotFoundException('MediaAsset not found');
    if (asset.userId !== userId) throw new ForbiddenException('Not your upload');
    if (asset.postId) throw new BadRequestException('Media asset is already attached to a post');
    if (asset.storyId) throw new BadRequestException('Media asset is already attached to a story');

    if (
      asset.uploadStatus === 'FINALIZING' ||
      asset.uploadStatus === 'TRANSCODING' ||
      asset.uploadStatus === 'SCANNING' ||
      asset.uploadStatus === 'REMOVING'
    ) {
      throw new BadRequestException(
        'Media is still processing; check its status and retry removal',
      );
    }

    const claimed = await this.prisma.mediaAsset.updateMany({
      where: {
        id: mediaId,
        userId,
        postId: null,
        storyId: null,
        uploadStatus: { in: ['PENDING', 'PUBLISHED', 'REJECTED'] },
      },
      data: {
        uploadStatus: 'REMOVING',
        url: null,
        safetyResult: {
          ...((asset.safetyResult as object) ?? {}),
          status: 'REMOVING',
          removalStartedAt: new Date().toISOString(),
        } as any,
      },
    });
    if (claimed.count !== 1) {
      throw new BadRequestException(
        'Media changed or was attached while removal started; retry',
      );
    }

    await this.cleanupAssetObjects(asset);
    await this.prisma.mediaAsset.deleteMany({
      where: { id: mediaId, userId, uploadStatus: 'REMOVING' },
    });

    return { success: true, id: mediaId };
  }

  private async commitVideoScanTerminal(
    asset: any,
    data: Record<string, unknown>,
    moderationObjectKey: string | undefined,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.mediaAsset.updateMany({
        where: {
          id: asset.id,
          uploadStatus: 'SCANNING',
          safetyJobId: asset.safetyJobId,
          s3Key: asset.s3Key,
        },
        data: data as any,
      });
      if (result.count === 1 && moderationObjectKey) {
        await tx.objectCleanupJob.createMany({
          data: [
            {
              kind: 'MODERATION_STORAGE',
              reference: moderationObjectKey,
              allowedPrefixes: [],
              source: 'video-moderation-terminal',
            },
          ],
          skipDuplicates: true,
        });
      }
      return result;
    });
  }

  private async refreshVideoScanStatus(asset: any) {
    const poll = await this.safety.pollVideoScan(asset.safetyJobId!);
    const moderationObjectKey = (asset.safetyResult as any)
      ?.moderationObjectKey as string | undefined;

    if (poll.status === 'IN_PROGRESS') {
      const startedAt = new Date((asset.safetyResult as any)?.scanStartedAt ?? asset.updatedAt ?? asset.createdAt).getTime();
      if (Date.now() - startedAt <= VIDEO_SCAN_TIMEOUT_MS) {
        return asset;
      }

      const timedOut = await this.commitVideoScanTerminal(
        asset,
        {
          url: null,
          uploadStatus: 'REJECTED',
          moderationStatus: 'FLAGGED',
          safetyResult: {
            ...((asset.safetyResult as object) ?? {}),
            ...videoTimeoutData(),
            timedOutAt: new Date().toISOString(),
          } as any,
        },
        moderationObjectKey,
      );
      if (timedOut.count === 1) {
        await Promise.all([
          this.storage.deleteManagedObject(asset.s3Key).catch(() => false),
          this.storage.deleteManagedObject(asset.thumbnailUrl).catch(() => false),
          this.safety.cleanupVideoScanObject(moderationObjectKey).catch(() => {}),
        ]);
      }
      return (
        (await this.prisma.mediaAsset.findUnique({ where: { id: asset.id } })) ??
        asset
      );
    }

    if (poll.status === 'FAILED') {
      const failed = await this.commitVideoScanTerminal(
        asset,
        {
          url: null,
          uploadStatus: 'REJECTED',
          moderationStatus: 'FLAGGED',
          safetyResult: {
            ...((asset.safetyResult as object) ?? {}),
            status: 'FAILED',
            failureReason: poll.failureReason ?? null,
            userMessage: poll.userMessage,
            cleanupPending: true,
            failedAt: new Date().toISOString(),
          } as any,
        },
        moderationObjectKey,
      );
      if (failed.count === 1) {
        await Promise.all([
          this.storage.deleteManagedObject(asset.s3Key).catch(() => false),
          this.storage.deleteManagedObject(asset.thumbnailUrl).catch(() => false),
          this.safety.cleanupVideoScanObject(moderationObjectKey).catch(() => {}),
        ]);
      }
      return (
        (await this.prisma.mediaAsset.findUnique({ where: { id: asset.id } })) ??
        asset
      );
    }

    const scanResult = poll.result!;
    const mediaStatus = this.safety.statusFromScan(scanResult);
    const approved = mediaStatus === 'PUBLISHED';
    const updated = await this.commitVideoScanTerminal(
      asset,
      {
        url: approved ? this.storage.publicUrl(asset.s3Key) : null,
        uploadStatus: approved ? 'PUBLISHED' : 'REJECTED',
        moderationStatus: approved ? 'APPROVED' : 'FLAGGED',
        safetyResult: {
          ...(scanResult as any),
          status: 'SUCCEEDED',
          cleanupPending: !approved,
          reviewedAt: new Date().toISOString(),
        } as any,
      },
      moderationObjectKey,
    );
    if (updated.count === 1) {
      await this.safety
        .cleanupVideoScanObject(moderationObjectKey)
        .catch(() => {});
      if (!approved) {
        await Promise.all([
          this.storage.deleteManagedObject(asset.s3Key).catch(() => false),
          this.storage.deleteManagedObject(asset.thumbnailUrl).catch(() => false),
        ]);
      }
    }
    return (
      (await this.prisma.mediaAsset.findUnique({ where: { id: asset.id } })) ??
      asset
    );
  }
}
