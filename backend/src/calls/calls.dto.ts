import { IsArray, IsBoolean, IsOptional, IsString, ArrayMaxSize } from 'class-validator';

export class CreateTokenDto {
  @IsString()
  room!: string;

  @IsOptional()
  @IsBoolean()
  video?: boolean;
}

export class RingDto {
  @IsString()
  room!: string;

  @IsArray()
  @ArrayMaxSize(16)
  @IsString({ each: true })
  targets!: string[];

  @IsOptional()
  @IsBoolean()
  video?: boolean;

  @IsOptional()
  @IsBoolean()
  group?: boolean;
}
