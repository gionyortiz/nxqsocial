import {
  IsString,
  IsIn,
  IsInt,
  Min,
  Max,
  IsNotEmpty,
} from 'class-validator';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;
export const ALLOWED_MIME_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];

export const IMAGE_SIZE_LIMIT = 10 * 1024 * 1024;   // 10 MB
export const VIDEO_SIZE_LIMIT = 200 * 1024 * 1024;  // 200 MB

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
