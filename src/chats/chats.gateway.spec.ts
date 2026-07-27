import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ChatsGateway } from './chats.gateway';
import { ChatsService } from './chats.service';
import { WsException } from '@nestjs/websockets';
import { MessageStatus } from './entities/messages.entity';

describe('ChatsGateway', () => {
  let gateway: ChatsGateway;
  let chatsService: jest.Mocked<ChatsService>;
  let jwtService: jest.Mocked<JwtService>;
  const mockClient = () => {
    const emit = jest.fn();
    const join = jest.fn();
    const leave = jest.fn();
    return {
      emit,
      join,
      leave,
      handshake: { auth: { token: 'valid-token' } },
    } as any;
  };

  const emit = jest.fn();
  const to = jest.fn();

  const serverIn = jest.fn();
  const fetchSockets = jest.fn();

  const mockServer = () => {
    to.mockReturnValue({ emit });
    serverIn.mockReturnValue({ fetchSockets });
    return {
      emit,
      to,
      in: serverIn,
    };
  };

  beforeEach(async () => {
    emit.mockClear();
    to.mockClear();
    serverIn.mockClear();
    fetchSockets.mockClear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatsGateway,
        {
          provide: ChatsService,
          useValue: {
            getChats: jest.fn(),
            getUser: jest.fn(),
            create: jest.fn(),
            delete: jest.fn(),
            addMembers: jest.fn(),
            leaveGroup: jest.fn(),
            removeMember: jest.fn(),
            getMessages: jest.fn(),
            sendMessage: jest.fn(),
            markRead: jest.fn(),
            getMemberUids: jest.fn(),
            assertMember: jest.fn(),
            loadMoreMessages: jest.fn(),
          },
        },
        { provide: JwtService, useValue: { verify: jest.fn() } },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('secret') },
        },
      ],
    }).compile();

    gateway = module.get(ChatsGateway);
    chatsService = module.get(ChatsService);
    jwtService = module.get(JwtService);

    gateway.server = mockServer() as any;
  });

  // ── getUid ──────────────────────────────────────────────────────────────────

  describe('getUid', () => {
    it('returns uid for valid token', () => {
      jwtService.verify.mockReturnValue({ sub: 'uid1' });

      const client = mockClient();
      const result = gateway['getUid'](client);

      expect(result).toBe('uid1');
    });

    it('returns cached uid from client.data', () => {
      const client = mockClient();
      client.data = { uid: 'cached-uid' };
      const result = gateway['getUid'](client);

      expect(result).toBe('cached-uid');
      expect(jwtService.verify).not.toHaveBeenCalled();
    });

    it('throws WsException when token is missing', () => {
      const client = { handshake: { auth: {} }, data: {} } as any;

      expect(() => gateway['getUid'](client)).toThrow(WsException);
    });

    it('throws WsException when token is invalid', () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error();
      });

      expect(() => gateway['getUid'](mockClient())).toThrow(WsException);
    });
  });

  // ── handleConnection ────────────────────────────────────────────────────────

  describe('handleConnection', () => {
    it('accepts connection with valid token and joins user room', () => {
      jwtService.verify.mockReturnValue({ sub: 'uid1' });
      const client = mockClient();
      const disconnect = jest.fn();
      client.disconnect = disconnect;
      client.join = jest.fn();

      gateway.handleConnection(client);

      expect(client.join).toHaveBeenCalledWith('user:uid1');
      expect(disconnect).not.toHaveBeenCalled();
    });

    it('rejects connection with invalid token', () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error();
      });
      const client = mockClient();
      const disconnect = jest.fn();
      client.disconnect = disconnect;

      gateway.handleConnection(client);

      expect(disconnect).toHaveBeenCalledWith(true);
    });
  });

  // ── getChats ────────────────────────────────────────────────────────────────

  describe('getChats', () => {
    it('emits chats on success', async () => {
      jwtService.verify.mockReturnValue({ sub: 'uid1' });
      chatsService.getChats.mockResolvedValue([{ id: 'c1' } as any]);
      const client = mockClient();

      await gateway.getChats({ username: 'uid1' } as any, client);

      expect(client.emit).toHaveBeenCalledWith('chats', [{ id: 'c1' }]);
    });

    it('emits error on failure', async () => {
      jwtService.verify.mockReturnValue({ sub: 'uid1' });
      chatsService.getChats.mockRejectedValue(new Error());
      const client = mockClient();

      await gateway.getChats({ username: 'uid1' } as any, client);

      expect(client.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ event: 'getChats' }),
      );
    });
  });

  // ── getUser ─────────────────────────────────────────────────────────────────

  describe('getUser', () => {
    it('emits userSearch on success', async () => {
      jwtService.verify.mockReturnValue({ sub: 'uid1' });
      chatsService.getUser.mockResolvedValue({
        userExists: true,
        profile: { firstName: 'John' },
      } as any);
      const client = mockClient();

      await gateway.getUser({ username: 'john' } as any, client);

      expect(client.emit).toHaveBeenCalledWith('userSearch', {
        userExists: true,
        profile: { firstName: 'John' },
      });
    });

    it('emits userExists false on failure', async () => {
      jwtService.verify.mockReturnValue({ sub: 'uid1' });
      chatsService.getUser.mockRejectedValue(new Error());
      const client = mockClient();

      await gateway.getUser({ username: 'unknown' } as any, client);

      expect(client.emit).toHaveBeenCalledWith('userSearch', {
        userExists: false,
      });
    });
  });

  // ── createChat ──────────────────────────────────────────────────────────────

  describe('createChat', () => {
    it('creates chat and broadcasts chatCreated to participant rooms', async () => {
      jwtService.verify.mockReturnValue({ sub: 'uid1' });
      const chat = {
        id: 'c1',
        participants: [{ user: { uid: 'uid1' } }, { user: { uid: 'uid2' } }],
      };
      chatsService.create.mockResolvedValue(chat as any);
      const client = mockClient();

      await gateway.create(
        { members: ['uid2'], admin: 'uid1', isGroup: false } as any,
        client,
      );

      expect(gateway.server.to).toHaveBeenCalledWith('user:uid1');
      expect(gateway.server.to).toHaveBeenCalledWith('user:uid2');
      expect(gateway.server.emit).toHaveBeenCalledWith('chatCreated', chat);
    });

    it('ensures creator is always in members', async () => {
      jwtService.verify.mockReturnValue({ sub: 'uid1' });
      chatsService.create.mockResolvedValue({
        id: 'c1',
        participants: [],
      } as any);
      const client = mockClient();

      await gateway.create({ members: ['uid2'], admin: 'uid1' } as any, client);

      expect(chatsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          members: expect.arrayContaining(['uid1', 'uid2']),
        }),
      );
    });

    it('emits error on failure', async () => {
      jwtService.verify.mockReturnValue({ sub: 'uid1' });
      chatsService.create.mockRejectedValue(new Error());
      const client = mockClient();

      await gateway.create({} as any, client);

      expect(client.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ event: 'createChat' }),
      );
    });
  });

  // ── deleteChat ──────────────────────────────────────────────────────────────

  describe('deleteChat', () => {
    it('deletes chat and broadcasts chatDeleted to member rooms', async () => {
      jwtService.verify.mockReturnValue({ sub: 'uid1' });
      chatsService.getMemberUids.mockResolvedValue(['uid1', 'uid2']);
      chatsService.delete.mockResolvedValue({ id: 'c1', deleted: true });
      const client = mockClient();

      await gateway.deleteChat({ chatId: 'c1' } as any, client);

      expect(chatsService.getMemberUids).toHaveBeenCalledWith('c1');
      expect(gateway.server.to).toHaveBeenCalledWith('user:uid1');
      expect(gateway.server.to).toHaveBeenCalledWith('user:uid2');
      expect(gateway.server.emit).toHaveBeenCalledWith('chatDeleted', {
        id: 'c1',
        deleted: true,
      });
    });

    it('emits error on failure', async () => {
      jwtService.verify.mockReturnValue({ sub: 'uid1' });
      chatsService.delete.mockRejectedValue(new Error());
      const client = mockClient();

      await gateway.deleteChat({ chatId: 'c1' } as any, client);

      expect(client.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ event: 'deleteChat' }),
      );
    });
  });

  // ── addMember ───────────────────────────────────────────────────────────────

  describe('addMember', () => {
    it('adds member and broadcasts memberAdded to participant rooms', async () => {
      jwtService.verify.mockReturnValue({ sub: 'uid1' });
      const chat = {
        id: 'c1',
        participants: [{ user: { uid: 'uid1' } }, { user: { uid: 'uid3' } }],
      };
      chatsService.addMembers.mockResolvedValue(chat as any);
      const client = mockClient();

      await gateway.addMember(
        { chatId: 'c1', members: ['uid3'] } as any,
        client,
      );

      expect(gateway.server.to).toHaveBeenCalledWith('user:uid1');
      expect(gateway.server.to).toHaveBeenCalledWith('user:uid3');
      expect(gateway.server.emit).toHaveBeenCalledWith('memberAdded', chat);
    });

    it('emits error on failure', async () => {
      jwtService.verify.mockReturnValue({ sub: 'uid1' });
      chatsService.addMembers.mockRejectedValue(new Error());
      const client = mockClient();

      await gateway.addMember({ chatId: 'c1', members: [] } as any, client);

      expect(client.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ event: 'addMember' }),
      );
    });

    it('emits error when members is missing', async () => {
      jwtService.verify.mockReturnValue({ sub: 'uid1' });
      const client = mockClient();

      await gateway.addMember({ chatId: 'c1' } as any, client);

      expect(client.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ event: 'addMember' }),
      );
      expect(chatsService.addMembers).not.toHaveBeenCalled();
    });
  });

  // ── joinChat ────────────────────────────────────────────────────────────────

  describe('joinChat', () => {
    it('joins room and emits messages', async () => {
      jwtService.verify.mockReturnValue({ sub: 'uid1' });
      chatsService.assertMember.mockResolvedValue(undefined);
      chatsService.getMessages.mockResolvedValue([{ id: 'm1' } as any]);
      const client = mockClient();

      await gateway.joinChat({ chatId: 'c1' } as any, client);

      expect(chatsService.assertMember).toHaveBeenCalledWith('c1', 'uid1');
      expect(client.join).toHaveBeenCalledWith('c1');
      expect(chatsService.getMessages).toHaveBeenCalledWith('c1', 'uid1');
      expect(client.emit).toHaveBeenCalledWith('messages', [{ id: 'm1' }]);
    });

    it('emits error on failure', async () => {
      jwtService.verify.mockReturnValue({ sub: 'uid1' });
      chatsService.getMessages.mockRejectedValue(new Error());
      const client = mockClient();

      await gateway.joinChat({ chatId: 'c1' } as any, client);

      expect(client.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ event: 'joinChat' }),
      );
    });
  });

  // ── leaveChat ───────────────────────────────────────────────────────────────

  describe('leaveChat', () => {
    it('leaves the room', async () => {
      const client = mockClient();

      await gateway.leaveChat({ chatId: 'c1' } as any, client);

      expect(client.leave).toHaveBeenCalledWith('c1');
    });
  });

  // ── sendMessage ─────────────────────────────────────────────────────────────

  describe('sendMessage', () => {
    it('sends message and broadcasts to room', async () => {
      jwtService.verify.mockReturnValue({ sub: 'uid1' });
      const msg = {
        id: 'm1',
        senderId: 'uid1',
        text: 'Hi',
        sentAt: new Date(),
        status: 'sent' as MessageStatus,
      };
      chatsService.sendMessage.mockResolvedValue({
        message: msg,
        unreadByUid: {},
      });
      fetchSockets.mockResolvedValue([{}, {}]);

      const client = mockClient();
      await gateway.sendMessage({ chatId: 'c1', text: 'Hi' } as any, client);

      expect(gateway.server.to).toHaveBeenCalledWith('c1');
      expect(gateway.server.emit).toHaveBeenCalledWith('newMessage', {
        ...msg,
        chatId: 'c1',
      });
    });

    it('emits messageStatus delivered when more than 1 socket in room', async () => {
      jwtService.verify.mockReturnValue({ sub: 'uid1' });
      const msg = {
        id: 'm1',
        senderId: 'uid1',
        text: 'Hi',
        sentAt: new Date(),
        status: 'sent' as MessageStatus,
      };
      chatsService.sendMessage.mockResolvedValue({
        message: msg,
        unreadByUid: {},
      });
      fetchSockets.mockResolvedValue([{}, {}]);

      const client = mockClient();
      await gateway.sendMessage({ chatId: 'c1', text: 'Hi' } as any, client);

      expect(gateway.server.to).toHaveBeenCalledWith('c1');
      expect(gateway.server.emit).toHaveBeenCalledWith('messageStatus', {
        messageId: 'm1',
        chatId: 'c1',
        status: 'delivered',
      });
    });
  });

  // ── markRead ────────────────────────────────────────────────────────────────

  describe('markRead', () => {
    it('marks messages read and broadcasts status', async () => {
      jwtService.verify.mockReturnValue({ sub: 'uid1' });
      chatsService.markRead.mockResolvedValue([
        { id: 'm1', senderId: 'uid2' },
        { id: 'm2', senderId: 'uid2' },
      ] as any);
      const client = mockClient();

      await gateway.markRead({ chatId: 'c1' } as any, client);

      expect(gateway.server.emit).toHaveBeenCalledWith('messageStatus', {
        messageId: 'm1',
        chatId: 'c1',
        status: 'read',
      });
      expect(client.emit).toHaveBeenCalledWith('unreadUpdated', {
        chatId: 'c1',
        unread: 0,
      });
    });
  });

  // ── leaveGroup ──────────────────────────────────────────────────────────────

  describe('leaveGroup', () => {
    it('broadcasts chatDeleted when admin leaves', async () => {
      jwtService.verify.mockReturnValue({ sub: 'uid1' });
      chatsService.leaveGroup.mockResolvedValue({
        action: 'deleted',
        id: 'c1',
        memberUids: ['uid1', 'uid2'],
      });
      const client = mockClient();

      await gateway.leaveGroup({ chatId: 'c1' } as any, client);

      expect(gateway.server.emit).toHaveBeenCalledWith('chatDeleted', {
        id: 'c1',
        deleted: true,
      });
    });

    it('broadcasts memberRemoved when regular member leaves', async () => {
      jwtService.verify.mockReturnValue({ sub: 'uid1' });
      const updatedChat = {
        id: 'c1',
        participants: [{ user: { uid: 'uid2' } }],
      };
      chatsService.leaveGroup.mockResolvedValue({
        action: 'removed',
        chatId: 'c1',
        uid: 'uid1',
        updatedChat,
      });
      const client = mockClient();

      await gateway.leaveGroup({ chatId: 'c1' } as any, client);

      expect(client.emit).toHaveBeenCalledWith('memberRemoved', updatedChat);
      expect(gateway.server.to).toHaveBeenCalledWith('user:uid2');
      expect(gateway.server.emit).toHaveBeenCalledWith(
        'memberRemoved',
        updatedChat,
      );
    });

    it('emits error on failure', async () => {
      jwtService.verify.mockReturnValue({ sub: 'uid1' });
      chatsService.leaveGroup.mockRejectedValue(new Error('not found'));
      const client = mockClient();

      await gateway.leaveGroup({ chatId: 'c1' } as any, client);

      expect(client.emit).toHaveBeenCalledWith('error', {
        event: 'leaveGroup',
        message: 'Failed to leave group',
      });
    });
  });

  // ── removeMember ─────────────────────────────────────────────────────────

  describe('removeMember', () => {
    it('removes member and broadcasts memberRemoved to all participants', async () => {
      jwtService.verify.mockReturnValue({ sub: 'uid1' });
      const updatedChat = {
        id: 'c1',
        isGroup: true,
        participants: [{ user: { uid: 'uid1' } }, { user: { uid: 'uid3' } }],
      };
      chatsService.removeMember.mockResolvedValue(updatedChat as any);
      fetchSockets.mockResolvedValue([{ leave: jest.fn() }]);
      const client = mockClient();

      await gateway.removeMember(
        { chatId: 'c1', memberUid: 'uid2' } as any,
        client,
      );

      expect(chatsService.removeMember).toHaveBeenCalledWith(
        'c1',
        'uid1',
        'uid2',
      );
      expect(gateway.server.to).toHaveBeenCalledWith('user:uid1');
      expect(gateway.server.to).toHaveBeenCalledWith('user:uid3');
      expect(gateway.server.to).toHaveBeenCalledWith('user:uid2');
      expect(gateway.server.emit).toHaveBeenCalledWith(
        'memberRemoved',
        updatedChat,
      );
    });

    it('emits error on failure', async () => {
      jwtService.verify.mockReturnValue({ sub: 'uid1' });
      chatsService.removeMember.mockRejectedValue(new Error('not allowed'));
      const client = mockClient();

      await gateway.removeMember(
        { chatId: 'c1', memberUid: 'uid2' } as any,
        client,
      );

      expect(client.emit).toHaveBeenCalledWith('error', {
        event: 'removeMember',
        message: 'Failed to remove member',
      });
    });
  });
});
