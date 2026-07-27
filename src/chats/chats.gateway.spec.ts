import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ChatsGateway } from './chats.gateway';
import { ChatsService } from './chats.service';

describe('ChatsGateway', () => {
  let gateway: ChatsGateway;
  let chatsService: jest.Mocked<ChatsService>;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;

  const mockClient = () =>
    ({
      emit: jest.fn(),
      join: jest.fn(),
      leave: jest.fn(),
      id: 'socket-id',
      data: { uid: 'uid1' },
      handshake: { auth: { token: 'valid-token' } },
      disconnect: jest.fn(),
    }) as any;

  const mockServer = () => ({
    emit: jest.fn(),
    to: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
  });

  beforeEach(async () => {
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
            getMessages: jest.fn(),
            sendMessage: jest.fn(),
            markRead: jest.fn(),
            assertMember: jest.fn(),
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
    configService = module.get(ConfigService);

    gateway.server = mockServer() as any;
  });

  // ── handleConnection ────────────────────────────────────────────────────────

  describe('handleConnection', () => {
    it('accepts connection with valid token', () => {
      jwtService.verify.mockReturnValue({ sub: 'uid1' });
      const client = mockClient();

      gateway.handleConnection(client);

      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('rejects connection with invalid token', () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error();
      });
      const client = mockClient();

      gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalledWith(true);
    });
  });

  // ── getChats ────────────────────────────────────────────────────────────────

  describe('getChats', () => {
    it('emits chats on success', async () => {
      chatsService.getChats.mockResolvedValue([{ id: 'c1' } as any]);
      const client = mockClient();

      await gateway.getChats({ username: 'uid1' } as any, client);

      expect(client.emit).toHaveBeenCalledWith('chats', [{ id: 'c1' }]);
    });

    it('emits error on failure', async () => {
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
    it('creates chat and broadcasts chatCreated', async () => {
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

      expect(chatsService.create).toHaveBeenCalled();
    });

    it('ensures creator is always in members', async () => {
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
    it('deletes chat and broadcasts chatDeleted', async () => {
      chatsService.delete.mockResolvedValue({
        id: 'c1',
        deleted: true,
        participantUids: ['uid1', 'uid2'],
      } as any);
      const client = mockClient();

      await gateway.deleteChat({ chatId: 'c1' } as any, client);

      expect(chatsService.delete).toHaveBeenCalledWith('c1', 'uid1');
    });

    it('emits error on failure', async () => {
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
    it('adds member and broadcasts memberAdded', async () => {
      const chat = { id: 'c1', participants: [{ user: { uid: 'uid1' } }] };
      chatsService.addMembers.mockResolvedValue(chat as any);
      const client = mockClient();

      await gateway.addMember(
        { chatId: 'c1', members: ['uid3'] } as any,
        client,
      );

      expect(chatsService.addMembers).toHaveBeenCalledWith(
        'c1',
        ['uid3'],
        'uid1',
      );
    });

    it('emits error on failure', async () => {
      chatsService.addMembers.mockRejectedValue(new Error());
      const client = mockClient();

      await gateway.addMember({ chatId: 'c1', members: [] } as any, client);

      expect(client.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ event: 'addMember' }),
      );
    });
  });

  // ── joinChat ────────────────────────────────────────────────────────────────

  describe('joinChat', () => {
    it('joins room and emits messages', async () => {
      chatsService.getMessages.mockResolvedValue([{ id: 'm1' } as any]);
      const client = mockClient();

      await gateway.joinChat({ chatId: 'c1' } as any, client);

      expect(chatsService.assertMember).toHaveBeenCalledWith('c1', 'uid1');
      expect(client.join).toHaveBeenCalledWith('c1');
      expect(client.emit).toHaveBeenCalledWith('messages', [{ id: 'm1' }]);
    });

    it('emits error on failure', async () => {
      chatsService.getMessages.mockRejectedValue(new Error());
      const client = mockClient();

      await gateway.joinChat({ chatId: 'c1' } as any, client);

      expect(client.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ event: 'joinChat' }),
      );
    });
  });

  // ── sendMessage ─────────────────────────────────────────────────────────────

  describe('sendMessage', () => {
    it('sends message and broadcasts to room', async () => {
      const msg = {
        id: 'm1',
        senderId: 'uid1',
        text: 'Hi',
        sentAt: new Date(),
        status: 'sent' as const,
      };
      chatsService.sendMessage.mockResolvedValue(msg);
      const client = mockClient();

      await gateway.sendMessage({ chatId: 'c1', text: 'Hi' } as any, client);

      expect(gateway.server.to).toHaveBeenCalledWith('c1');
    });

    it('emits error on failure', async () => {
      chatsService.sendMessage.mockRejectedValue(new Error());
      const client = mockClient();

      await gateway.sendMessage({ chatId: 'c1', text: 'Hi' } as any, client);

      expect(client.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ event: 'sendMessage' }),
      );
    });
  });

  // ── markRead ────────────────────────────────────────────────────────────────

  describe('markRead', () => {
    it('marks messages read and broadcasts status', async () => {
      chatsService.markRead.mockResolvedValue([
        { id: 'm1', senderId: 'uid2' },
      ] as any);
      const client = mockClient();

      await gateway.markRead({ chatId: 'c1' } as any, client);

      expect(gateway.server.to).toHaveBeenCalledWith('c1');
    });
  });
});
