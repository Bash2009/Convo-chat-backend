import { Entity, Column, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from 'src/user/entities/user.entity';
import { Chat } from './chat.entity';

@Entity()
export class ChatMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.chatMembers)
  user: User;

  @ManyToOne(() => Chat, (chat) => chat.members)
  chat: Chat;

  @Column({ default: 0 })
  unreadCount: number;

  @Column({ nullable: true })
  lastReadAt: Date;

  @Column({ default: 'member' })
  role: string;
}
