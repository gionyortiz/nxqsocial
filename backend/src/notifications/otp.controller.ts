import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { OtpService } from './otp.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IsIn, IsString, Matches } from 'class-validator';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { getClientIpFromRequest } from '../common/network/client-ip';
import type { Response } from 'express';

interface AuthenticatedRequest {
  user: { id: string };
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: unknown };
  connection?: { remoteAddress?: unknown };
}

const authenticatedTracker = (req: AuthenticatedRequest) =>
  req?.user?.id ? `user:${req.user.id}` : getClientIpFromRequest(req);

class VerifyOtpDto {
  @IsIn(['email', 'phone'])
  channel: 'email' | 'phone';

  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be exactly 6 digits' })
  code: string;
}

@Controller('otp')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class OtpController {
  constructor(private otp: OtpService) {}

  @Post('send-email')
  @Throttle({
    default: { limit: 3, ttl: 600000, getTracker: authenticatedTracker },
  })
  @HttpCode(HttpStatus.OK)
  sendEmail(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    return withRetryAfterHeader(response, () =>
      this.otp.sendEmailOtp(req.user.id),
    );
  }

  @Post('send-phone')
  @Throttle({
    default: { limit: 3, ttl: 600000, getTracker: authenticatedTracker },
  })
  @HttpCode(HttpStatus.OK)
  sendPhone(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    return withRetryAfterHeader(response, () =>
      this.otp.sendPhoneOtp(req.user.id),
    );
  }

  @Post('verify')
  @Throttle({
    default: { limit: 10, ttl: 600000, getTracker: authenticatedTracker },
  })
  @HttpCode(HttpStatus.OK)
  verify(
    @Req() req: AuthenticatedRequest,
    @Body() dto: VerifyOtpDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return withRetryAfterHeader(response, () =>
      this.otp.verifyOtp(req.user.id, dto.channel, dto.code),
    );
  }
}

async function withRetryAfterHeader<T>(
  response: Response,
  action: () => Promise<T>,
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof HttpException) {
      const body = error.getResponse();
      const retryAfter =
        typeof body === 'object' && body !== null
          ? (body as { retryAfter?: unknown }).retryAfter
          : undefined;
      if (
        typeof retryAfter === 'number' &&
        Number.isFinite(retryAfter) &&
        retryAfter > 0
      ) {
        response.setHeader('Retry-After', String(Math.ceil(retryAfter)));
      }
    }
    throw error;
  }
}
