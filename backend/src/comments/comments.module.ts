import { Module } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CommentsController } from './comments.controller';
import { SafetyModule } from '../safety/safety.module';

@Module({
  imports: [SafetyModule],
  providers: [CommentsService],
  controllers: [CommentsController],
})
export class CommentsModule {}
