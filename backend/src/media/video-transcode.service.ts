import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { StorageService } from '../common/storage/storage.service';

const ffprobePath: string = (ffprobeStatic as any).path;

const TRANSCODE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const MAX_DIMENSION = 1080;

export class TranscodeFailedError extends Error {}

export interface TranscodeBufferResult {
  buffer: Buffer;
  thumbnailBuffer: Buffer;
  mimeType: 'video/mp4';
  durationSec: number | null;
  width: number | null;
  height: number | null;
}

export interface TranscodeReplaceResult extends Omit<TranscodeBufferResult, 'buffer' | 'thumbnailBuffer'> {
  url: string;
  thumbnailUrl: string;
  s3Key: string;
  bucket: string;
}

function runProcess(bin: string, args: string[], timeoutMs = TRANSCODE_TIMEOUT_MS): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args);
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new TranscodeFailedError(`Process timed out after ${timeoutMs}ms: ${bin}`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
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

      const probe = await this.probe(inputPath);

      await runProcess(ffmpegPath as string, [
        '-i', inputPath,
        '-vf', "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease",
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        '-y', outputPath,
      ]);

      const seek = Math.max(0, Math.min(1, (probe.durationSec ?? 2) * 0.1));
      await runProcess(ffmpegPath as string, [
        '-ss', String(seek),
        '-i', outputPath,
        '-frames:v', '1',
        '-q:v', '3',
        '-y', thumbPath,
      ]);

      const [outBuffer, thumbBuffer] = await Promise.all([
        fs.promises.readFile(outputPath),
        fs.promises.readFile(thumbPath),
      ]);

      return {
        buffer: outBuffer,
        thumbnailBuffer: thumbBuffer,
        mimeType: 'video/mp4',
        durationSec: probe.durationSec,
        width: probe.width,
        height: probe.height,
      };
    } finally {
      await Promise.all(
        [inputPath, outputPath, thumbPath].map((p) => fs.promises.unlink(p).catch(() => {})),
      );
    }
  }

  /**
   * Fetch an existing asset from storage, transcode it, upload the result
   * (and thumbnail) under new keys, and delete the original — only after the
   * new upload succeeds, to avoid data loss on a failed replace.
   */
  async transcodeAndReplace(asset: { s3Key: string; bucket: string; mimeType: string }): Promise<TranscodeReplaceResult> {
    const original = await this.storage.download(asset.s3Key);
    const result = await this.transcodeBuffer(original, asset.mimeType);

    const url = await this.storage.upload(result.buffer, 'video.mp4', 'video/mp4', 'videos');
    const thumbnailUrl = await this.storage.upload(result.thumbnailBuffer, 'thumb.jpg', 'image/jpeg', 'thumbnails');

    this.storage.delete(asset.s3Key).catch((err) => {
      this.logger.warn(`Failed to delete pre-transcode original ${asset.s3Key}: ${err?.message}`);
    });

    const newKey = this.storage.keyFromUrl(url);

    return {
      url,
      thumbnailUrl,
      s3Key: newKey,
      bucket: asset.bucket,
      mimeType: 'video/mp4',
      durationSec: result.durationSec,
      width: result.width,
      height: result.height,
    };
  }

  private async probe(filePath: string): Promise<{ durationSec: number | null; width: number | null; height: number | null }> {
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
      const durationSec = durationRaw ? Math.round(parseFloat(durationRaw)) : null;
      return {
        durationSec,
        width: videoStream?.width ?? null,
        height: videoStream?.height ?? null,
      };
    } catch (err: any) {
      this.logger.warn(`ffprobe failed, continuing without metadata: ${err?.message}`);
      return { durationSec: null, width: null, height: null };
    }
  }
}
