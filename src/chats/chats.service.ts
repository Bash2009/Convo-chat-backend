import { Injectable } from '@nestjs/common';
import { CreateChatDto } from './dto/create-chat.dto';
import { UpdateChatDto } from './dto/update-chat.dto';
import { ProfileService } from 'src/profile/profile.service';
import { DataSource, In, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Chat } from './entities/chat.entity';
import { ChatMember } from './entities/chat-members.entity';
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
  ) {}

  async create(createChatDto: CreateChatDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const { isGroup, members, name } = createChatDto;
      const chat = await queryRunner.manager.create(Chat, {
        name,
        isGroup,
        createdAt: new Date(),
      });
      const users = await queryRunner.manager.findBy(User, {
        uid: In(members),
      });

      chat.members = users.map((user) => {
        return queryRunner.manager.create(ChatMember, {
          user: user,
          role: 'member',
        });
      });

      const savedChat = await queryRunner.manager.save(Chat, chat);
      await queryRunner.commitTransaction();
      return { savedChat };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      console.log(err);
    } finally {
      await queryRunner.release();
    }
  }

  findAll() {
    return `This action returns all chats`;
  }

  async getUser(username: string) {
    const user = await this.profileService.findUserByName(username);
    return user;
  }

  update(id: number, updateChatDto: UpdateChatDto) {
    return `This action updates a #${id} chat`;
  }

  remove(id: number) {
    return `This action removes a #${id} chat`;
  }
}
