import { Injectable, Logger } from '@nestjs/common';
import {
  RekognitionClient,
  DetectModerationLabelsCommand,
  StartContentModerationCommand,
  GetContentModerationCommand,
  ModerationLabel,
} from '@aws-sdk/client-rekognition';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import type { Readable } from 'stream';

export interface MediaScanResult {
  safe: boolean;
  labels: Array<{ name: string; confidence: number; parentName?: string }>;
  topCategory?: string;
  maxConfidence: number;
  provider: 'rekognition' | 'staging-mock' | 'none';
}

export interface VideoScanStartResult {
  status: 'STARTED' | 'BYPASSED' | 'FAILED';
  jobId: string | null;
  failureReason?: string;
  userMessage?: string;
  moderationObjectKey?: string;
}

export interface VideoScanPollResult {
  status: 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED';
  result?: MediaScanResult;
  failureReason?: string;
  userMessage?: string;
}

/**
 * Thresholds — labels above BLOCK_THRESHOLD trigger UNDER_REVIEW.
 * Labels above HARD_BLOCK_THRESHOLD trigger immediate rejection.
 */
const BLOCK_THRESHOLD = 60;
const HARD_BLOCK_THRESHOLD = 90;

/**
 * Categories that are always hard-blocked regardless of confidence.
 */
const ALWAYS_BLOCK = new Set([
  'Explicit Nudity',
  'Graphic Male Nudity',
  'Graphic Female Nudity',
  'Sexual Activity',
  'Illustrated Explicit Nudity',
  'Adult Cartoons',
  'Graphic Violence or Gore',
]);

@Injectable()
export class MediaSafetyService {
  private readonly logger = new Logger(MediaSafetyService.name);
  private readonly client: RekognitionClient | null;
  private readonly enabled: boolean;
  private readonly moderationStorage: S3Client | null;
  private readonly moderationBucket: string;
  private readonly provider: 'rekognition' | 'staging-mock';

  constructor() {
    const configuredProvider =
      process.env.MEDIA_MODERATION_PROVIDER?.trim() || 'rekognition';
    const stagingMock = configuredProvider === 'staging-mock';
    if (
      stagingMock &&
      (process.env.NXQ_RELEASE_TARGET !== 'staging' ||
        process.env.RAILWAY_ENVIRONMENT_NAME !== 'staging')
    ) {
      throw new Error(
        'The staging moderation mock is allowed only in the staging release target.',
      );
    }
    if (configuredProvider !== 'rekognition' && !stagingMock) {
      throw new Error('Unsupported media moderation provider.');
    }
    this.provider = stagingMock ? 'staging-mock' : 'rekognition';

    // These credentials are intentionally independent from R2 media storage.
    // Rekognition video moderation can read only from an AWS S3 bucket.
    const rekognitionRegion = process.env.REKOGNITION_REGION?.trim();
    const rekognitionKeyId = process.env.REKOGNITION_ACCESS_KEY_ID?.trim();
    const rekognitionSecret = process.env.REKOGNITION_SECRET_ACCESS_KEY?.trim();
    this.moderationBucket = process.env.REKOGNITION_S3_BUCKET?.trim() ?? '';

    this.enabled =
      stagingMock ||
      !!(
        rekognitionKeyId &&
        rekognitionSecret &&
        this.moderationBucket &&
        !rekognitionKeyId.startsWith('REPLACE') &&
        rekognitionRegion &&
        rekognitionRegion !== 'auto'
      );

    if (stagingMock) {
      this.client = null;
      this.moderationStorage = null;
      this.logger.warn(
        'MediaSafetyService: staging mock enabled for synthetic test data only',
      );
    } else if (this.enabled) {
      this.client = new RekognitionClient({
        region: rekognitionRegion,
        credentials: {
          accessKeyId: rekognitionKeyId!,
          secretAccessKey: rekognitionSecret!,
        },
      });
      this.moderationStorage = new S3Client({
        region: rekognitionRegion,
        credentials: {
          accessKeyId: rekognitionKeyId!,
          secretAccessKey: rekognitionSecret!,
        },
      });
      this.logger.log(
        `MediaSafetyService: Rekognition enabled (region=${rekognitionRegion})`,
      );
    } else {
      this.client = null;
      this.moderationStorage = null;
      const production =
        process.env.NODE_ENV === 'production' ||
        Boolean(
          process.env.RAILWAY_ENVIRONMENT_ID || process.env.RAILWAY_PROJECT_ID,
        );
      if (production) {
        throw new Error(
          'Media moderation is required in production. Configure REKOGNITION_REGION, REKOGNITION_ACCESS_KEY_ID, REKOGNITION_SECRET_ACCESS_KEY, and REKOGNITION_S3_BUCKET.',
        );
      }
      this.logger.warn(
        'MediaSafetyService: Rekognition not configured - development scanning bypassed',
      );
    }
  }

