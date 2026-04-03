import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToOne,
} from 'typeorm';
import { Chat } from './chat.entity';

@Entity()
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => Chat, (chat) => chat.lastMessage)
  chat: string;

  @Column()
  senderId: string;

  @Column('text')
  content: string;

  @Column({ default: 'text' })
  type: string; // text, image, video, etc.

  @Column({ default: false })
  isEdited: boolean;

  @Column({ default: false })
  isDeleted: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
