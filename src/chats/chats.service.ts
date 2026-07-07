import { Injectable } from '@nestjs/common';
import { CreateChatDto } from './dto/create-chat.dto';
import { ProfileService } from 'src/profile/profile.service';
import { DataSource, In, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Chat } from './entities/chat.entity';
import { ChatMember } from './entities/chat-members.entity';
import { Message } from './entities/messages.entity';
import { User } from 'src/user/entities/user.entity';

@Injectable()
export class ChatsService {
  constructor(
    private profileService: ProfileService,
    private dataSource: DataSource,
    @InjectRepository(Chat)
    private chatRepository: Repository<Chat>,
    @InjectRepository(ChatMember)
    private chatMemberRepository: Repository<ChatMember>,
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
  ) {}

  // ── Create chat ──────────────────────────────────────────────────────────
  async create(createChatDto: CreateChatDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const { isGroup, members, name, admin } = createChatDto;

      // Deduplicate member UIDs (admin may already be in members list)
      const allUids = [
        ...new Set([...(members ?? []), ...(admin ? [admin] : [])]),
      ];

      const users = await queryRunner.manager.findBy(User, {
        uid: In(allUids),
      });

      const chat = queryRunner.manager.create(Chat, {
        name: name ?? null,
        isGroup: isGroup ?? false,
        createdAt: new Date(),
      });

      const savedChat = await queryRunner.manager.save(Chat, chat);

      const memberEntities = users.map((user) =>
        queryRunner.manager.create(ChatMember, {
          user,
          chat: savedChat,
          chatId: savedChat.id,
          role: admin && user.uid === admin ? 'admin' : 'member',
        }),
      );

      await queryRunner.manager.save(ChatMember, memberEntities);
      await queryRunner.commitTransaction();

      // Return a fully populated chat object for the broadcast
      return this.getChatById(savedChat.id);
    } catch (err) {
      await queryRunner.rollbackTransaction();
      console.error('createChat error:', err);
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // ── Get all chats for a user ─────────────────────────────────────────────

  async getChats(uid: string) {
    const members = await this.chatMemberRepository.find({
      where: { user: { uid } },
      relations: { chat: { members: { user: { profile: true } } } },
    });

    return members.map(({ chat, unreadCount }) =>
      this.formatChat(chat, unreadCount),
    );
  }

  // ── Get a single chat by id ──────────────────────────────────────────────

  async getChatById(chatId: string) {
    const chat = await this.chatRepository.findOneOrFail({
      where: { id: chatId },
      relations: { members: { user: { profile: true } } },
    });
    return this.formatChat(chat, 0);
  }

  // ── Get messages for a chat room ─────────────────────────────────────────

  async getMessages(chatId: string) {
    const messages = await this.messageRepository.find({
      where: { chatId },
      order: { createdAt: 'ASC' },
    });

    return messages.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      text: m.content,
      sentAt: m.createdAt,
      status: m.status,
    }));
  }

  // ── Send a message ────────────────────────────────────────────────────────

  async sendMessage(chatId: string, senderId: string, text: string) {
    const message = this.messageRepository.create({
      chatId,
      senderId,
      content: text,
      status: 'sent',
    });

    const saved = await this.messageRepository.save(message);

    // Update denormalised preview on the chat row
    await this.chatRepository.update(chatId, {
      lastMessageText: text,
      lastMessageAt: saved.createdAt,
    });

    return {
      id: saved.id,
      senderId: saved.senderId,
      text: saved.content,
      sentAt: saved.createdAt,
      status: saved.status,
    };
  }

  // ── Mark all messages in a chat as read for a user ───────────────────────

  async markRead(chatId: string, uid: string) {
    // Update unread counter for this member
    await this.chatMemberRepository.update(
      { chatId, user: { uid } },
      { unreadCount: 0, lastReadAt: new Date() },
    );

    // Mark unread messages as read (those not sent by the current user)
    await this.messageRepository
      .createQueryBuilder()
      .update(Message)
      .set({ status: 'read' })
      .where('chatId = :chatId', { chatId })
      .andWhere('senderId != :uid', { uid })
      .andWhere('status != :status', { status: 'read' })
      .execute();

    // Return ids of messages that were updated so the sender can be notified
    const updated = await this.messageRepository.find({
      where: { chatId, status: 'read' },
      select: ['id', 'senderId'],
    });

    return updated;
  }

  // ── Search user ───────────────────────────────────────────────────────────

  async getUser(username: string) {
    return this.profileService.findUserByName(username);
  }

  // ── Private helper ────────────────────────────────────────────────────────

  private formatChat(chat: Chat, unreadCount: number) {
    return {
      id: chat.id,
      isGroup: chat.isGroup,
      name: chat.name ?? '',
      avatarUrl: chat.avatarUrl ?? '',
      participants: chat.members.map((m) => ({
        user: {
          uid: m.user.uid,
          profile: {
            firstName: m.user.profile?.firstName ?? '',
            lastName: m.user.profile?.lastName ?? '',
            username: m.user.profile?.username ?? '',
            avatarUrl: m.user.profile?.avatarUrl ?? '',
          },
        },
      })),
      lastMessage: chat.lastMessageText ?? '',
      lastMessageAt: chat.lastMessageAt ?? chat.createdAt,
      unread: unreadCount,
    };
  }
}
