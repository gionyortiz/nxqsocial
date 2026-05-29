import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum AdminMediaFilter {
  FLAGGED = 'FLAGGED',
  REJECTED = 'REJECTED',
  SCANNING = 'SCANNING',
  ALL = 'ALL',
}

export class AdminMediaQueryDto {
  @IsOptional()
  @IsEnum(AdminMediaFilter)
  status?: AdminMediaFilter;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;
}

export class AdminMediaRejectDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
