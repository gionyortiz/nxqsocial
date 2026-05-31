import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

const FEEDBACK_TYPES = [
  'BUG',
  'UI_PROBLEM',
  'UPLOAD_PROBLEM',
  'CALL_PROBLEM',
  'LIVE_PROBLEM',
  'VERIFICATION_PROBLEM',
  'SUGGESTION',
] as const;

const FEEDBACK_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'BLOCKING'] as const;
const DEVICE_TYPES = ['MOBILE', 'DESKTOP', 'TABLET'] as const;
const FEEDBACK_STATUSES = ['OPEN', 'TRIAGED', 'IN_PROGRESS', 'RESOLVED', 'WONT_FIX'] as const;

export type FeedbackType = (typeof FEEDBACK_TYPES)[number];
export type FeedbackSeverity = (typeof FEEDBACK_SEVERITIES)[number];
export type DeviceType = (typeof DEVICE_TYPES)[number];
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export class CreateFeedbackDto {
  @IsEnum(FEEDBACK_TYPES)
  type!: FeedbackType;

  @IsEnum(FEEDBACK_SEVERITIES)
  severity!: FeedbackSeverity;

  @IsString()
  @MaxLength(240)
  route!: string;

  @IsEnum(DEVICE_TYPES)
  deviceType!: DeviceType;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  browser?: string;

  @IsString()
  @MaxLength(2500)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1200)
  screenshotUrl?: string;
}

export class FeedbackAdminQueryDto {
  @IsOptional()
  @IsEnum(FEEDBACK_STATUSES)
  status?: FeedbackStatus;

  @IsOptional()
  @IsEnum(FEEDBACK_SEVERITIES)
  severity?: FeedbackSeverity;

  @IsOptional()
  @IsEnum(FEEDBACK_TYPES)
  type?: FeedbackType;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number;
}

export class UpdateFeedbackStatusDto {
  @IsEnum(FEEDBACK_STATUSES)
  status!: FeedbackStatus;
}
