import { IsString, IsOptional, IsEnum, MaxLength } from 'class-validator';

export enum PostType {
  PHOTO = 'PHOTO',
  VIDEO = 'VIDEO',
  SHORT_VIDEO = 'SHORT_VIDEO',
  TEXT = 'TEXT',
}

export enum Visibility {
  PUBLIC = 'PUBLIC',
  FOLLOWERS = 'FOLLOWERS',
  PRIVATE = 'PRIVATE',
}

export enum AiLabel {
  NONE = 'NONE',
  AI_GENERATED = 'AI_GENERATED',
  AI_EDITED = 'AI_EDITED',
  VERIFIED_CAMERA_SOURCE = 'VERIFIED_CAMERA_SOURCE',
  SOURCE_UNKNOWN = 'SOURCE_UNKNOWN',
}

export class CreatePostDto {
  @IsOptional()
  @IsString()
  @MaxLength(2200)
  caption?: string;

  @IsOptional()
  @IsEnum(PostType)
  type?: PostType;

  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;

  @IsOptional()
  @IsEnum(AiLabel)
  aiLabel?: AiLabel;

  /** Pre-uploaded MediaAsset ID from the signed-URL pipeline */
  @IsOptional()
  @IsString()
  mediaId?: string;
}
