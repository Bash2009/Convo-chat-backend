import {
  Entity,
  Column,
  ManyToOne,
  PrimaryGeneratedColumn,
  JoinColumn,
} from 'typeorm';
import { User } from 'src/user/entities/user.entity';
import { Chat } from './chat.entity';

@Entity()
export class ChatMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.chatMembers, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => Chat, (chat) => chat.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chatId' })
  chat: Chat;

  @Column()
  chatId: string;

  @Column({ default: 0 })
  unreadCount: number;

  @Column({ nullable: true })
  lastReadAt: Date;

  @Column({ default: 'member' })
  role: string;
}
