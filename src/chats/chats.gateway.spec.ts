import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ChatsGateway } from './chats.gateway';
import { ChatsService } from './chats.service';
import { WsException } from '@nestjs/websockets';

describe('ChatsGateway', () => {
  let gateway: ChatsGateway;
  let chatsService: jest.Mocked<ChatsService>;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;

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

  const mockServer = () => ({
    emit: jest.fn(),
    to: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    fetchSockets: jest.fn(),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatsGateway,
        { provide: ChatsService, useValue: { getChats: jest.fn(), getUser: jest.fn(), create: jest.fn(), delete: jest.fn(), addMembers: jest.fn(), getMessages: jest.fn(), sendMessage: jest.fn(), markRead: jest.fn() } },
        { provide: JwtService, useValue: { verify: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('secret') } },
      ],
    }).compile();

    gateway = module.get(ChatsGateway);
    chatsService = module.get(ChatsService);
    jwtService = module.get(JwtService);
    configService = module.get(ConfigService);

    gateway.server = mockServer() as any;
  });

  // ── verifyClient ────────────────────────────────────────────────────────────

  describe('verifyClient', () => {
    it('returns uid for valid token', () => {
      jwtService.verify.mockReturnValue({ sub: 'uid1' });

      const client = mockClient();
      const result = gateway['verifyClient'](client);

      expect(result).toBe('uid1');
    });

    it('throws WsException when token is missing', () => {
      const client = { handshake: { auth: {} } } as any;

      expect(() => gateway['verifyClient'](client)).toThrow(WsException);
    });

    it('throws WsException when token is invalid', () => {
      jwtService.verify.mockImplementation(() => { throw new Error(); });

      expect(() => gateway['verifyClient'](mockClient())).toThrow(WsException);
    });
  });

  // ── handleConnection ────────────────────────────────────────────────────────

  describe('handleConnection', () => {
    it('accepts connection with valid token', () => {
      jwtService.verify.mockReturnValue({ sub: 'uid1' });
      const client = mockClient();
      const disconnect = jest.fn();
      client.disconnect = disconnect;

      gateway.handleConnection(client);

      expect(disconnect).not.toHaveBeenCalled();
    });

    it('rejects connection with invalid token', () => {
      jwtService.verify.mockImplementation(() => { throw new Error(); });
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

      expect(client.emit).toHaveBeenCalledWith('error', expect.objectContaining({ event: 'getChats' }));
    });
  });

  // ── getUser ─────────────────────────────────────────────────────────────────

  describe('getUser', () => {
    it('emits userSearch on success', async () => {
      jwtService.verify.mockReturnValue({ sub: 'uid1' });
      chatsService.getUser.mockResolvedValue({ userExists: true, profile: { firstName: 'John' } } as any);
      const client = mockClient();

      await gateway.getUser({ username: 'john' } as any, client);

      expect(client.emit).toHaveBeenCalledWith('userSearch', { userExists: true, profile: { firstName: 'John' } });
    });

    it('emits userExists false on failure', async () => {
      jwtService.verify.mockReturnValue({ sub: 'uid1' });
      chatsService.getUser.mockRejectedValue(new Error());
      const client = mockClient();

      await gateway.getUser({ username: 'unknown' } as any, client);

      expect(client.emit).toHaveBeenCalledWith('userSearch', { userExists: false });
    });
  });

  // ── createChat ──────────────────────────────────────────────────────────────

  describe('createChat', () => {
    it('creates chat and broadcasts chatCreated', async () => {
      jwtService.verify.mockReturnValue({ sub: 'uid1' });
      const chat = { id: 'c1', participants: [] };
      chatsService.create.mockResolvedValue(chat as any);
      const client = mockClient();

      await gateway.create({ members: ['uid2'], admin: 'uid1', isGroup: false } as any, client);

      expect(gateway.server.emit).toHaveBeenCalledWith('chatCreated', chat);
    });

    it('ensures creator is always in members', async () => {
      jwtService.verify.mockReturnValue({ sub: 'uid1' });
      chatsService.create.mockResolvedValue({ id: 'c1' } as any);
      const client = mockClient();

      await gateway.create({ members: ['uid2'], admin: 'uid1' } as any, client);

      expect(chatsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ members: expect.arrayContaining(['uid1', 'uid2']) }),
      );
    });

    it('emits error on failure', async () => {
      jwtService.verify.mockReturnValue({ sub: 'uid1' });
      chatsService.create.mockRejectedValue(new Error());
      const client = mockClient();

      await gateway.create({} as any, client);

      expect(client.emit).toHaveBeenCalledWith('error', expect.objectContaining({ event: 'createChat' }));
    });
  });

  // ── deleteChat ──────────────────────────────────────────────────────────────

  describe('deleteChat', () => {
    it('deletes chat and broadcasts chatDeleted', async () => {
      jwtService.verify.mockReturnValue({ sub: 'uid1' });
      chatsService.delete.mockResolvedValue({ id: 'c1', deleted: true });
      const client = mockClient();

      await gateway.deleteChat({ chatId: 'c1' } as any, client);

      expect(gateway.server.emit).toHaveBeenCalledWith('chatDeleted', { id: 'c1', deleted: true });
    });

    it('emits error on failure', async () => {
      jwtService.verify.mockReturnValue({ sub: 'uid1' });
      chatsService.delete.mockRejectedValue(new Error());
      const client = mockClient();

      await gateway.deleteChat({ chatId: 'c1' } as any, client);

      expect(client.emit).toHaveBeenCalledWith('error', expect.objectContaining({ event: 'deleteChat' }));
    });
  });

  // ── addMember ───────────────────────────────────────────────────────────────

  describe('addMember', () => {
    it('adds member and broadcasts memberAdded', async () => {
      jwtService.verify.mockReturnValue({ sub: 'uid1' });
      const chat = { id: 'c1', participants: [] };
      chatsService.addMembers.mockResolvedValue(chat as any);
      const client = mockClient();

      await gateway.addMember({ chatId: 'c1', members: ['uid3'] } as any, client);

      expect(gateway.server.emit).toHaveBeenCalledWith('memberAdded', chat);
    });

    it('emits error on failure', async () => {
      jwtService.verify.mockReturnValue({ sub: 'uid1' });
      chatsService.addMembers.mockRejectedValue(new Error());
      const client = mockClient();

      await gateway.addMember({ chatId: 'c1', members: [] } as any, client);

      expect(client.emit).toHaveBeenCalledWith('error', expect.objectContaining({ event: 'addMember' }));
    });
  });

  // ── joinChat ────────────────────────────────────────────────────────────────

  describe('joinChat', () => {
    it('joins room and emits messages', async () => {
      jwtService.verify.mockReturnValue({ sub: 'uid1' });
      chatsService.getMessages.mockResolvedValue([{ id: 'm1' } as any]);
      const client = mockClient();

      await gateway.joinChat({ chatId: 'c1' } as any, client);

      expect(client.join).toHaveBeenCalledWith('c1');
      expect(client.emit).toHaveBeenCalledWith('messages', [{ id: 'm1' }]);
    });

    it('emits error on failure', async () => {
      jwtService.verify.mockReturnValue({ sub: 'uid1' });
      chatsService.getMessages.mockRejectedValue(new Error());
      const client = mockClient();

      await gateway.joinChat({ chatId: 'c1' } as any, client);

      expect(client.emit).toHaveBeenCalledWith('error', expect.objectContaining({ event: 'joinChat' }));
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
      const msg = { id: 'm1', senderId: 'uid1', text: 'Hi', sentAt: new Date(), status: 'sent' };
      chatsService.sendMessage.mockResolvedValue(msg);
      gateway.server.fetchSockets = jest.fn().mockResolvedValue([{}, {}]);

      const client = mockClient();
      await gateway.sendMessage({ chatId: 'c1', text: 'Hi' } as any, client);

      expect(gateway.server.to).toHaveBeenCalledWith('c1');
      expect(gateway.server.emit).toHaveBeenCalledWith('newMessage', { ...msg, chatId: 'c1' });
    });

    it('emits messageStatus delivered when more than 1 socket in room', async () => {
      jwtService.verify.mockReturnValue({ sub: 'uid1' });
      const msg = { id: 'm1', senderId: 'uid1', text: 'Hi', sentAt: new Date(), status: 'sent' };
      chatsService.sendMessage.mockResolvedValue(msg);
      gateway.server.fetchSockets = jest.fn().mockResolvedValue([{}, {}]);

      const client = mockClient();
      await gateway.sendMessage({ chatId: 'c1', text: 'Hi' } as any, client);

      expect(gateway.server.to).toHaveBeenCalledWith('c1');
      expect(gateway.server.emit).toHaveBeenCalledWith('messageStatus', { messageId: 'm1', status: 'delivered' });
    });
  });

  // ── markRead ────────────────────────────────────────────────────────────────

  describe('markRead', () => {
    it('marks messages read and broadcasts status', async () => {
      jwtService.verify.mockReturnValue({ sub: 'uid1' });
      chatsService.markRead.mockResolvedValue([{ id: 'm1', senderId: 'uid2' }, { id: 'm2', senderId: 'uid2' }] as any);
      const client = mockClient();

      await gateway.markRead({ chatId: 'c1' } as any, client);

      expect(gateway.server.to).toHaveBeenCalledWith('c1');
      expect(gateway.server.emit).toHaveBeenCalledTimes(2);
    });
  });
});
