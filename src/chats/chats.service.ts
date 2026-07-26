import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateChatDto } from './dto/create-chat.dto';
import { ProfileService } from 'src/profile/profile.service';
import { DataSource, In, Not, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Chat } from './entities/chat.entity';
import { ChatMember } from './entities/chat-members.entity';
import { Message } from './entities/messages.entity';
import { User } from 'src/user/entities/user.entity';

const MESSAGES_PAGE_SIZE = 50;

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

  async create(createChatDto: CreateChatDto) {
    const { isGroup, members, name, admin } = createChatDto;

    const allUids = [
      ...new Set([...(members ?? []), ...(admin ? [admin] : [])]),
    ];

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

      const newChat = await this.getChatById(savedChat.id);
      await queryRunner.commitTransaction();
      return newChat;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `createChat error: ${(err as Error).message}`,
        (err as Error).stack,
      );
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

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

    const participantUids = chat.members
      .map((m) => m.user?.uid ?? '')
      .filter(Boolean);
    await this.chatRepository.remove(chat);
    return { id: chatId, deleted: true, participantUids };
  }

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

  async getChats(uid: string) {
    const members = await this.chatMemberRepository.find({
      where: { user: { uid } },
      relations: { chat: { members: { user: { profile: true } } } },
      take: 100,
    });

    return members.map(({ chat, unreadCount }) =>
      this.formatChat(chat, unreadCount),
    );
  }

  async getChatById(chatId: string) {
    const chat = await this.chatRepository.findOne({
      where: { id: chatId },
      relations: { members: { user: { profile: true } } },
    });
    if (!chat) throw new NotFoundException('Chat not found');
    return this.formatChat(chat, 0);
  }

  async assertMember(chatId: string, uid: string): Promise<void> {
    const membership = await this.chatMemberRepository.findOne({
      where: { chatId, user: { uid } },
    });
    if (!membership) {
      throw new UnauthorizedException('User is not a member of this chat');
    }
  }

  async getMessages(chatId: string, page = 0, uid?: string) {
    if (uid) await this.assertMember(chatId, uid);
    const messages = await this.messageRepository.find({
      where: { chatId },
      order: { createdAt: 'DESC' },
      take: MESSAGES_PAGE_SIZE,
      skip: page * MESSAGES_PAGE_SIZE,
    });

    return messages.reverse().map((m) => ({
      id: m.id,
      senderId: m.senderId,
      text: m.content,
      sentAt: m.createdAt,
      status: m.status,
    }));
  }

  async sendMessage(chatId: string, senderId: string, text: string) {
    await this.assertMember(chatId, senderId);
    const message = this.messageRepository.create({
      chatId,
      senderId,
      content: text,
      status: 'sent',
    });

    const saved = await this.messageRepository.save(message);

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

  async markRead(chatId: string, uid: string) {
    await this.assertMember(chatId, uid);
    await this.chatMemberRepository.update(
      { chatId, user: { uid } },
      { unreadCount: 0, lastReadAt: new Date() },
    );

    await this.messageRepository
      .createQueryBuilder()
      .update(Message)
      .set({ status: 'read' })
      .where('chatId = :chatId', { chatId })
      .andWhere('senderId != :uid', { uid })
      .andWhere('status != :status', { status: 'read' })
      .execute();

    const updated = await this.messageRepository.find({
      where: { chatId, status: 'read' as const, senderId: Not(uid) },
      select: ['id', 'senderId'],
      take: 100,
    });

    return updated;
  }

  async getUser(username: string) {
    return this.profileService.findUserByName(username);
  }

  private async findExistingPrivateChat(uids: string[]): Promise<Chat | null> {
    const targetCount = uids.length;

    const rows = await this.chatMemberRepository
      .createQueryBuilder('cm')
      .select('cm.chatId')
      .addSelect('COUNT(*)', 'cnt')
      .where(
        'cm.chatId IN (SELECT "chatId" FROM chat_member WHERE "userUid" IN (:...uids))',
        { uids },
      )
      .andWhere((qb) => {
        const subQuery = qb
          .subQuery()
          .select('cm2.chatId')
          .from('chat_member', 'cm2')
          .innerJoin('chat', 'c', 'c.id = cm2.chatId')
          .where('c.isGroup = false')
          .getQuery();
        return 'cm.chatId IN ' + subQuery;
      })
      .groupBy('cm.chatId')
      .having('COUNT(*) = :targetCount', { targetCount })
      .getRawMany();

    if (rows.length === 0) return null;

    type RawRow = { cm_chat_id?: string; cmChatId?: string };
    const rawRow = rows[0] as RawRow;
    const chatId = rawRow.cm_chat_id ?? rawRow.cmChatId;
    return this.chatRepository.findOne({
      where: { id: chatId },
      relations: { members: { user: { profile: true } } },
    });
  }

  private formatChat(chat: Chat, unreadCount: number) {
    return {
      id: chat.id,
      isGroup: chat.isGroup,
      name: chat.name ?? '',
      avatarUrl: chat.avatarUrl ?? '',
      participants: (chat.members ?? []).map((m) => ({
        user: {
          uid: m.user?.uid ?? '',
          profile: {
            firstName: m.user?.profile?.firstName ?? '',
            lastName: m.user?.profile?.lastName ?? '',
            username: m.user?.profile?.username ?? '',
            avatarUrl: m.user?.profile?.avatarUrl ?? '',
          },
        },
      })),
      lastMessage: chat.lastMessageText ?? '',
      lastMessageAt: chat.lastMessageAt ?? chat.createdAt,
      unread: unreadCount,
    };
  }
}
