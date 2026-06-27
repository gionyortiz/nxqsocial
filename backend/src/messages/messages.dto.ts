import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateConversationDto {
  @IsString()
  @IsNotEmpty()
  participantUsername!: string;
}

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content!: string;
}
