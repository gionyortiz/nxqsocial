import {
  Controller, Get, Post, Patch, Body, Param, UseGuards,
  Headers, Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';
import { VerificationService } from './verification.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { IsString, IsIn } from 'class-validator';

class RequestVerificationDto {
  @IsString()
  @IsIn(['HUMAN_VERIFIED', 'ID_VERIFIED', 'BUSINESS_VERIFIED'])
  tier!: string;
}

class ReviewVerificationDto {
  @IsString()
  approved!: string;

  @IsString()
  reviewNote?: string;
}

@Controller('verification')
export class VerificationController {
  constructor(private verificationService: VerificationService) {}

  /** Stripe webhook — no JWT guard; validates via Stripe signature */
  @Post('stripe/webhook')
  stripeWebhook(
    @Headers('stripe-signature') sig: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    return this.verificationService.handleStripeWebhook(req.rawBody!, sig);
  }

  @UseGuards(JwtAuthGuard)
  @Get('status')
  getMyStatus(@CurrentUser() user: any) {
    return this.verificationService.getStatus(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('request')
  requestVerification(@CurrentUser() user: any, @Body() dto: RequestVerificationDto) {
    return this.verificationService.requestVerification(user.id, dto.tier);
  }

  /** Start a Stripe Identity session for ID_VERIFIED tier */
  @UseGuards(JwtAuthGuard)
  @Post('start-identity-check')
  startIdentityCheck(@CurrentUser() user: any) {
    return this.verificationService.startStripeIdentityCheck(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('admin/pending')
  getPending() {
    return this.verificationService.getPendingVerifications();
  }

  @UseGuards(JwtAuthGuard)
  @Patch('admin/:id/review')
  reviewVerification(@Param('id') id: string, @Body() dto: ReviewVerificationDto) {
    const approved = dto.approved === 'true' || dto.approved === '1';
    return this.verificationService.reviewVerification(id, approved);
  }
}

