import { Module, Global } from '@nestjs/common';
import { StorageService } from './storage.service';
import { ObjectCleanupService } from './object-cleanup.service';
import { SafetyModule } from '../../safety/safety.module';

@Global()
@Module({
  imports: [SafetyModule],
  providers: [StorageService, ObjectCleanupService],
  exports: [StorageService, ObjectCleanupService],
})
export class StorageModule {}
