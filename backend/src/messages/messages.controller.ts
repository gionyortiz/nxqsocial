import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateConversationDto, SendMessageDto } from './messages.dto';
import { MessagesService } from './messages.service';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('conversations')
  listConversations(@CurrentUser() user: any) {
    return this.messagesService.listConversations(user.id);
  }

  @Post('conversations')
  createConversation(@CurrentUser() user: any, @Body() dto: CreateConversationDto) {
    return this.messagesService.createConversation(user.id, dto.participantUsername);
  }

  @Get('conversations/:conversationId/messages')
  getMessages(
    @CurrentUser() user: any,
    @Param('conversationId') conversationId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.messagesService.getMessages(user.id, conversationId, cursor);
  }

  @Post('conversations/:conversationId/messages')
  sendMessage(
    @CurrentUser() user: any,
    @Param('conversationId') conversationId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messagesService.sendMessage(user.id, conversationId, dto.content);
  }

  @Post('conversations/:conversationId/read')
  markRead(@CurrentUser() user: any, @Param('conversationId') conversationId: string) {
    return this.messagesService.markRead(user.id, conversationId);
  }
}
