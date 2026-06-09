import { Injectable, Logger } from '@nestjs/common';
import {
  RekognitionClient,
  DetectModerationLabelsCommand,
  StartContentModerationCommand,
  GetContentModerationCommand,
  ModerationLabel,
} from '@aws-sdk/client-rekognition';

export interface MediaScanResult {
  safe: boolean;
  labels: Array<{ name: string; confidence: number; parentName?: string }>;
  topCategory?: string;
  maxConfidence: number;
  provider: 'rekognition' | 'none';
}

export interface VideoScanStartResult {
  status: 'STARTED' | 'BYPASSED' | 'FAILED';
  jobId: string | null;
  failureReason?: string;
  userMessage?: string;
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

  constructor() {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const region = process.env.AWS_REGION ?? 'us-east-1';

    // Rekognition requires AWS (not R2) credentials and a real AWS region
    const rekognitionRegion = process.env.REKOGNITION_REGION ?? region;
    const rekognitionKeyId = process.env.REKOGNITION_ACCESS_KEY_ID ?? accessKeyId;
    const rekognitionSecret = process.env.REKOGNITION_SECRET_ACCESS_KEY ?? secretAccessKey;

    this.enabled = !!(
      rekognitionKeyId &&
      rekognitionSecret &&
      !rekognitionKeyId.startsWith('REPLACE') &&
      rekognitionRegion !== 'auto'
    );

    if (this.enabled) {
      this.client = new RekognitionClient({
        region: rekognitionRegion,
        credentials: { accessKeyId: rekognitionKeyId!, secretAccessKey: rekognitionSecret! },
      });
      this.logger.log(`MediaSafetyService: Rekognition enabled (region=${rekognitionRegion})`);
    } else {
      this.client = null;
      this.logger.warn('MediaSafetyService: Rekognition not configured — media scanning disabled');
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
      // Fail-open: don't block uploads if scanner is down
      return { safe: true, labels: [], maxConfidence: 0, provider: 'rekognition' };
    }
  }

  /**
   * Scan an image stored in S3 directly (no buffer download needed).
   * Rekognition reads from S3 on its own — requires Rekognition role access to S3.
   */
  async scanImageFromS3(bucket: string, key: string): Promise<MediaScanResult> {
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
      return { safe: true, labels: [], maxConfidence: 0, provider: 'rekognition' };
    }
  }

  /**
   * Start an async video moderation job in S3/Rekognition.
   * Returns the job ID; poll with `getVideoScanResult(jobId)`.
   *
   * The video must already be in the S3 bucket (bucketName / objectKey).
   */
  async startVideoScan(bucketName: string, objectKey: string): Promise<string | null> {
    if (!this.enabled || !this.client) {
      return null;
    }

    try {
      const response = await this.client.send(
        new StartContentModerationCommand({
          Video: { S3Object: { Bucket: bucketName, Name: objectKey } },
          MinConfidence: BLOCK_THRESHOLD,
        }),
      );
      this.logger.log(`Started video scan job: ${response.JobId}`);
      return response.JobId ?? null;
    } catch (err: any) {
      this.logger.error(`Rekognition video scan start failed: ${err?.message}`);
      throw err;
    }
  }

  async startVideoScanJob(bucketName: string, objectKey: string): Promise<VideoScanStartResult> {
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
    if (!this.enabled || !this.client) {
      return { status: 'FAILED', failureReason: 'Scanner unavailable', userMessage: 'Video safety review is unavailable right now.' };
    }

    try {
      const response = await this.client.send(new GetContentModerationCommand({ JobId: jobId }));

      if (response.JobStatus === 'IN_PROGRESS') {
        return { status: 'IN_PROGRESS' };
      }

      if (response.JobStatus !== 'SUCCEEDED') {
        return {
          status: 'FAILED',
          failureReason: response.StatusMessage ?? response.JobStatus ?? 'Video moderation failed',
          userMessage: this.toUserFacingVideoError(response.StatusMessage ?? response.JobStatus),
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
  statusFromScan(result: MediaScanResult): 'PUBLISHED' | 'UNDER_REVIEW' | 'REJECTED' {
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
    const topLabel = mapped.reduce((a, b) => (a.confidence > b.confidence ? a : b));

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
    if (text.includes('codec') || text.includes('h.264') || text.includes('h264') || text.includes('hevc') || text.includes('format') || text.includes('quicktime')) {
      return 'This video format could not be processed. Please upload MP4/H.264.';
    }
    return 'Video processing failed. Please try again with a smaller MP4 video.';
  }
}
