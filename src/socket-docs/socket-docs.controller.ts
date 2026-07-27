import { Controller, Get } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiExtraModels,
  ApiProperty,
} from '@nestjs/swagger';

class SocketChatEvent {
  @ApiProperty()
  chatId: string;
}

class SocketMessageEvent {
  @ApiProperty()
  chatId: string;

  @ApiProperty()
  text: string;
}

class SocketLoadMoreEvent {
  @ApiProperty()
  chatId: string;

  @ApiProperty({ required: false })
  before?: string;
}

class SocketAddMemberEvent {
  @ApiProperty()
  chatId: string;

  @ApiProperty({ type: [String] })
  members: string[];
}

class SocketMessagePayload {
  @ApiProperty()
  id: string;

  @ApiProperty()
  senderId: string;

  @ApiProperty()
  text: string;

  @ApiProperty()
  sentAt: string;

  @ApiProperty({ enum: ['sent', 'delivered', 'read'] })
  status: string;
}

class SocketMessageStatusPayload {
  @ApiProperty()
  messageId: string;

  @ApiProperty({ enum: ['sent', 'delivered', 'read'] })
  status: string;
}

class SocketChatDeletedPayload {
  @ApiProperty()
  id: string;

  @ApiProperty()
  deleted: boolean;
}

class SocketErrorPayload {
  @ApiProperty()
  event: string;

  @ApiProperty()
  message: string;
}

@ApiTags('WebSocket Events')
@ApiExtraModels(
  SocketChatEvent,
  SocketMessageEvent,
  SocketLoadMoreEvent,
  SocketAddMemberEvent,
  SocketMessagePayload,
  SocketMessageStatusPayload,
  SocketChatDeletedPayload,
  SocketErrorPayload,
)
@Controller()
export class SocketDocsController {
  @Get('socket-events')
  @ApiOperation({
    summary: 'Socket.IO event reference',
    description: `\
## Client → Server events

| Event | Payload |
|-------|---------|
| \`getChats\` | \`{ username: string }\` |
| \`getUser\` | \`{ username: string }\` |
| \`createChat\` | \`CreateChatDto\` (members, name?, isGroup?, admin?) |
| \`joinChat\` | \`SocketChatEvent\` |
| \`leaveChat\` | \`SocketChatEvent\` |
| \`loadMoreMessages\` | \`SocketLoadMoreEvent\` |
| \`sendMessage\` | \`SocketMessageEvent\` |
| \`markRead\` | \`SocketChatEvent\` |
| \`deleteChat\` | \`SocketChatEvent\` |
| \`addMember\` | \`SocketAddMemberEvent\` |

## Server → Client events

| Event | Payload |
|-------|---------|
| \`chats\` | \`ChatStructure[]\` |
| \`userSearch\` | \`{ userExists: boolean, profile?: Profile }\` |
| \`chatCreated\` | \`ChatStructure\` |
| \`messages\` | \`SocketMessagePayload[]\` |
| \`moreMessages\` | \`SocketMessagePayload[]\` |
| \`newMessage\` | \`SocketMessagePayload & { chatId: string }\` |
| \`messageStatus\` | \`SocketMessageStatusPayload\` |
| \`chatDeleted\` | \`SocketChatDeletedPayload\` |
| \`memberAdded\` | \`ChatStructure\` |
| \`error\` | \`SocketErrorPayload\` |

## Authentication

The socket connection requires a JWT access token passed in the handshake auth:
\`\`\`ts
const socket = io(url, { auth: (cb) => cb({ token: accessToken }) });
\`\`\`
The token is verified once on connect (see \`handleConnection\`). All subsequent events use the cached uid from \`client.data.uid\`.

## Room-based events

Messages scoped to a specific chat (e.g. \`newMessage\`, \`messageStatus\`) are emitted to the Socket.IO room named \`<chatId>\`. The client must call \`joinChat\` to join a room before receiving these events.

## Targeted events

\`chatCreated\`, \`chatDeleted\`, and \`memberAdded\` are emitted to each affected user's private room (\`user:<uid>\`). Only users who are members of the relevant chat will receive these events.`,
  })
  socketEvents() {
    return { message: 'See description above for all Socket.IO events' };
  }
}
