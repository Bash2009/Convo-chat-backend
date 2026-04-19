import { Module } from '@nestjs/common';
import { ChatsService } from './chats.service';
import { ChatsGateway } from './chats.gateway';
import { ChatsController } from './chats.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatMember } from './entities/chat-members.entity';
import { Chat } from './entities/chat.entity';
import { Message } from './entities/messages.entity';
import { ProfileModule } from 'src/profile/profile.module';

@Module({
  providers: [ChatsGateway, ChatsService],
  controllers: [ChatsController],
  imports: [
    TypeOrmModule.forFeature([ChatMember, Chat, Message]),
    ProfileModule,
  ],
})
export class ChatsModule {}