  get isEnabled() {
    return this.enabled;
  }

  /**
   * Scan an image buffer for moderation labels.
   * Returns a safe result if Rekognition is not configured.
   */
  async scanImage(buffer: Buffer): Promise<MediaScanResult> {
    if (this.provider === 'staging-mock') {
      return {
        safe: true,
        labels: [],
        maxConfidence: 0,
        provider: 'staging-mock',
      };
    }
    if (!this.enabled || !this.client) {
      return { safe: true, labels: [], maxConfidence: 0, provider: 'none' };
    }

    try {
      const response = await this.client.send(
        new DetectModerationLabelsCommand({
          Image: { Bytes: buffer },
          MinConfidence: BLOCK_THRESHOLD,
        }),
      );

      return this.processLabels(response.ModerationLabels ?? [], 'rekognition');
    } catch (err: any) {
      this.logger.error(`Rekognition image scan failed: ${err?.message}`);
      throw new Error('Image safety review is temporarily unavailable');
    }
  }

  /**
   * Scan an image stored in S3 directly (no buffer download needed).
   * Rekognition reads from S3 on its own — requires Rekognition role access to S3.
   */
  async scanImageFromS3(bucket: string, key: string): Promise<MediaScanResult> {
    if (this.provider === 'staging-mock') {
      return {
        safe: true,
        labels: [],
        maxConfidence: 0,
        provider: 'staging-mock',
      };
    }
    if (!this.enabled || !this.client) {
      return { safe: true, labels: [], maxConfidence: 0, provider: 'none' };
    }

    try {
      const response = await this.client.send(
        new DetectModerationLabelsCommand({
          Image: { S3Object: { Bucket: bucket, Name: key } },
          MinConfidence: BLOCK_THRESHOLD,
        }),
      );
      return this.processLabels(response.ModerationLabels ?? [], 'rekognition');
    } catch (err: any) {
      this.logger.error(`Rekognition S3 image scan failed: ${err?.message}`);
      throw new Error('Image safety review is temporarily unavailable');
    }
  }

  /**
   * Start an async video moderation job in S3/Rekognition.
   * Returns the job ID; poll with `getVideoScanResult(jobId)`.
   *
   * The video must already be in the S3 bucket (bucketName / objectKey).
   */
  async startVideoScanBuffer(buffer: Buffer): Promise<VideoScanStartResult> {
    if (this.provider === 'staging-mock') {
      return { status: 'BYPASSED', jobId: null };
    }
    if (!this.enabled || !this.client || !this.moderationStorage) {
      return { status: 'BYPASSED', jobId: null };
    }

    const requestToken = randomUUID();
    const moderationObjectKey = `nxq-social/${requestToken}.mp4`;
    return this.stageAndStartVideoScan(
      buffer,
      buffer.length,
      moderationObjectKey,
      requestToken,
    );
  }

  /**
   * Stream a transcoded video into the private AWS moderation bucket and start
   * Rekognition against it. The caller supplies a previously persisted key so
   * an interruption between upload and database commit remains recoverable.
   */
  async startVideoScanFile(
    filePath: string,
    moderationObjectKey: string,
  ): Promise<VideoScanStartResult> {
    if (this.provider === 'staging-mock') {
      return { status: 'BYPASSED', jobId: null };
    }
    if (!this.enabled || !this.client || !this.moderationStorage) {
      return { status: 'BYPASSED', jobId: null };
    }
    if (!this.isManagedModerationKey(moderationObjectKey)) {
      throw new Error(
        'Refusing to stage video outside the managed moderation prefix',
      );
    }

    const metadata = await stat(filePath);
    if (
      !metadata.isFile() ||
      !Number.isSafeInteger(metadata.size) ||
      metadata.size <= 0
    ) {
      throw new Error(
        'Video moderation source must be a non-empty regular file',
      );
    }

    const body = createReadStream(filePath);
    try {
      return await this.stageAndStartVideoScan(
        body,
        metadata.size,
        moderationObjectKey,
        moderationObjectKey.split('/').at(-1)!.slice(0, -4),
      );
    } finally {
      body.destroy();
    }
  }

