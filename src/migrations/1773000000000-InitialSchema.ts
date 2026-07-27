import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1773000000000 implements MigrationInterface {
  name = 'InitialSchema1773000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "users" (
        "uid" character varying NOT NULL,
        "email" character varying NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users" PRIMARY KEY ("uid")
      )`,
    );
    await queryRunner.query(
      `CREATE TABLE "profiles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "firstName" character varying NOT NULL,
        "lastName" character varying NOT NULL,
        "username" character varying NOT NULL,
        "bio" character varying,
        "location" character varying,
        "avatarUrl" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "userUid" character varying,
        CONSTRAINT "UQ_profiles_username" UNIQUE ("username"),
        CONSTRAINT "REL_profiles_user" UNIQUE ("userUid"),
        CONSTRAINT "PK_profiles" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE TABLE "chat" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "isGroup" boolean NOT NULL DEFAULT false,
        "name" character varying,
        "avatarUrl" character varying,
        "lastMessageText" character varying,
        "lastMessageSenderId" character varying,
        "lastMessageStatus" character varying DEFAULT 'sent',
        "lastMessageAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chat" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE TABLE "message" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "chatId" uuid NOT NULL,
        "senderId" character varying NOT NULL,
        "content" text NOT NULL,
        "type" character varying NOT NULL DEFAULT 'text',
        "status" character varying NOT NULL DEFAULT 'sent',
        "isEdited" boolean NOT NULL DEFAULT false,
        "isDeleted" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_message" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE TABLE "chat_member" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userUid" character varying,
        "chatId" uuid NOT NULL,
        "unreadCount" integer NOT NULL DEFAULT '0',
        "lastReadAt" TIMESTAMP,
        "role" character varying NOT NULL DEFAULT 'member',
        CONSTRAINT "PK_chat_member" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `ALTER TABLE "profiles"
        ADD CONSTRAINT "FK_profiles_user"
        FOREIGN KEY ("userUid")
        REFERENCES "users"("uid")
        ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "message"
        ADD CONSTRAINT "FK_message_chat"
        FOREIGN KEY ("chatId")
        REFERENCES "chat"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_member"
        ADD CONSTRAINT "FK_chat_member_user"
        FOREIGN KEY ("userUid")
        REFERENCES "users"("uid")
        ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_member"
        ADD CONSTRAINT "FK_chat_member_chat"
        FOREIGN KEY ("chatId")
        REFERENCES "chat"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "chat_member" DROP CONSTRAINT "FK_chat_member_chat"`);
    await queryRunner.query(`ALTER TABLE "chat_member" DROP CONSTRAINT "FK_chat_member_user"`);
    await queryRunner.query(`ALTER TABLE "message" DROP CONSTRAINT "FK_message_chat"`);
    await queryRunner.query(`ALTER TABLE "profiles" DROP CONSTRAINT "FK_profiles_user"`);
    await queryRunner.query(`DROP TABLE "chat_member"`);
    await queryRunner.query(`DROP TABLE "message"`);
    await queryRunner.query(`DROP TABLE "chat"`);
    await queryRunner.query(`DROP TABLE "profiles"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
