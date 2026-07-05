import { IsString, IsOptional, IsEnum, MaxLength } from 'class-validator';
import { Visibility } from '../posts/posts.dto';

export class CreateStoryDto {
  @IsString()
  mediaId: string;

  @IsOptional()
  @IsString()
  @MaxLength(2200)
  caption?: string;

  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;
}
