import { Module } from '@nestjs/common';
import { ChatsService } from './chats.service';
import { ChatsGateway } from './chats.gateway';
import { ChatsController } from './chats.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatMember } from './entities/chat-members.entity';
import { Chat } from './entities/chat.entity';
import { Message } from './entities/messages.entity';
import { ProfileModule } from 'src/profile/profile.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  providers: [ChatsGateway, ChatsService],
  controllers: [ChatsController],
  imports: [
    TypeOrmModule.forFeature([ChatMember, Chat, Message]),
    ProfileModule,
    // Gateway needs JwtService to verify socket handshake tokens
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
})
export class ChatsModule {}
