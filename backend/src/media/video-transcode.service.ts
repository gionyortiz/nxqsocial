import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { StorageService } from '../common/storage/storage.service';
import { VIDEO_SIZE_LIMIT } from './media.dto';

const ffprobePath: string = (ffprobeStatic as any).path;

const TRANSCODE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const MAX_PROCESS_CAPTURE_BYTES = 2 * 1024 * 1024;
export const MAX_VIDEO_DURATION_SEC = 10 * 60;
export const MAX_TRANSCODED_VIDEO_BYTES = VIDEO_SIZE_LIMIT;
export const MAX_TRANSCODED_THUMBNAIL_BYTES = 5 * 1024 * 1024;

export class TranscodeFailedError extends Error {}

export function assertValidVideoDuration(durationSec: number): void {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    throw new TranscodeFailedError('Video duration must be finite and positive');
  }
  if (durationSec > MAX_VIDEO_DURATION_SEC) {
    throw new TranscodeFailedError(
      `Video duration exceeds the ${MAX_VIDEO_DURATION_SEC}-second limit`,
    );
  }
}

export function assertMatchingVideoDuration(
  inputDurationSec: number,
  outputDurationSec: number,
): void {
  const durationToleranceSec = Math.max(
    1,
    Math.min(3, inputDurationSec * 0.01),
  );
  if (Math.abs(outputDurationSec - inputDurationSec) > durationToleranceSec) {
    throw new TranscodeFailedError(
      'Transcoded video duration does not match the source; output may be truncated',
    );
  }
}

/** Prisma stores media duration as whole seconds; round up so UI timeouts and
 * progress indicators never under-report the playable duration. */
export function normalizeVideoDurationSec(durationSec: number): number {
  assertValidVideoDuration(durationSec);
  return Math.ceil(durationSec);
}

export interface TranscodeBufferResult {
  buffer: Buffer;
  thumbnailBuffer: Buffer;
  mimeType: 'video/mp4';
  durationSec: number;
  width: number;
  height: number;
}

export interface TranscodeReplaceResult extends Omit<TranscodeBufferResult, 'buffer' | 'thumbnailBuffer'> {
  url: string;
  thumbnailUrl: string;
  s3Key: string;
  bucket: string;
  outputBytes: number;
  thumbnailBytes: number;
  outputSha256: string;
  thumbnailSha256: string;
}

export interface TranscodeTargetKeys {
  videoKey: string;
  thumbnailKey: string;
}

interface TranscodeFileResult {
  mimeType: 'video/mp4';
  durationSec: number;
  width: number;
  height: number;
  outputBytes: number;
  thumbnailBytes: number;
}

