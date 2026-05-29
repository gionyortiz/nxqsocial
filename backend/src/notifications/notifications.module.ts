import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { OtpService } from './otp.service';
import { OtpController } from './otp.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { TrustEngineModule } from '../trust-engine/trust-engine.module';

@Module({
  imports: [PrismaModule, TrustEngineModule],
  controllers: [OtpController],
  providers: [NotificationsService, OtpService],
  exports: [NotificationsService, OtpService],
})
export class NotificationsModule {}
