import { Module } from '@nestjs/common';
import { VerificationService } from './verification.service';
import { VerificationController } from './verification.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { TrustEngineModule } from '../trust-engine/trust-engine.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PrismaModule, TrustEngineModule, AuditModule],
  controllers: [VerificationController],
  providers: [VerificationService],
  exports: [VerificationService],
})
export class VerificationModule {}