function runProcess(bin: string, args: string[], timeoutMs = TRANSCODE_TIMEOUT_MS): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args);
    let stdout = '';
    let stderr = '';
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      fail(new TranscodeFailedError(`Process timed out after ${timeoutMs}ms: ${bin}`));
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_PROCESS_CAPTURE_BYTES) {
        child.kill('SIGKILL');
        fail(new TranscodeFailedError(`${path.basename(bin)} produced excessive output`));
        return;
      }
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes > MAX_PROCESS_CAPTURE_BYTES) {
        child.kill('SIGKILL');
        fail(new TranscodeFailedError(`${path.basename(bin)} produced excessive diagnostics`));
        return;
      }
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      fail(err);
    });
    child.on('close', (code) => {
      if (settled) return;
      clearTimeout(timer);
      settled = true;
      if (code !== 0) {
        reject(new TranscodeFailedError(`${path.basename(bin)} exited with code ${code}: ${stderr.slice(-2000)}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
  };
  return map[mime] ?? '.mp4';
}

async function sha256File(filePath: string): Promise<string> {
  const digest = createHash('sha256');
  const stream = fs.createReadStream(filePath);
  try {
    for await (const chunk of stream) digest.update(chunk);
  } finally {
    stream.destroy();
  }
  return digest.digest('hex');
}

@Injectable()
export class VideoTranscodeService {
  private readonly logger = new Logger(VideoTranscodeService.name);

  constructor(private readonly storage: StorageService) {}

  /**
   * Normalize an arbitrary uploaded video buffer to H.264/AAC faststart MP4,
   * plus a generated thumbnail. Always re-encodes — no attempt to detect
   * "already fine" inputs, since that requires inspecting container internals
   * (moov atom position) that aren't worth the complexity for v1.
   */
  async transcodeBuffer(buffer: Buffer, mimeType: string): Promise<TranscodeBufferResult> {
    const workDir = os.tmpdir();
    const jobId = randomUUID();
    const inputPath = path.join(workDir, `${jobId}-in${extFromMime(mimeType)}`);
    const outputPath = path.join(workDir, `${jobId}-out.mp4`);
    const thumbPath = path.join(workDir, `${jobId}-thumb.jpg`);

    try {
      await fs.promises.writeFile(inputPath, buffer);

      const result = await this.transcodeFile(inputPath, outputPath, thumbPath);
      const [outputBuffer, thumbnailBuffer] = await Promise.all([
        fs.promises.readFile(outputPath),
        fs.promises.readFile(thumbPath),
      ]);
      return {
        buffer: outputBuffer,
        thumbnailBuffer,
        mimeType: result.mimeType,
        durationSec: result.durationSec,
        width: result.width,
        height: result.height,
      };
    } finally {
      await Promise.all(
        [inputPath, outputPath, thumbPath].map((p) => fs.promises.unlink(p).catch(() => {})),
      );
    }
  }

  /**
   * Fetch an existing asset from storage, transcode it, upload the result
   * (and thumbnail) under new keys. The caller owns the database commit and
   * must delete the original only after that commit succeeds.
   */
  async transcodeAndReplace(
    asset: { s3Key: string; bucket: string; mimeType: string },
    targets: TranscodeTargetKeys,
  ): Promise<TranscodeReplaceResult> {
    const workDir = os.tmpdir();
    const jobId = randomUUID();
    const inputPath = path.join(
      workDir,
      `${jobId}-in${extFromMime(asset.mimeType)}`,
    );
    const outputPath = path.join(workDir, `${jobId}-out.mp4`);
    const thumbPath = path.join(workDir, `${jobId}-thumb.jpg`);
    try {
      if (asset.bucket === this.storage.quarantineBucketName) {
        await this.storage.downloadIncomingToFile(asset.s3Key, inputPath);
      } else {
        await this.storage.downloadToFile(asset.s3Key, inputPath);
      }
      const result = await this.transcodeFile(inputPath, outputPath, thumbPath);
      const [outputSha256, thumbnailSha256] = await Promise.all([
        sha256File(outputPath),
        sha256File(thumbPath),
      ]);
      const url = await this.storage.uploadFileToKey(
        outputPath,
        targets.videoKey,
        'video/mp4',
        ['videos'],
      );
      const thumbnailUrl = await this.storage.uploadFileToKey(
        thumbPath,
        targets.thumbnailKey,
        'image/jpeg',
        ['thumbnails'],
      );
      const [storedOutput, storedThumbnail] = await Promise.all([
        this.storage.sha256(targets.videoKey, MAX_TRANSCODED_VIDEO_BYTES),
        this.storage.sha256(
          targets.thumbnailKey,
          MAX_TRANSCODED_THUMBNAIL_BYTES,
        ),
      ]);
      if (
        storedOutput.bytes !== result.outputBytes ||
        storedOutput.sha256 !== outputSha256 ||
        storedThumbnail.bytes !== result.thumbnailBytes ||
        storedThumbnail.sha256 !== thumbnailSha256
      ) {
        throw new TranscodeFailedError(
          'Stored transcode output failed its checksum verification',
        );
      }

      return {
        url,
        thumbnailUrl,
        s3Key: targets.videoKey,
        bucket: this.storage.bucketName,
        mimeType: 'video/mp4',
        durationSec: result.durationSec,
        width: result.width,
        height: result.height,
        outputBytes: result.outputBytes,
        thumbnailBytes: result.thumbnailBytes,
        outputSha256,
        thumbnailSha256,
      };
    } finally {
      await Promise.all(
        [inputPath, outputPath, thumbPath].map((filePath) =>
          fs.promises.unlink(filePath).catch(() => {}),
        ),
      );
    }
  }

  private async transcodeFile(
    inputPath: string,
    outputPath: string,
    thumbPath: string,
  ): Promise<TranscodeFileResult> {
    const inputMetadata = await fs.promises.stat(inputPath);
    if (
      !inputMetadata.isFile() ||
      !Number.isSafeInteger(inputMetadata.size) ||
      inputMetadata.size <= 0 ||
      inputMetadata.size > VIDEO_SIZE_LIMIT
    ) {
      throw new TranscodeFailedError(
        `Video input must be between 1 and ${VIDEO_SIZE_LIMIT} bytes`,
      );
    }

    const inputProbe = await this.probe(inputPath);
    assertValidVideoDuration(inputProbe.durationSec);

    await runProcess(ffmpegPath as string, [
      '-i', inputPath,
      '-vf',
      "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2",
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-fs', String(MAX_TRANSCODED_VIDEO_BYTES),
      '-y', outputPath,
    ]);

    const outputMetadata = await fs.promises.stat(outputPath);
    if (
      !outputMetadata.isFile() ||
      !Number.isSafeInteger(outputMetadata.size) ||
      outputMetadata.size <= 0 ||
      outputMetadata.size > MAX_TRANSCODED_VIDEO_BYTES
    ) {
      throw new TranscodeFailedError(
        `Transcoded video exceeds the ${MAX_TRANSCODED_VIDEO_BYTES}-byte limit`,
      );
    }

    const outputProbe = await this.probe(outputPath);
    assertValidVideoDuration(outputProbe.durationSec);
    assertMatchingVideoDuration(inputProbe.durationSec, outputProbe.durationSec);

    const seek = Math.max(0, Math.min(1, outputProbe.durationSec * 0.1));
    await runProcess(ffmpegPath as string, [
      '-ss', String(seek),
      '-i', outputPath,
      '-frames:v', '1',
      '-q:v', '3',
      '-y', thumbPath,
    ]);

    const thumbnailMetadata = await fs.promises.stat(thumbPath);
    if (
      !thumbnailMetadata.isFile() ||
      !Number.isSafeInteger(thumbnailMetadata.size) ||
      thumbnailMetadata.size <= 0 ||
      thumbnailMetadata.size > MAX_TRANSCODED_THUMBNAIL_BYTES
    ) {
      throw new TranscodeFailedError(
        `Generated thumbnail exceeds the ${MAX_TRANSCODED_THUMBNAIL_BYTES}-byte limit`,
      );
    }

    return {
      mimeType: 'video/mp4',
      durationSec: normalizeVideoDurationSec(outputProbe.durationSec),
      width: outputProbe.width,
      height: outputProbe.height,
      outputBytes: outputMetadata.size,
      thumbnailBytes: thumbnailMetadata.size,
    };
  }

  private async probe(filePath: string): Promise<{ durationSec: number; width: number; height: number }> {
    try {
      const { stdout } = await runProcess(ffprobePath, [
        '-v', 'error',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        filePath,
      ]);
      const parsed = JSON.parse(stdout);
      const videoStream = (parsed.streams ?? []).find((s: any) => s.codec_type === 'video');
      const durationRaw = parsed.format?.duration ?? videoStream?.duration;
      const durationSec = Number(durationRaw);
      const width = Number(videoStream?.width);
      const height = Number(videoStream?.height);
      if (
        !videoStream ||
        !Number.isFinite(durationSec) ||
        durationSec <= 0 ||
        !Number.isSafeInteger(width) ||
        width <= 0 ||
        !Number.isSafeInteger(height) ||
        height <= 0
      ) {
        throw new TranscodeFailedError('Video metadata is missing or non-finite');
      }
      return {
        durationSec: Math.round(durationSec * 1000) / 1000,
        width,
        height,
      };
    } catch (err: any) {
      this.logger.warn(`ffprobe rejected video metadata: ${err?.message}`);
      if (err instanceof TranscodeFailedError) throw err;
      throw new TranscodeFailedError(
        `Could not read finite video metadata: ${err?.message ?? 'unknown error'}`,
      );
    }
  }

}
