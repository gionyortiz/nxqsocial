import { Module } from '@nestjs/common';
import { SafetyService } from './safety.service';
import { SafetyController } from './safety.controller';
import { MediaSafetyService } from './media-safety.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SafetyController],
  providers: [SafetyService, MediaSafetyService],
  exports: [SafetyService, MediaSafetyService],
})
export class SafetyModule {}
