import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateChatDto } from './dto/create-chat.dto';
import { ProfileService } from 'src/profile/profile.service';
import { DataSource, In, LessThan, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Chat } from './entities/chat.entity';
import { ChatMember } from './entities/chat-members.entity';
import { Message } from './entities/messages.entity';
import { User } from 'src/user/entities/user.entity';

@Injectable()
export class ChatsService {
  private readonly logger = new Logger(ChatsService.name);

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
    const { isGroup, members, name, admin } = createChatDto;

    // Deduplicate member UIDs (admin may already be in members list)
    const allUids = [
      ...new Set([...(members ?? []), ...(admin ? [admin] : [])]),
    ];

    // If it's a private chat, return existing one instead of creating a duplicate
    if (!isGroup) {
      const existing = await this.findExistingPrivateChat(allUids);
      if (existing) return this.getChatById(existing.id);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
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
      this.logger.error(`createChat error: ${(err as Error).message}`);
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // ── Delete a chat ──────────────────────────────────────────────────────────

  async delete(chatId: string, requesterUid: string) {
    const chat = await this.chatRepository.findOne({
      where: { id: chatId },
      relations: { members: { user: true } },
    });
    if (!chat) throw new NotFoundException('Chat not found');

    const requesterMember = chat.members.find(
      (m) => m.user?.uid === requesterUid,
    );
    if (!requesterMember)
      throw new ForbiddenException('Not a member of this chat');
    if (chat.isGroup && requesterMember.role !== 'admin')
      throw new ForbiddenException('Only admins can delete a group chat');

    await this.chatRepository.remove(chat);
    return { id: chatId, deleted: true };
  }

  // ── Add members to a group chat ───────────────────────────────────────────

  async addMembers(chatId: string, newUids: string[], requesterUid: string) {
    const chat = await this.chatRepository.findOne({
      where: { id: chatId },
      relations: { members: { user: true } },
    });
    if (!chat) throw new NotFoundException('Chat not found');
    if (!chat.isGroup)
      throw new ForbiddenException('Cannot add members to a private chat');

    const requesterMember = chat.members.find(
      (m) => m.user?.uid === requesterUid,
    );
    if (!requesterMember)
      throw new ForbiddenException('Not a member of this chat');
    if (requesterMember.role !== 'admin')
      throw new ForbiddenException('Only admins can add members');

    const existingUids = new Set(chat.members.map((m) => m.user.uid));
    const toAdd = newUids.filter((u) => !existingUids.has(u));
    if (toAdd.length === 0) return this.getChatById(chatId);

    const users = await this.dataSource.manager.findBy(User, {
      uid: In(toAdd),
    });

    const memberEntities = users.map((user) =>
      this.chatMemberRepository.create({
        user,
        chat,
        chatId: chat.id,
        role: 'member',
      }),
    );

    await this.chatMemberRepository.save(memberEntities);
    return this.getChatById(chatId);
  }

  // ── Get member UIDs for a chat (for targeted socket broadcasts) ─────────

  async getMemberUids(chatId: string): Promise<string[]> {
    const members = await this.chatMemberRepository.find({
      where: { chatId },
      select: ['id'],
      relations: { user: true },
    });
    return members.map((m) => m.user.uid);
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

  // ── Shared membership assertion ──────────────────────────────────────────

  async assertMember(chatId: string, uid: string): Promise<void> {
    const member = await this.chatMemberRepository.findOne({
      where: { chatId, user: { uid } },
    });
    if (!member) throw new ForbiddenException('Not a member of this chat');
  }

  // ── Get messages for a chat room ─────────────────────────────────────────

  async getMessages(chatId: string, uid: string) {
    await this.assertMember(chatId, uid);
    const messages = await this.messageRepository.find({
      where: { chatId },
      order: { createdAt: 'ASC' },
      take: 50,
    });

    return messages.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      text: m.content,
      sentAt: m.createdAt,
      status: m.status,
    }));
  }

  // ── Load older messages (cursor-based pagination) ────────────────────────

  async loadMoreMessages(chatId: string, uid: string, before?: string) {
    await this.assertMember(chatId, uid);
    const query: Record<string, unknown> = { chatId };
    if (before) {
      const cursor = await this.messageRepository.findOne({
        where: { id: before },
        select: ['createdAt'],
      });
      if (cursor) {
        query.createdAt = LessThan(cursor.createdAt);
      }
    }
    const messages = await this.messageRepository.find({
      where: query as any,
      order: { createdAt: 'DESC' },
      take: 50,
    });
    messages.reverse();
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
    await this.assertMember(chatId, senderId);
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
      lastMessageSenderId: senderId,
      lastMessageStatus: 'sent',
      lastMessageAt: saved.createdAt,
    });

    // Increment unread count for all members except the sender
    await this.dataSource
      .createQueryBuilder()
      .update(ChatMember)
      .set({ unreadCount: () => '"unreadCount" + 1' })
      .where('"chatId" = :chatId', { chatId })
      .andWhere('"userUid" != :uid', { uid: senderId })
      .execute();

    // Fetch updated unread counts for all members (excluding sender)
    const memberUnreads = await this.chatMemberRepository.find({
      where: { chatId },
      select: ['unreadCount'],
      relations: { user: true },
    });
    const unreadByUid: Record<string, number> = {};
    for (const m of memberUnreads) {
      if (m.user?.uid !== senderId) {
        unreadByUid[m.user.uid] = m.unreadCount;
      }
    }

    return {
      message: {
        id: saved.id,
        senderId: saved.senderId,
        text: saved.content,
        sentAt: saved.createdAt,
        status: saved.status,
      },
      unreadByUid,
    };
  }

  // ── Mark all messages in a chat as read for a user ───────────────────────

  async markRead(chatId: string, uid: string) {
    await this.assertMember(chatId, uid);
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

  // ── Find existing private chat between the given users ────────────────────

  private async findExistingPrivateChat(uids: string[]): Promise<Chat | null> {
    const members = await this.chatMemberRepository.find({
      where: { user: { uid: In(uids) } },
      relations: { chat: { members: { user: true } } },
    });

    const candidateChats = new Map<string, Chat>();
    for (const m of members) {
      if (!m.chat.isGroup) {
        candidateChats.set(m.chat.id, m.chat);
      }
    }

    for (const chat of candidateChats.values()) {
      const chatUids = chat.members.map((m) => m.user.uid);
      if (
        chatUids.length === uids.length &&
        chatUids.every((u) => uids.includes(u))
      ) {
        return chat;
      }
    }

    return null;
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
      lastMessageSenderId: chat.lastMessageSenderId ?? undefined,
      lastMessageStatus: chat.lastMessageStatus ?? undefined,
      lastMessageAt: chat.lastMessageAt ?? chat.createdAt,
      unread: unreadCount,
    };
  }
}
