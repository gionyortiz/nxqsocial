import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../common/storage/storage.service';
import { MediaSafetyService } from '../safety/media-safety.service';
import {
  ALLOWED_MIME_TYPES,
  IMAGE_SIZE_LIMIT,
  VIDEO_SIZE_LIMIT,
} from './media.dto';

const PRESIGN_TTL_SECONDS = 600; // 10 minutes
const VIDEO_SCAN_TIMEOUT_MS = 5 * 60 * 1000;

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
  };
  return map[mime] ?? '';
}

function isVideo(mime: string): boolean {
  return mime.startsWith('video/');
}

function videoStartFailureData(reason?: string, userMessage?: string) {
  return {
    status: 'FAILED_TO_START',
    failureReason: reason ?? null,
    userMessage: userMessage ?? 'Video processing failed. Please try again.',
  };
}

function videoTimeoutData() {
  return {
    status: 'PROCESSING_TIMEOUT',
    reviewReason: 'Video processing failed or timed out',
    userMessage: 'Video uploaded. Safety review is still processing. You can leave this page and check again later.',
  };
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly safety: MediaSafetyService,
  ) {}

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

    const sizeLimit = isVideo(mimeType) ? VIDEO_SIZE_LIMIT : IMAGE_SIZE_LIMIT;
    if (size > sizeLimit) {
      throw new BadRequestException(
        `File size ${size} exceeds limit of ${sizeLimit} bytes for ${mimeType}`,
      );
    }

    if (!this.storage.isEnabled) {
      throw new BadRequestException('Media upload is not configured on this server');
    }

    const ext = extFromMime(mimeType);
    const s3Key = `uploads/${userId}/${randomUUID()}${ext}`;
    const bucket = process.env.S3_BUCKET_NAME ?? process.env.S3_BUCKET ?? '';

    const uploadUrl = await this.storage.presignUpload(s3Key, mimeType, PRESIGN_TTL_SECONDS);

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

    // Verify the object actually landed in S3
    const exists = await this.storage.exists(asset.s3Key);
    if (!exists) {
      throw new BadRequestException('File not found in storage — complete the S3 PUT first');
    }

    const publicUrl = this.storage.publicUrl(asset.s3Key);

    if (isVideo(asset.mimeType)) {
      // Async video scan via Rekognition StartContentModeration
      const scanStart = await this.safety.startVideoScanJob(asset.bucket, asset.s3Key);
      const updated = await this.prisma.mediaAsset.update({
        where: { id: mediaId },
        data: {
          url: publicUrl,
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
          safetyJobId: scanStart.jobId ?? undefined,
          safetyResult:
            scanStart.status === 'STARTED'
              ? ({ status: 'SCANNING', scanStartedAt: new Date().toISOString() } as any)
              : scanStart.status === 'FAILED'
                ? (videoStartFailureData(scanStart.failureReason, scanStart.userMessage) as any)
                : ({ status: 'BYPASSED' } as any),
        },
      });
      return {
        id: updated.id,
        uploadStatus: updated.uploadStatus,
        url: updated.url,
        ...(scanStart.status === 'FAILED' ? { message: scanStart.userMessage } : {}),
      };
    }

    // Sync image scan — download from S3 to scan
    // We can't use a presigned GET here without a separate presignDownload helper,
    // so we delegate to the safety service with the S3 key and bucket.
    // MediaSafetyService.scanImage() needs a Buffer; for now we use the key hint.
    // In production, Rekognition can scan S3 objects directly — use that path.
    const scanResult = await this.safety.scanImageFromS3(asset.bucket, asset.s3Key);
    const safe = scanResult.safe;

    const updated = await this.prisma.mediaAsset.update({
      where: { id: mediaId },
      data: {
        url: safe ? publicUrl : null,
        uploadStatus: safe ? 'PUBLISHED' : 'REJECTED',
        moderationStatus: safe ? 'APPROVED' : 'FLAGGED',
        safetyResult: scanResult as any,
      },
    });

    return { id: updated.id, uploadStatus: updated.uploadStatus, url: updated.url };
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

    await this.prisma.mediaAsset.delete({ where: { id: mediaId } });

    if (this.storage.isEnabled && asset.s3Key) {
      this.storage.delete(asset.s3Key).catch(() => {});
    }

    return { success: true, id: mediaId };
  }

  private async refreshVideoScanStatus(asset: any) {
    const poll = await this.safety.pollVideoScan(asset.safetyJobId!);

    if (poll.status === 'IN_PROGRESS') {
      const startedAt = new Date((asset.safetyResult as any)?.scanStartedAt ?? asset.updatedAt ?? asset.createdAt).getTime();
      if (Date.now() - startedAt <= VIDEO_SCAN_TIMEOUT_MS) {
        return asset;
      }

      return this.prisma.mediaAsset.update({
        where: { id: asset.id },
        data: {
          uploadStatus: 'PUBLISHED',
          moderationStatus: 'FLAGGED',
          safetyResult: {
            ...((asset.safetyResult as object) ?? {}),
            ...videoTimeoutData(),
            timedOutAt: new Date().toISOString(),
          } as any,
        },
      });
    }

    if (poll.status === 'FAILED') {
      return this.prisma.mediaAsset.update({
        where: { id: asset.id },
        data: {
          uploadStatus: 'REJECTED',
          moderationStatus: 'FLAGGED',
          safetyResult: {
            ...((asset.safetyResult as object) ?? {}),
            status: 'FAILED',
            failureReason: poll.failureReason ?? null,
            userMessage: poll.userMessage,
            failedAt: new Date().toISOString(),
          } as any,
        },
      });
    }

    const scanResult = poll.result!;
    const mediaStatus = this.safety.statusFromScan(scanResult);
    return this.prisma.mediaAsset.update({
      where: { id: asset.id },
      data: {
        uploadStatus: mediaStatus === 'REJECTED' ? 'REJECTED' : 'PUBLISHED',
        moderationStatus:
          mediaStatus === 'PUBLISHED'
            ? 'APPROVED'
            : mediaStatus === 'REJECTED'
              ? 'REJECTED'
              : 'FLAGGED',
        safetyResult: {
          ...(scanResult as any),
          status: 'SUCCEEDED',
          reviewedAt: new Date().toISOString(),
        } as any,
      },
    });
  }
}
