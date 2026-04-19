import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { ChatMember } from './chat-members.entity';
import { Message } from './messages.entity';

@Entity()
export class Chat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ default: false })
  isGroup: boolean;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  avatarUrl: string;

  @OneToMany(() => ChatMember, (chatMember) => chatMember.chat, {
    cascade: ['insert', 'update'],
    eager: false,
  })
  members: ChatMember[];

  @OneToMany(() => Message, (message) => message.chat, { eager: false })
  messages: Message[];

  // Denormalised preview fields updated on each new message for fast list queries
  @Column({ nullable: true })
  lastMessageText: string;

  @Column({ type: 'timestamp', nullable: true })
  lastMessageAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
