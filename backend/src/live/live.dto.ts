import { IsOptional, IsString, MaxLength, Min, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class StartLiveDto {
  @IsString()
  @MaxLength(128)
  room!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;
}

export class HeartbeatDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  viewerCount?: number;
}
