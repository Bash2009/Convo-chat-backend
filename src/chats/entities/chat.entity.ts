import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToMany,
  OneToOne,
  JoinColumn,
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
  name: string; // group name

  @ManyToMany(() => ChatMember, (chatMember) => chatMember.chat)
  members: ChatMember[];

  @OneToOne(() => Message, (message) => message.chat)
  @JoinColumn()
  lastMessage: Message;

  @Column({ type: 'timestamp', nullable: true })
  lastMessageAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
