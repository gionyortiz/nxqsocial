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
  ): Promise<{ id: string; uploadStatus: string; url: string | null }> {
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
      const jobId = await this.safety.startVideoScan(asset.bucket, asset.s3Key);
      const updated = await this.prisma.mediaAsset.update({
        where: { id: mediaId },
        data: {
          url: publicUrl,
          uploadStatus: jobId ? 'SCANNING' : 'PUBLISHED', // fallback: no scanner → publish directly
          safetyJobId: jobId ?? undefined,
        },
      });
      return { id: updated.id, uploadStatus: updated.uploadStatus, url: updated.url };
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
  ): Promise<{ id: string; uploadStatus: string; url: string | null; mimeType: string; size: number }> {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id: mediaId } });
    if (!asset) throw new NotFoundException('MediaAsset not found');
    if (asset.userId !== userId) throw new ForbiddenException('Not your upload');

    return {
      id: asset.id,
      uploadStatus: asset.uploadStatus,
      url: asset.url,
      mimeType: asset.mimeType,
      size: asset.size,
    };
  }
}
