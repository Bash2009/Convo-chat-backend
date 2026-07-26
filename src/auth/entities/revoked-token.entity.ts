import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('revoked_tokens')
export class RevokedToken {
  @PrimaryColumn('varchar')
  jti: string;

  @Column()
  uid: string;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  revokedAt: Date;

  @Column({ type: 'timestamp with time zone' })
  expiresAt: Date;
}
