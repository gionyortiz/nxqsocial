import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateCoinCheckoutDto, SendGiftDto } from './gifts.dto';
import { GiftsService } from './gifts.service';

type AuthenticatedUser = { id: string };

@Controller('gifts')
export class GiftsController {
  constructor(private readonly gifts: GiftsService) {}

  @UseGuards(JwtAuthGuard)
  @Get('catalog')
  catalog() {
    return this.gifts.catalog();
  }

  @UseGuards(JwtAuthGuard)
  @Get('wallet')
  wallet(@CurrentUser() user: AuthenticatedUser) {
    return this.gifts.wallet(user.id);
  }

  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  @Post('checkout')
  checkout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCoinCheckoutDto,
  ) {
    return this.gifts.createCheckout(user.id, dto.packCode, dto.room);
  }

  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post('live/:room/send')
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('room') room: string,
    @Body() dto: SendGiftDto,
  ) {
    return this.gifts.sendGift(user.id, room, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('live/:room/recent')
  recent(@Param('room') room: string, @Query('after') after?: string) {
    return this.gifts.recent(room, after);
  }

  /** Dedicated signed Stripe endpoint for coin purchases. */
  @Post('stripe/webhook')
  webhook(
    @Headers('stripe-signature') signature: string,
    @Req() request: RawBodyRequest<Request>,
  ) {
    if (!request.rawBody) {
      throw new BadRequestException('Stripe webhook raw body is unavailable.');
    }
    return this.gifts.handleStripeWebhook(request.rawBody, signature);
  }
}
