import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { TrustEngineModule } from '../trust-engine/trust-engine.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PrismaModule, TrustEngineModule, AuditModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