  private async stageAndStartVideoScan(
    body: Buffer | Readable,
    contentLength: number,
    moderationObjectKey: string,
    requestToken: string,
  ): Promise<VideoScanStartResult> {
    try {
      await this.moderationStorage!.send(
        new PutObjectCommand({
          Bucket: this.moderationBucket,
          Key: moderationObjectKey,
          Body: body,
          ContentLength: contentLength,
          ContentType: 'video/mp4',
        }),
      );
      const jobId = await this.startVideoScan(
        this.moderationBucket,
        moderationObjectKey,
        requestToken,
      );
      if (!jobId) throw new Error('Video moderation did not return a job ID');
      return {
        status: 'STARTED',
        jobId,
        moderationObjectKey,
      };
    } catch (err: any) {
      await this.cleanupVideoScanObject(moderationObjectKey).catch(() => {});
      return {
        status: 'FAILED',
        jobId: null,
        failureReason: err?.message ?? 'Video moderation job failed to start',
        userMessage: this.toUserFacingVideoError(err?.message),
        moderationObjectKey,
      };
    }
  }

  async cleanupVideoScanObject(objectKey: string | undefined): Promise<void> {
    if (!objectKey || !this.moderationStorage || !this.moderationBucket) return;
    if (!this.isManagedModerationKey(objectKey)) {
      throw new Error(
        'Refusing to delete outside the managed moderation prefix',
      );
    }
    await this.moderationStorage.send(
      new DeleteObjectCommand({
        Bucket: this.moderationBucket,
        Key: objectKey,
      }),
    );
  }

  private isManagedModerationKey(objectKey: string): boolean {
    return (
      objectKey.startsWith('nxq-social/') &&
      objectKey.endsWith('.mp4') &&
      !objectKey.includes('\\') &&
      !objectKey.includes('//') &&
      !objectKey
        .split('/')
        .some((segment) => !segment || segment === '.' || segment === '..')
    );
  }

  async startVideoScan(
    bucketName: string,
    objectKey: string,
    clientRequestToken?: string,
  ): Promise<string | null> {
    if (this.provider === 'staging-mock') return null;
    if (!this.enabled || !this.client) {
      return null;
    }

    try {
      const response = await this.client.send(
        new StartContentModerationCommand({
          Video: { S3Object: { Bucket: bucketName, Name: objectKey } },
          MinConfidence: BLOCK_THRESHOLD,
          ClientRequestToken: clientRequestToken,
        }),
      );
      this.logger.log(`Started video scan job: ${response.JobId}`);
      return response.JobId ?? null;
    } catch (err: any) {
      this.logger.error(`Rekognition video scan start failed: ${err?.message}`);
      throw err;
    }
  }

  async startVideoScanJob(
    bucketName: string,
    objectKey: string,
  ): Promise<VideoScanStartResult> {
    if (this.provider === 'staging-mock') {
      return { status: 'BYPASSED', jobId: null };
    }
    if (!this.enabled || !this.client) {
      return { status: 'BYPASSED', jobId: null };
    }

    try {
      const jobId = await this.startVideoScan(bucketName, objectKey);
      return { status: jobId ? 'STARTED' : 'FAILED', jobId };
    } catch (err: any) {
      return {
        status: 'FAILED',
        jobId: null,
        failureReason: err?.message ?? 'Video moderation job failed to start',
        userMessage: this.toUserFacingVideoError(err?.message),
      };
    }
  }

