import { Module } from '@nestjs/common';
import { TrustEngineService } from './trust-engine.service';
import { TrustEngineController } from './trust-engine.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TrustEngineController],
  providers: [TrustEngineService],
  exports: [TrustEngineService],
})
export class TrustEngineModule {}
