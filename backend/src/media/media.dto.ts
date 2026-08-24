import {
  IsString,
  IsIn,
  IsInt,
  Min,
  Max,
  IsNotEmpty,
} from 'class-validator';

// Rekognition's in-memory image API accepts JPEG/PNG up to 5 MiB. Keep the
// public contract inside that provider boundary so accepted uploads cannot
// deterministically fail during mandatory moderation.
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png'] as const;
// Round-1 compatibility hotfix: limit video uploads to MP4.
// iPhone Safari is more reliable with MP4 playback than WebM/QuickTime uploads.
const ALLOWED_VIDEO_TYPES = ['video/mp4'] as const;
const ALLOWED_AUDIO_TYPES = ['audio/mp4'] as const;
export const ALLOWED_MIME_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES, ...ALLOWED_AUDIO_TYPES];

export const IMAGE_SIZE_LIMIT = 5 * 1024 * 1024;    // 5 MiB (Rekognition Bytes limit)
export const VIDEO_SIZE_LIMIT = 200 * 1024 * 1024;  // 200 MB
export const AUDIO_SIZE_LIMIT = 25 * 1024 * 1024;    // 25 MB

export class CreateUploadUrlDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(ALLOWED_MIME_TYPES)
  mimeType: string;

  @IsInt()
  @Min(1)
  @Max(VIDEO_SIZE_LIMIT)
  size: number;
}

export class CompleteUploadDto {
  @IsString()
  @IsNotEmpty()
  mediaId: string;
}