  /**
   * Poll a video moderation job.
   * Returns null if the job is still in progress.
   */
  async getVideoScanResult(jobId: string): Promise<MediaScanResult | null> {
    if (this.provider === 'staging-mock') {
      return {
        safe: true,
        labels: [],
        maxConfidence: 0,
        provider: 'staging-mock',
      };
    }
    if (!this.enabled || !this.client) return null;

    try {
      const response = await this.client.send(
        new GetContentModerationCommand({ JobId: jobId }),
      );

      if (response.JobStatus === 'IN_PROGRESS') return null;

      const allLabels: ModerationLabel[] = (response.ModerationLabels ?? [])
        .map((d) => d.ModerationLabel!)
        .filter(Boolean);

      return this.processLabels(allLabels, 'rekognition');
    } catch (err: any) {
      this.logger.error(`Rekognition video poll failed: ${err?.message}`);
      return null;
    }
  }

  async pollVideoScan(jobId: string): Promise<VideoScanPollResult> {
    if (this.provider === 'staging-mock') {
      return {
        status: 'SUCCEEDED',
        result: {
          safe: true,
          labels: [],
          maxConfidence: 0,
          provider: 'staging-mock',
        },
      };
    }
    if (!this.enabled || !this.client) {
      return {
        status: 'FAILED',
        failureReason: 'Scanner unavailable',
        userMessage: 'Video safety review is unavailable right now.',
      };
    }

    try {
      const response = await this.client.send(
        new GetContentModerationCommand({ JobId: jobId }),
      );

      if (response.JobStatus === 'IN_PROGRESS') {
        return { status: 'IN_PROGRESS' };
      }

      if (response.JobStatus !== 'SUCCEEDED') {
        return {
          status: 'FAILED',
          failureReason:
            response.StatusMessage ??
            response.JobStatus ??
            'Video moderation failed',
          userMessage: this.toUserFacingVideoError(
            response.StatusMessage ?? response.JobStatus,
          ),
        };
      }

      const allLabels: ModerationLabel[] = (response.ModerationLabels ?? [])
        .map((d) => d.ModerationLabel!)
        .filter(Boolean);

      return {
        status: 'SUCCEEDED',
        result: this.processLabels(allLabels, 'rekognition'),
      };
    } catch (err: any) {
      this.logger.error(`Rekognition video poll failed: ${err?.message}`);
      return {
        status: 'FAILED',
        failureReason: err?.message ?? 'Video moderation polling failed',
        userMessage: this.toUserFacingVideoError(err?.message),
      };
    }
  }

  /**
   * Determine post status from a scan result.
   * Returns 'PUBLISHED' | 'UNDER_REVIEW' | 'REJECTED'
   */
  statusFromScan(
    result: MediaScanResult,
  ): 'PUBLISHED' | 'UNDER_REVIEW' | 'REJECTED' {
    if (result.safe) return 'PUBLISHED';

    const hardBlock = result.labels.some(
      (l) =>
        ALWAYS_BLOCK.has(l.name) ||
        (l.parentName && ALWAYS_BLOCK.has(l.parentName)) ||
        l.confidence >= HARD_BLOCK_THRESHOLD,
    );

    return hardBlock ? 'REJECTED' : 'UNDER_REVIEW';
  }

  private processLabels(
    labels: ModerationLabel[],
    provider: 'rekognition',
  ): MediaScanResult {
    if (labels.length === 0) {
      return { safe: true, labels: [], maxConfidence: 0, provider };
    }

    const mapped = labels.map((l) => ({
      name: l.Name ?? 'Unknown',
      confidence: l.Confidence ?? 0,
      parentName: l.ParentName,
    }));

    const maxConfidence = Math.max(...mapped.map((l) => l.confidence));
    const topLabel = mapped.reduce((a, b) =>
      a.confidence > b.confidence ? a : b,
    );

    return {
      safe: false,
      labels: mapped,
      topCategory: topLabel.parentName ?? topLabel.name,
      maxConfidence,
      provider,
    };
  }

  private toUserFacingVideoError(message?: string): string {
    const text = (message ?? '').toLowerCase();
    if (
      text.includes('codec') ||
      text.includes('h.264') ||
      text.includes('h264') ||
      text.includes('hevc') ||
      text.includes('format') ||
      text.includes('quicktime')
    ) {
      return 'This video format could not be processed. Please upload MP4/H.264.';
    }
    return 'Video processing failed. Please try again with a smaller MP4 video.';
  }
}
