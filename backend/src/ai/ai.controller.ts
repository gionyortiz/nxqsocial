import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AiCaptionAssistDto, AiCommentAssistDto } from './ai.dto';
import { AiService } from './ai.service';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('caption/improve')
  improveCaption(@CurrentUser() user: any, @Body() dto: AiCaptionAssistDto) {
    return this.ai.caption(user.id, 'improve', dto);
  }

  @Post('caption/shorten')
  shortenCaption(@CurrentUser() user: any, @Body() dto: AiCaptionAssistDto) {
    return this.ai.caption(user.id, 'shorten', dto);
  }

  @Post('caption/funny')
  funnyCaption(@CurrentUser() user: any, @Body() dto: AiCaptionAssistDto) {
    return this.ai.caption(user.id, 'funny', dto);
  }

  @Post('caption/professional')
  professionalCaption(@CurrentUser() user: any, @Body() dto: AiCaptionAssistDto) {
    return this.ai.caption(user.id, 'professional', dto);
  }

  @Post('caption/hashtags')
  hashtags(@CurrentUser() user: any, @Body() dto: AiCaptionAssistDto) {
    return this.ai.caption(user.id, 'hashtags', dto);
  }

  @Post('caption/translate')
  translateCaption(@CurrentUser() user: any, @Body() dto: AiCaptionAssistDto) {
    return this.ai.caption(user.id, 'translate', dto);
  }

  @Post('comment/friendly')
  friendlyComment(@CurrentUser() user: any, @Body() dto: AiCommentAssistDto) {
    return this.ai.comment(user.id, 'reply_friendly', dto);
  }

  @Post('comment/funny')
  funnyComment(@CurrentUser() user: any, @Body() dto: AiCommentAssistDto) {
    return this.ai.comment(user.id, 'reply_funny', dto);
  }

  @Post('comment/professional')
  professionalComment(@CurrentUser() user: any, @Body() dto: AiCommentAssistDto) {
    return this.ai.comment(user.id, 'reply_professional', dto);
  }
}
