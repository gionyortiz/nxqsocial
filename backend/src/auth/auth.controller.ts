import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpException,
  HttpStatus,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
  VerifyEmailDto,
  ResendEmailVerificationDto,
} from './auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import { getClientIpFromRequest } from '../common/network/client-ip';

@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  // Registration traffic can include retries from shared/mobile networks.
  // Keep abuse protection, but allow a smoother onboarding flow.
  @Throttle({ default: { limit: 20, ttl: 600000 } })
  register(@Body() dto: RegisterDto, @Req() req: Record<string, any>) {
    return this.authService.register(dto, getClientIpFromRequest(req));
  }

  @Post('verify-email')
  @Throttle({ default: { limit: 10, ttl: 600000 } })
  @HttpCode(HttpStatus.OK)
  verifyEmail(
    @Body() dto: VerifyEmailDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return withRetryAfterHeader(response, () =>
      this.authService.verifyEmail(dto),
    );
  }

  @Post('resend-verification')
  @Throttle({ default: { limit: 3, ttl: 600000 } })
  @HttpCode(HttpStatus.OK)
  resendVerification(
    @Body() dto: ResendEmailVerificationDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return withRetryAfterHeader(response, () =>
      this.authService.resendEmailVerification(dto),
    );
  }

  @Post('login')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('forgot-password')
  @Throttle({ default: { limit: 3, ttl: 600000 } })
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 600000 } })
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  changePassword(
    @CurrentUser() user: { id: string },
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.id, dto);
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
