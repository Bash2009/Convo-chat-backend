import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  OnGatewayConnection,
  WebSocketServer,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ChatsService } from './chats.service';
import { AddMembersDto } from './dto/add-members.dto';
import { CreateChatDto } from './dto/create-chat.dto';
import { validateOrReject } from 'class-validator';
import { plainToInstance } from 'class-transformer';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
  },
})
export class ChatsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  private readonly logger = new Logger(ChatsGateway.name);

  constructor(
    private chatsService: ChatsService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  // ── Auth helper ────────────────────────────────────────────────────────────

  /** Verifies the JWT once on connection and caches uid on the socket.
   *  Subsequent calls use the cached value to avoid repeated signature checks. */
  private getUid(client: Socket): string {
    const data = client.data as Record<string, unknown> | undefined;
    if (data?.uid) return data.uid as string;
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) throw new WsException('Missing auth token');
    try {
      const payload = this.jwtService.verify<{ sub: string }>(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
      client.data = { ...((client.data ?? {}) as Record<string, unknown>), uid: payload.sub };
      return payload.sub;
    } catch {
      throw new WsException('Invalid or expired token');
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  handleConnection(client: Socket) {
    try {
      const uid = this.getUid(client);
      client.join(`user:${uid}`);
      this.logger.log(`Client connected: ${client.id} (user:${uid})`);
    } catch {
      this.logger.warn(`Rejected unauthenticated socket: ${client.id}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // ── Chat list ──────────────────────────────────────────────────────────────

  @SubscribeMessage('getChats')
  async getChats(
    @MessageBody() data: { username: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const uid = this.getUid(client);
      // uid is the Firebase uid which is the same as the username field sent by the client
      const chats = await this.chatsService.getChats(uid);
      client.emit('chats', chats);
    } catch {
      client.emit('error', {
        event: 'getChats',
        message: 'Failed to load chats',
      });
    }
  }

  @SubscribeMessage('getUser')
  async getUser(
    @MessageBody() data: { username: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      this.getUid(client);
      const result = await this.chatsService.getUser(data.username);
      client.emit('userSearch', { ...result });
    } catch (err) {
      this.logger.error(`getUser error: ${(err as Error).message}`);
      client.emit('userSearch', { userExists: false });
    }
  }

  @SubscribeMessage('createChat')
  async create(
    @MessageBody() data: CreateChatDto,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const uid = this.getUid(client);

      // WebSocket messages bypass NestJS ValidationPipe — validate inline
      const dto = plainToInstance(CreateChatDto, data);
      await validateOrReject(dto);

      // Ensure the creator is always a member — copy to avoid mutating the DTO
      const currentMembers = dto.members ?? [];
      const members = currentMembers.includes(uid)
        ? currentMembers
        : [...currentMembers, uid];
      const newChat = await this.chatsService.create({ ...dto, members });
      const participants = newChat.participants as Array<{
        user: { uid: string };
      }>;
      for (const p of participants)
        this.server.to(`user:${p.user.uid}`).emit('chatCreated', newChat);
    } catch (err) {
      this.logger.error(`createChat error: ${(err as Error).message}`);
      client.emit('error', {
        event: 'createChat',
        message: 'Failed to create chat',
      });
    }
  }

  // ── Chat room ──────────────────────────────────────────────────────────────

  @SubscribeMessage('joinChat')
  async joinChat(
    @MessageBody() data: { chatId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const uid = this.getUid(client);
      await this.chatsService.assertMember(data.chatId, uid);
      await client.join(data.chatId);
      const messages = await this.chatsService.getMessages(data.chatId, uid);
      client.emit('messages', messages);
    } catch (err) {
      this.logger.error(`joinChat error: ${(err as Error).message}`);
      client.emit('error', {
        event: 'joinChat',
        message: 'Failed to join chat',
      });
    }
  }

  @SubscribeMessage('leaveChat')
  async leaveChat(
    @MessageBody() data: { chatId: string },
    @ConnectedSocket() client: Socket,
  ) {
    await client.leave(data.chatId);
  }

  @SubscribeMessage('loadMoreMessages')
  async loadMoreMessages(
    @MessageBody() data: { chatId: string; before?: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const uid = this.getUid(client);
      const olderMessages = await this.chatsService.loadMoreMessages(
        data.chatId,
        uid,
        data.before,
      );
      client.emit('moreMessages', olderMessages);
    } catch (err) {
      this.logger.error(`loadMoreMessages error: ${(err as Error).message}`);
      client.emit('error', {
        event: 'loadMoreMessages',
        message: 'Failed to load messages',
      });
    }
  }

  @SubscribeMessage('deleteChat')
  async deleteChat(
    @MessageBody() data: { chatId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const uid = this.getUid(client);
      const members = await this.chatsService.getMemberUids(data.chatId);
      const result = await this.chatsService.delete(data.chatId, uid);
      for (const memberUid of members)
        this.server.to(`user:${memberUid}`).emit('chatDeleted', result);
    } catch (err) {
      this.logger.error(`deleteChat error: ${(err as Error).message}`);
      client.emit('error', {
        event: 'deleteChat',
        message: 'Failed to delete chat',
      });
    }
  }

  @SubscribeMessage('addMember')
  async addMember(
    @MessageBody() data: { chatId: string; members: string[] },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const uid = this.getUid(client);

      const dto = plainToInstance(AddMembersDto, data);
      await validateOrReject(dto);

      const chat = await this.chatsService.addMembers(
        data.chatId,
        data.members,
        uid,
      );
      const participants = chat.participants as Array<{
        user: { uid: string };
      }>;
      for (const p of participants)
        this.server.to(`user:${p.user.uid}`).emit('memberAdded', chat);
    } catch (err) {
      this.logger.error(`addMember error: ${(err as Error).message}`);
      client.emit('error', {
        event: 'addMember',
        message: 'Failed to add member',
      });
    }
  }

  @SubscribeMessage('sendMessage')
  async sendMessage(
    @MessageBody() data: { chatId: string; text: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const senderId = this.getUid(client);
      const message = await this.chatsService.sendMessage(
        data.chatId,
        senderId,
        data.text,
      );
      this.server
        .to(data.chatId)
        .emit('newMessage', { ...message, chatId: data.chatId });

      const socketsInRoom = (await this.server.in(data.chatId).fetchSockets())
        .length;
      if (socketsInRoom > 1) {
        this.server.to(data.chatId).emit('messageStatus', {
          messageId: message.id,
          status: 'delivered',
        });
      }
    } catch (err) {
      this.logger.error(`sendMessage error: ${(err as Error).message}`);
      client.emit('error', {
        event: 'sendMessage',
        message: 'Failed to send message',
      });
    }
  }

  @SubscribeMessage('markRead')
  async markRead(
    @MessageBody() data: { chatId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const uid = this.getUid(client);
      const readMessages = await this.chatsService.markRead(data.chatId, uid);
      for (const msg of readMessages) {
        this.server.to(data.chatId).emit('messageStatus', {
          messageId: msg.id,
          status: 'read',
        });
      }
    } catch (err) {
      this.logger.error(`markRead error: ${(err as Error).message}`);
    }
  }
}
