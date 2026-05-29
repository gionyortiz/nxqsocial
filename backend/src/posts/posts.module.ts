import { Module } from '@nestjs/common';
import { PostsService } from './posts.service';
import { PostsController } from './posts.controller';
import { SafetyModule } from '../safety/safety.module';

@Module({
  imports: [SafetyModule],
  providers: [PostsService],
  controllers: [PostsController],
})
export class PostsModule {}
