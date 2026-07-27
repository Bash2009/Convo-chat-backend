import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChatsService } from './chats.service';
import { ProfileService } from '../profile/profile.service';
import { Chat } from './entities/chat.entity';
import { ChatMember } from './entities/chat-members.entity';
import { Message } from './entities/messages.entity';

describe('ChatsService', () => {
  let service: ChatsService;
  let dataSource: jest.Mocked<DataSource>;
  let chatRepository: jest.Mocked<Repository<Chat>>;
  let chatMemberRepository: jest.Mocked<Repository<ChatMember>>;
  let messageRepository: jest.Mocked<Repository<Message>>;

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      create: jest.fn(),
      save: jest.fn(),
      findBy: jest.fn(),
    },
  };

  const mockUser = {
    uid: 'uid1',
    email: 'a@b.com',
    profile: {
      firstName: 'John',
      lastName: 'Doe',
      username: 'johndoe',
      avatarUrl: '',
    },
  } as any;
  const mockUser2 = {
    uid: 'uid2',
    email: 'b@b.com',
    profile: {
      firstName: 'Jane',
      lastName: 'Doe',
      username: 'janedoe',
      avatarUrl: '',
    },
  } as any;

  const mockChat = {
    id: 'chat-id',
    isGroup: false,
    name: '',
    avatarUrl: '',
    lastMessageText: '',
    lastMessageSenderId: undefined,
    lastMessageStatus: undefined,
    lastMessageAt: null,
    createdAt: new Date(),
    admin: undefined,
    members: [
      { user: mockUser, unreadCount: 0, role: 'member' },
      { user: mockUser2, unreadCount: 0, role: 'member' },
    ],
  } as any;

  beforeEach(async () => {
    const queryRunnerMock = { ...mockQueryRunner };
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatsService,
        { provide: ProfileService, useValue: { findUserByName: jest.fn() } },
        {
          provide: DataSource,
          useValue: {
            createQueryRunner: jest.fn().mockReturnValue(queryRunnerMock),
            manager: { findBy: jest.fn() },
          },
        },
        {
          provide: getRepositoryToken(Chat),
          useValue: {
            findOne: jest.fn(),
            findOneOrFail: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(ChatMember),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            remove: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Message),
          useValue: {
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(ChatsService);
    dataSource = module.get(DataSource);
    chatRepository = module.get(getRepositoryToken(Chat));
    chatMemberRepository = module.get(getRepositoryToken(ChatMember));
    messageRepository = module.get(getRepositoryToken(Message));
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a chat and returns it', async () => {
      const dto = {
        members: ['uid2'],
        admin: 'uid1',
        isGroup: true,
        name: 'Group',
      };
      chatMemberRepository.find.mockResolvedValue([]);

      mockQueryRunner.manager.findBy.mockResolvedValue([mockUser, mockUser2]);
      mockQueryRunner.manager.create.mockReturnValueOnce(mockChat);
      mockQueryRunner.manager.save.mockResolvedValueOnce(mockChat);
      mockQueryRunner.manager.create.mockReturnValueOnce({});
      mockQueryRunner.manager.save.mockResolvedValueOnce([{}]);
      chatRepository.findOneOrFail.mockResolvedValue(mockChat);

      const result = await service.create(dto as any);

      expect(result.id).toBe('chat-id');
      expect(mockQueryRunner.connect).toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('returns existing private chat instead of creating duplicate', async () => {
      const dto = { members: ['uid2'], admin: 'uid1' };
      const existingChat = { ...mockChat, id: 'existing-chat', isGroup: false };
      chatMemberRepository.find.mockResolvedValue([
        { chat: existingChat } as ChatMember,
      ]);
      chatRepository.findOneOrFail.mockResolvedValue(existingChat);

      const result = await service.create(dto as any);

      expect(result.id).toBe('existing-chat');
      expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
    });

    it('rolls back on error', async () => {
      const dto = { members: ['uid2'], admin: 'uid1', isGroup: true };
      chatMemberRepository.find.mockResolvedValue([]);
      mockQueryRunner.manager.findBy.mockRejectedValue(new Error('db error'));

      await expect(service.create(dto as any)).rejects.toThrow();
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });

  // ── delete ──────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('deletes private chat when requester is a member', async () => {
      const chat = {
        ...mockChat,
        isGroup: false,
        members: [{ user: { uid: 'uid1' }, role: 'member' }],
      };
      chatRepository.findOne.mockResolvedValue(chat);

      const result = await service.delete('chat-id', 'uid1');

      expect(result).toEqual({ id: 'chat-id', deleted: true });
      expect(chatRepository.remove).toHaveBeenCalledWith(chat);
    });

    it('deletes group chat when requester is an admin', async () => {
      const chat = {
        ...mockChat,
        isGroup: true,
        members: [{ user: { uid: 'uid1' }, role: 'admin' }],
      };
      chatRepository.findOne.mockResolvedValue(chat);

      const result = await service.delete('chat-id', 'uid1');

      expect(result.deleted).toBe(true);
    });

    it('throws ForbiddenException when a regular member tries to delete a group', async () => {
      const chat = {
        ...mockChat,
        isGroup: true,
        members: [{ user: { uid: 'uid1' }, role: 'member' }],
      };
      chatRepository.findOne.mockResolvedValue(chat);

      await expect(service.delete('chat-id', 'uid1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws NotFoundException when chat not found', async () => {
      chatRepository.findOne.mockResolvedValue(null);

      await expect(service.delete('unknown', 'uid1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when not a member', async () => {
      const chat = {
        ...mockChat,
        isGroup: false,
        members: [{ user: { uid: 'uid2' }, role: 'admin' }],
      };
      chatRepository.findOne.mockResolvedValue(chat);

      await expect(service.delete('chat-id', 'uid1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ── addMembers ──────────────────────────────────────────────────────────────

  describe('addMembers', () => {
    it('adds new members to a group chat', async () => {
      const chat = {
        ...mockChat,
        isGroup: true,
        members: [{ user: { uid: 'uid1' }, role: 'admin' }],
      };
      chatRepository.findOne.mockResolvedValue(chat);
      dataSource.manager.findBy.mockResolvedValue([mockUser2]);
      chatMemberRepository.create.mockReturnValue({} as any);
      chatMemberRepository.save.mockResolvedValue([{} as any]);
      chatRepository.findOneOrFail.mockResolvedValue(chat);

      const result = await service.addMembers('chat-id', ['uid2'], 'uid1');

      expect(result.id).toBe('chat-id');
      expect(chatMemberRepository.create).toHaveBeenCalled();
      expect(chatMemberRepository.save).toHaveBeenCalled();
    });

    it('throws ForbiddenException when chat is not a group', async () => {
      const chat = {
        ...mockChat,
        isGroup: false,
        members: [{ user: { uid: 'uid1' }, role: 'admin' }],
      };
      chatRepository.findOne.mockResolvedValue(chat);

      await expect(
        service.addMembers('chat-id', ['uid2'], 'uid1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when requester is not a member', async () => {
      const chat = {
        ...mockChat,
        isGroup: true,
        members: [{ user: { uid: 'uid2' }, role: 'admin' }],
      };
      chatRepository.findOne.mockResolvedValue(chat);

      await expect(
        service.addMembers('chat-id', ['uid3'], 'uid1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when requester is not an admin', async () => {
      const chat = {
        ...mockChat,
        isGroup: true,
        members: [{ user: { uid: 'uid1' }, role: 'member' }],
      };
      chatRepository.findOne.mockResolvedValue(chat);

      await expect(
        service.addMembers('chat-id', ['uid2'], 'uid1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('skips already existing members', async () => {
      const chat = {
        ...mockChat,
        isGroup: true,
        members: [
          { user: { uid: 'uid1' }, role: 'admin' },
          { user: { uid: 'uid2' }, role: 'member' },
        ],
      };
      chatRepository.findOne.mockResolvedValue(chat);
      chatRepository.findOneOrFail.mockResolvedValue(chat);

      const result = await service.addMembers('chat-id', ['uid2'], 'uid1');

      expect(result.id).toBe('chat-id');
      expect(dataSource.manager.findBy).not.toHaveBeenCalled();
    });
  });

  // ── getChats ────────────────────────────────────────────────────────────────

  describe('getChats', () => {
    it('returns formatted chats for a user', async () => {
      chatMemberRepository.find.mockResolvedValue([
        { chat: mockChat, unreadCount: 3 } as any,
      ]);

      const result = await service.getChats('uid1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('chat-id');
      expect(result[0].unread).toBe(3);
    });
  });

  // ── getChatById ─────────────────────────────────────────────────────────────

  describe('getChatById', () => {
    it('returns formatted chat', async () => {
      chatRepository.findOneOrFail.mockResolvedValue(mockChat);

      const result = await service.getChatById('chat-id');

      expect(result.id).toBe('chat-id');
      expect(result.participants).toHaveLength(2);
    });

    it('throws when not found', async () => {
      chatRepository.findOneOrFail.mockRejectedValue(new Error());

      await expect(service.getChatById('unknown')).rejects.toThrow();
    });
  });

  // ── getMessages ─────────────────────────────────────────────────────────────

  describe('getMessages', () => {
    it('returns mapped messages ordered by createdAt ASC', async () => {
      chatMemberRepository.findOne.mockResolvedValue({} as any);
      const msgs = [
        {
          id: 'm1',
          senderId: 'uid1',
          content: 'Hi',
          createdAt: new Date(1),
          status: 'sent',
        },
        {
          id: 'm2',
          senderId: 'uid2',
          content: 'Hello',
          createdAt: new Date(2),
          status: 'read',
        },
      ] as Message[];
      messageRepository.find.mockResolvedValue(msgs);

      const result = await service.getMessages('chat-id', 'uid1');

      expect(chatMemberRepository.findOne).toHaveBeenCalledWith({
        where: { chatId: 'chat-id', user: { uid: 'uid1' } },
      });
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'm1',
        senderId: 'uid1',
        text: 'Hi',
        sentAt: msgs[0].createdAt,
        status: 'sent',
      });
    });
  });

  // ── sendMessage ─────────────────────────────────────────────────────────────

  describe('sendMessage', () => {
    it('creates message and updates chat preview', async () => {
      chatMemberRepository.findOne.mockResolvedValue({} as any);
      const saved = {
        id: 'm1',
        senderId: 'uid1',
        content: 'Hello',
        createdAt: new Date(),
        status: 'sent',
      } as Message;
      messageRepository.create.mockReturnValue(saved);
      messageRepository.save.mockResolvedValue(saved);

      const qb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(undefined),
      } as any;
      dataSource.createQueryBuilder = jest.fn().mockReturnValue(qb);

      chatMemberRepository.find.mockResolvedValue([
        { user: { uid: 'uid2' }, unreadCount: 1 },
      ] as any);

      const result = await service.sendMessage('chat-id', 'uid1', 'Hello');

      expect(result.message.text).toBe('Hello');
      expect(result.unreadByUid).toEqual({ uid2: 1 });
      expect(chatMemberRepository.findOne).toHaveBeenCalledWith({
        where: { chatId: 'chat-id', user: { uid: 'uid1' } },
      });
      expect(chatRepository.update).toHaveBeenCalledWith('chat-id', {
        lastMessageText: 'Hello',
        lastMessageSenderId: 'uid1',
        lastMessageStatus: 'sent',
        lastMessageAt: saved.createdAt,
      });
      expect(qb.execute).toHaveBeenCalled();
    });
  });

  // ── markRead ────────────────────────────────────────────────────────────────

  describe('markRead', () => {
    it('updates unread count and returns read message ids', async () => {
      const updatedMsgs = [
        { id: 'm1', senderId: 'uid2' },
        { id: 'm2', senderId: 'uid2' },
      ] as Message[];

      const qb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(undefined),
      } as any;
      chatMemberRepository.findOne.mockResolvedValue({} as any);
      messageRepository.createQueryBuilder.mockReturnValue(qb);
      messageRepository.find.mockResolvedValue(updatedMsgs);

      const result = await service.markRead('chat-id', 'uid1');

      expect(result).toEqual(updatedMsgs);
      expect(chatMemberRepository.update).toHaveBeenCalledWith(
        { chatId: 'chat-id', user: { uid: 'uid1' } },
        { unreadCount: 0, lastReadAt: expect.any(Date) },
      );
    });
  });

  // ── leaveGroup ──────────────────────────────────────────────────────────────

  describe('leaveGroup', () => {
    it('deletes chat when admin leaves a group', async () => {
      const groupChat = {
        id: 'chat-id',
        isGroup: true,
        members: [
          { user: { uid: 'uid1' }, role: 'admin' },
          { user: { uid: 'uid2' }, role: 'member' },
        ],
      } as any;
      chatRepository.findOne.mockResolvedValue(groupChat);
      chatRepository.remove.mockResolvedValue(undefined);

      const result = await service.leaveGroup('chat-id', 'uid1');

      expect(result.action).toBe('deleted');
      expect(result.id).toBe('chat-id');
      expect(result.memberUids).toEqual(['uid1', 'uid2']);
      expect(chatRepository.remove).toHaveBeenCalledWith(groupChat);
    });

    it('removes member row when regular member leaves a group', async () => {
      const memberRecord = { id: 'm1', user: { uid: 'uid1' } };
      const groupChat = {
        id: 'chat-id',
        isGroup: true,
        members: [memberRecord, { user: { uid: 'uid2' }, role: 'admin' }],
      } as any;
      chatRepository.findOne.mockResolvedValue(groupChat);
      chatRepository.findOneOrFail.mockResolvedValue(groupChat);

      const result = await service.leaveGroup('chat-id', 'uid1');

      expect(result.action).toBe('removed');
      expect(result.chatId).toBe('chat-id');
      expect(result.uid).toBe('uid1');
      expect(result.updatedChat).toBeDefined();
      expect(result.updatedChat.id).toBe('chat-id');
      expect(chatMemberRepository.remove).toHaveBeenCalledWith(memberRecord);
    });

    it('deletes private chat when user leaves', async () => {
      const privateChat = {
        id: 'chat-id',
        isGroup: false,
        members: [
          { user: { uid: 'uid1' }, role: 'member' },
          { user: { uid: 'uid2' }, role: 'member' },
        ],
      } as any;
      chatRepository.findOne.mockResolvedValue(privateChat);
      chatRepository.remove.mockResolvedValue(undefined);

      const result = await service.leaveGroup('chat-id', 'uid1');

      expect(result.action).toBe('deleted');
      expect(result.id).toBe('chat-id');
    });

    it('throws when user is not a member', async () => {
      chatRepository.findOne.mockResolvedValue({
        id: 'chat-id',
        isGroup: true,
        members: [{ user: { uid: 'uid2' }, role: 'admin' }],
      } as any);

      await expect(service.leaveGroup('chat-id', 'uid1')).rejects.toThrow(
        'Not a member',
      );
    });

    it('throws when chat does not exist', async () => {
      chatRepository.findOne.mockResolvedValue(null);

      await expect(service.leaveGroup('chat-id', 'uid1')).rejects.toThrow(
        'Chat not found',
      );
    });
  });

  // ── removeMember ───────────────────────────────────────────────────────────

  describe('removeMember', () => {
    it('removes a member and returns updated chat', async () => {
      const groupChat = {
        id: 'chat-id',
        isGroup: true,
        members: [
          { user: { uid: 'uid1' }, role: 'admin' },
          { user: { uid: 'uid2' }, role: 'member' },
          { user: { uid: 'uid3' }, role: 'member' },
        ],
      } as any;
      chatRepository.findOne.mockResolvedValue(groupChat);
      chatMemberRepository.remove.mockResolvedValue(undefined);
      chatRepository.findOneOrFail.mockResolvedValue({
        ...groupChat,
        members: groupChat.members.filter((m: any) => m.user.uid !== 'uid2'),
      });

      const result = await service.removeMember('chat-id', 'uid1', 'uid2');

      expect(result.id).toBe('chat-id');
      expect(chatMemberRepository.remove).toHaveBeenCalledWith(
        expect.objectContaining({ user: { uid: 'uid2' } }),
      );
    });

    it('throws when requester is not admin', async () => {
      const groupChat = {
        id: 'chat-id',
        isGroup: true,
        members: [
          { user: { uid: 'uid1' }, role: 'member' },
          { user: { uid: 'uid2' }, role: 'member' },
        ],
      } as any;
      chatRepository.findOne.mockResolvedValue(groupChat);

      await expect(
        service.removeMember('chat-id', 'uid1', 'uid2'),
      ).rejects.toThrow('Only admins can remove members');
    });

    it('throws when chat is not a group', async () => {
      chatRepository.findOne.mockResolvedValue({
        ...mockChat,
        isGroup: false,
        members: [{ user: { uid: 'uid1' }, role: 'admin' }],
      });

      await expect(
        service.removeMember('chat-id', 'uid1', 'uid2'),
      ).rejects.toThrow('Not a group chat');
    });

    it('throws when target member is not found', async () => {
      chatRepository.findOne.mockResolvedValue({
        id: 'chat-id',
        isGroup: true,
        members: [{ user: { uid: 'uid1' }, role: 'admin' }],
      });

      await expect(
        service.removeMember('chat-id', 'uid1', 'uid2'),
      ).rejects.toThrow('Member not found');
    });

    it('throws when requester tries to remove themselves', async () => {
      chatRepository.findOne.mockResolvedValue({
        id: 'chat-id',
        isGroup: true,
        members: [{ user: { uid: 'uid1' }, role: 'admin' }],
      });

      await expect(
        service.removeMember('chat-id', 'uid1', 'uid1'),
      ).rejects.toThrow('Cannot remove yourself');
    });
  });
});
