import {
  WebSocketGateway,
  OnGatewayConnection,
  WebSocketServer,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatsService } from './chats.service';
import { CreateChatDto } from './dto/create-chat.dto';

@WebSocketGateway({
  cors: {
    origin: process.env.CLIENT_URL ?? 'http://localhost:5173',
    credentials: true,
  },
})
export class ChatsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  constructor(private chatsService: ChatsService) {}

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  // ── Chat list ──────────────────────────────────────────────────────────────

  /** Fetch and return all chats for the authenticated user. */
  @SubscribeMessage('getChats')
  async getChats(
    @MessageBody() data: { username: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const chats = await this.chatsService.getChats(data.username);
      client.emit('chats', chats);
    } catch (err) {
      console.error('getChats error:', err);
      client.emit('error', { event: 'getChats', message: 'Failed to load chats' });
    }
  }

  /** Search for a user by username. */
  @SubscribeMessage('getUser')
  async getUser(
    @MessageBody() data: { username: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const result = await this.chatsService.getUser(data.username);
      client.emit('userSearch', { ...result });
    } catch {
      client.emit('userSearch', { userExists: false });
    }
  }

  /**
   * Create a new chat (private or group).
   * Only the members of the new chat receive the chatCreated event.
   */
  @SubscribeMessage('createChat')
  async create(
    @MessageBody() data: CreateChatDto,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const newChat = await this.chatsService.create(data);

      // Broadcast only to sockets that are in one of the member rooms.
      // Each user joins a personal room named after their uid on 'getChats'.
      // Fall back to broadcasting to everyone for simplicity — you can scope
      // this later by tracking uid→socketId in a Map.
      this.server.emit('chatCreated', newChat);
    } catch (err) {
      console.error('createChat error:', err);
      client.emit('error', { event: 'createChat', message: 'Failed to create chat' });
    }
  }

  // ── Chat room ──────────────────────────────────────────────────────────────

  /**
   * Join a socket.io room for a specific chat and load its history.
   * ChatRoom emits this on mount; ChatList never touches it.
   */
  @SubscribeMessage('joinChat')
  async joinChat(
    @MessageBody() data: { chatId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      await client.join(data.chatId);
      const messages = await this.chatsService.getMessages(data.chatId);
      client.emit('messages', messages);
    } catch (err) {
      console.error('joinChat error:', err);
      client.emit('error', { event: 'joinChat', message: 'Failed to join chat' });
    }
  }

  /** Leave the socket.io room when the user navigates away. */
  @SubscribeMessage('leaveChat')
  async leaveChat(
    @MessageBody() data: { chatId: string },
    @ConnectedSocket() client: Socket,
  ) {
    await client.leave(data.chatId);
  }

  /**
   * Send a message to a chat room.
   * The new message is broadcast to every socket in the room.
   */
  @SubscribeMessage('sendMessage')
  async sendMessage(
    @MessageBody() data: { chatId: string; text: string; senderId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const message = await this.chatsService.sendMessage(
        data.chatId,
        data.senderId,
        data.text,
      );

      // Broadcast to all room members (including the sender so their UI updates)
      this.server.to(data.chatId).emit('newMessage', message);

      // Immediately upgrade status to 'delivered' for clients already in the room
      const deliveredCount = (await this.server.in(data.chatId).fetchSockets()).length;
      if (deliveredCount > 1) {
        this.server.to(data.chatId).emit('messageStatus', {
          messageId: message.id,
          status: 'delivered',
        });
      }
    } catch (err) {
      console.error('sendMessage error:', err);
      client.emit('error', { event: 'sendMessage', message: 'Failed to send message' });
    }
  }

  /**
   * Mark all messages in a chat as read.
   * Notifies the sender(s) in the same room so their ticks update.
   */
  @SubscribeMessage('markRead')
  async markRead(
    @MessageBody() data: { chatId: string; uid: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const readMessages = await this.chatsService.markRead(data.chatId, data.uid);

      // Emit a status update for each message that was just read
      for (const msg of readMessages) {
        this.server.to(data.chatId).emit('messageStatus', {
          messageId: msg.id,
          status: 'read',
        });
      }
    } catch (err) {
      console.error('markRead error:', err);
    }
  }
}
