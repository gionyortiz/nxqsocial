import { Module } from '@nestjs/common';
import { StoriesController } from './stories.controller';
import { StoriesService } from './stories.service';
import { SafetyModule } from '../safety/safety.module';

@Module({
  imports: [SafetyModule],
  providers: [StoriesService],
  controllers: [StoriesController],
})
export class StoriesModule {}
