import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { COIN_PACKS, LIVE_GIFTS } from './gifts.catalog';

export class CreateCoinCheckoutDto {
  @IsString()
  @IsIn(Object.keys(COIN_PACKS))
  packCode!: string;

  @IsOptional()
  @IsString()
  @Length(3, 128)
  room?: string;
}

export class SendGiftDto {
  @IsString()
  @IsIn(Object.keys(LIVE_GIFTS))
  giftCode!: string;

  @IsOptional()
  @IsString()
  recipientId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1)
  battleSide?: number;

  @IsString()
  @Length(12, 128)
  clientRequestId!: string;
}
