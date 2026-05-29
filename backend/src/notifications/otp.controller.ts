import {
  Controller, Post, Body, Req, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { OtpService } from './otp.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IsIn, IsString, Length } from 'class-validator';

class VerifyOtpDto {
  @IsIn(['email', 'phone'])
  channel: 'email' | 'phone';

  @IsString()
  @Length(6, 6)
  code: string;
}

@Controller('otp')
@UseGuards(JwtAuthGuard)
export class OtpController {
  constructor(private otp: OtpService) {}

  @Post('send-email')
  @HttpCode(HttpStatus.OK)
  sendEmail(@Req() req: any) {
    return this.otp.sendEmailOtp(req.user.id);
  }

  @Post('send-phone')
  @HttpCode(HttpStatus.OK)
  sendPhone(@Req() req: any) {
    return this.otp.sendPhoneOtp(req.user.id);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  verify(@Req() req: any, @Body() dto: VerifyOtpDto) {
    return this.otp.verifyOtp(req.user.id, dto.channel, dto.code);
  }
}
