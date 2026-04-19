import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  OneToMany,
} from 'typeorm';
import { Profile } from '../../profile/entities/profile.entity';
import { ChatMember } from 'src/chats/entities/chat-members.entity';

@Entity('users')
export class User {
  @PrimaryColumn('varchar')
  uid: string;

  @Column('varchar')
  email: string;

  @OneToOne(() => Profile, (profile) => profile.user)
  profile: Profile;

  // A user can be a member of many chats
  @OneToMany(() => ChatMember, (chatMember) => chatMember.user)
  chatMembers: ChatMember[];

  @CreateDateColumn({
    type: 'timestamp with time zone',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamp with time zone',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;
}
