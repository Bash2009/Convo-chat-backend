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

@WebSocketGateway({
  cors: {
    origin: 'http://localhost:5173',
    credentials: true,
  },
})
export class ChatsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  constructor(private chatsService: ChatsService) {}

  handleConnection(client: Socket) {
    console.log(`Client ${client.id} connected`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client ${client.id} disconnected`);
  }

  // chats.gateway.ts
  @SubscribeMessage('getUser')
  async getUser(
    @MessageBody() data: { username: string },
    @ConnectedSocket() client: Socket,
  ) {
    const user = await this.chatsService.getUser(data.username);
    client.emit('userSearch', { ...user });
  }

  @SubscribeMessage('createChat')
  create(@MessageBody() data: any, @ConnectedSocket() client: Socket) {
    const newChat = this.chatsService.create(data); // call your service to create a new chat
    this.server.emit('newChat', newChat); // broadcast the new chat to all clients
  }
}
