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
  maxConnections: 1000,
})
export class ChatsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(ChatsGateway.name);

  private uidToSocketId = new Map<string, Set<string>>();

  constructor(
    private chatsService: ChatsService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  private verifyClient(client: Socket): string {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) throw new WsException('Missing auth token');
    try {
      const payload = this.jwtService.verify<{ sub: string }>(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
      return payload.sub;
    } catch {
      throw new WsException('Invalid or expired token');
    }
  }

  handleConnection(client: Socket) {
    try {
      const uid = this.verifyClient(client);
      const sockets = this.uidToSocketId.get(uid) ?? new Set();
      sockets.add(client.id);
      this.uidToSocketId.set(uid, sockets);
      client.data.uid = uid;
      this.logger.log(`Client connected: ${client.id} (${uid})`);
    } catch {
      this.logger.warn(`Rejected unauthenticated socket: ${client.id}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const uid = client.data.uid as string | undefined;
    if (uid) {
      const sockets = this.uidToSocketId.get(uid);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) this.uidToSocketId.delete(uid);
      }
    }
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  private emitToUserRooms(event: string, data: unknown, participantUids: string[]) {
    for (const uid of participantUids) {
      const socketIds = this.uidToSocketId.get(uid);
      if (socketIds) {
        for (const socketId of socketIds) {
          this.server.to(socketId).emit(event, data);
        }
      }
    }
  }

  @SubscribeMessage('getChats')
  async getChats(
    @MessageBody() data: { username: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const uid = this.verifyClient(client);
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
      this.verifyClient(client);
      const result = await this.chatsService.getUser(data.username);
      client.emit('userSearch', { ...result });
    } catch {
      client.emit('userSearch', { userExists: false });
    }
  }

  @SubscribeMessage('createChat')
  async create(
    @MessageBody() data: CreateChatDto,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const uid = this.verifyClient(client);

      const dto = plainToInstance(CreateChatDto, data);
      await validateOrReject(dto);

      const currentMembers = dto.members ?? [];
      const members = currentMembers.includes(uid)
        ? currentMembers
        : [...currentMembers, uid];
      const newChat = await this.chatsService.create({ ...dto, members });

      const participantUids = newChat.participants.map(
        (p: { user: { uid: string } }) => p.user.uid,
      );
      this.emitToUserRooms('chatCreated', newChat, participantUids);
    } catch (err) {
      this.logger.error(`createChat error: ${(err as Error).message}`, (err as Error).stack);
      client.emit('error', {
        event: 'createChat',
        message: 'Failed to create chat',
      });
    }
  }

  @SubscribeMessage('joinChat')
  async joinChat(
    @MessageBody() data: { chatId: string; page?: number },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      this.verifyClient(client);
      await client.join(data.chatId);
      const messages = await this.chatsService.getMessages(data.chatId, data.page);
      client.emit('messages', messages);
    } catch {
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
    @MessageBody() data: { chatId: string; page: number },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      this.verifyClient(client);
      const messages = await this.chatsService.getMessages(data.chatId, data.page);
      client.emit('moreMessages', messages);
    } catch {
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
      const uid = this.verifyClient(client);
      const result = await this.chatsService.delete(data.chatId, uid);

      const roomSockets = await this.server.in(data.chatId).fetchSockets();
      const participantUids = [
        ...new Set(roomSockets.map((s) => s.data.uid as string).filter(Boolean)),
      ];
      this.emitToUserRooms('chatDeleted', result, participantUids);
    } catch (err) {
      this.logger.error(`deleteChat error: ${(err as Error).message}`, (err as Error).stack);
      client.emit('error', { event: 'deleteChat', message: 'Failed to delete chat' });
    }
  }

  @SubscribeMessage('addMember')
  async addMember(
    @MessageBody() data: { chatId: string; members: string[] },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const uid = this.verifyClient(client);

      const dto = plainToInstance(AddMembersDto, data);
      await validateOrReject(dto);

      const chat = await this.chatsService.addMembers(data.chatId, data.members, uid);
      const participantUids = chat.participants.map(
        (p: { user: { uid: string } }) => p.user.uid,
      );
      this.emitToUserRooms('memberAdded', chat, participantUids);
    } catch (err) {
      this.logger.error(`addMember error: ${(err as Error).message}`, (err as Error).stack);
      client.emit('error', { event: 'addMember', message: 'Failed to add member' });
    }
  }

  @SubscribeMessage('sendMessage')
  async sendMessage(
    @MessageBody() data: { chatId: string; text: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const senderId = this.verifyClient(client);
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
      this.logger.error(`sendMessage error: ${(err as Error).message}`, (err as Error).stack);
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
      const uid = this.verifyClient(client);
      const readMessages = await this.chatsService.markRead(data.chatId, uid);
      if (readMessages.length > 0) {
        this.server.to(data.chatId).emit('messagesRead', {
          chatId: data.chatId,
          messageIds: readMessages.map((m) => m.id),
          readBy: uid,
        });
      }
    } catch (err) {
      this.logger.error(`markRead error: ${(err as Error).message}`, (err as Error).stack);
    }
  }
}
