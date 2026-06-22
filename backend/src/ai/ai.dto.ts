import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AiCaptionAssistDto {
  @IsString()
  @MaxLength(5000)
  text!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  context?: string;
}

export class AiCommentAssistDto {
  @IsString()
  @MaxLength(2000)
  text!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  postContext?: string;
}

export type AiAssistantMode =
  | 'improve'
  | 'shorten'
  | 'funny'
  | 'professional'
  | 'hashtags'
  | 'translate'
  | 'reply_friendly'
  | 'reply_funny'
  | 'reply_professional';
