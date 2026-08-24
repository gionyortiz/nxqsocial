import { Module } from '@nestjs/common';
import { AdminMediaController } from './admin-media.controller';
import { AdminMediaService } from './admin-media.service';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../common/storage/storage.module';
import { SafetyModule } from '../safety/safety.module';

@Module({
  imports: [PrismaModule, StorageModule, SafetyModule],
  controllers: [AdminMediaController],
  providers: [AdminMediaService],
})
export class AdminModule {}
