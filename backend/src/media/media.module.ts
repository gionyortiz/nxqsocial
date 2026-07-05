import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { VideoTranscodeService } from './video-transcode.service';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../common/storage/storage.module';
import { SafetyModule } from '../safety/safety.module';

@Module({
  imports: [PrismaModule, StorageModule, SafetyModule],
  controllers: [MediaController],
  providers: [MediaService, VideoTranscodeService],
  exports: [MediaService, VideoTranscodeService],
})
export class MediaModule {}
