import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
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
    manager: { create: jest.fn(), save: jest.fn(), findBy: jest.fn() },
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
    lastMessageAt: null,
    createdAt: new Date(),
    members: [
      { user: mockUser, unreadCount: 0 },
      { user: mockUser2, unreadCount: 0 },
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
            update: jest.fn(),
            remove: jest.fn(),
            findOneBy: jest.fn(),
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
            createQueryBuilder: jest.fn(),
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
      chatRepository.findOne.mockResolvedValue(mockChat);

      const result = await service.create(dto as any);

      expect(result.id).toBe('chat-id');
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('returns existing private chat instead of creating duplicate', async () => {
      const existingChat = { ...mockChat, id: 'existing-chat', isGroup: false };
      const qb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        having: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([{ cm_chat_id: 'existing-chat' }]),
        subQuery: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        getQuery: jest.fn().mockReturnValue('subquery'),
      } as any;
      chatMemberRepository.createQueryBuilder.mockReturnValue(qb);
      chatRepository.findOne.mockResolvedValue(existingChat);

      const result = await service.create({
        members: ['uid2'],
        admin: 'uid1',
      } as any);

      expect(result.id).toBe('existing-chat');
    });

    it('rolls back on error', async () => {
      chatMemberRepository.find.mockResolvedValue([]);
      mockQueryRunner.manager.findBy.mockRejectedValue(new Error('db error'));

      await expect(
        service.create({
          members: ['uid2'],
          admin: 'uid1',
          isGroup: true,
        } as any),
      ).rejects.toThrow();
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('deletes private chat when requester is a member', async () => {
      const chat = {
        ...mockChat,
        isGroup: false,
        members: [{ user: { uid: 'uid1' }, role: 'member' }],
      };
      chatRepository.findOne.mockResolvedValue(chat);

      const result = await service.delete('chat-id', 'uid1');

      expect(result).toEqual({
        id: 'chat-id',
        deleted: true,
        participantUids: ['uid1'],
      });
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

    it('throws ForbiddenException when not a member', async () => {
      chatRepository.findOne.mockResolvedValue({
        ...mockChat,
        members: [{ user: { uid: 'uid2' }, role: 'admin' }],
      });

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
  });

  describe('assertMember', () => {
    it('passes when user is a member', async () => {
      chatMemberRepository.findOne.mockResolvedValue({} as any);

      await expect(
        service.assertMember('chat-id', 'uid1'),
      ).resolves.toBeUndefined();
    });

    it('throws when user is not a member', async () => {
      chatMemberRepository.findOne.mockResolvedValue(null);

      await expect(service.assertMember('chat-id', 'uid1')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

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
      chatRepository.findOne.mockResolvedValue(chat);

      const result = await service.addMembers('chat-id', ['uid2'], 'uid1');

      expect(result.id).toBe('chat-id');
    });
  });

  describe('getMessages', () => {
    it('returns mapped messages ordered by createdAt ASC', async () => {
      const msgs = [
        {
          id: 'm2',
          senderId: 'uid2',
          content: 'Hello',
          createdAt: new Date(2),
          status: 'read' as const,
        },
        {
          id: 'm1',
          senderId: 'uid1',
          content: 'Hi',
          createdAt: new Date(1),
          status: 'sent' as const,
        },
      ] as Message[];
      messageRepository.find.mockResolvedValue(msgs);

      chatMemberRepository.findOne.mockResolvedValue({} as any);

      const result = await service.getMessages('chat-id', 0, 'uid1');

      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('Hi');
    });
  });

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

      const result = await service.sendMessage('chat-id', 'uid1', 'Hello');

      expect(result.text).toBe('Hello');
      expect(chatRepository.update).toHaveBeenCalledWith('chat-id', {
        lastMessageText: 'Hello',
        lastMessageAt: saved.createdAt,
      });
    });
  });

  describe('markRead', () => {
    it('updates unread count and returns read message ids', async () => {
      chatMemberRepository.findOne.mockResolvedValue({} as any);
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
      messageRepository.createQueryBuilder.mockReturnValue(qb);
      messageRepository.find.mockResolvedValue(updatedMsgs);

      const result = await service.markRead('chat-id', 'uid1');

      expect(result).toEqual(updatedMsgs);
    });
  });
});
