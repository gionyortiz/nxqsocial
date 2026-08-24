import { Module } from '@nestjs/common';
import { PostsService } from './posts.service';
import { PostsController } from './posts.controller';
import { SafetyModule } from '../safety/safety.module';
import { MediaModule } from '../media/media.module';
import { ProductionMultipartGuard } from './production-multipart.guard';

@Module({
  imports: [SafetyModule, MediaModule],
  providers: [PostsService, ProductionMultipartGuard],
  controllers: [PostsController],
  exports: [PostsService],
})
export class PostsModule {}
