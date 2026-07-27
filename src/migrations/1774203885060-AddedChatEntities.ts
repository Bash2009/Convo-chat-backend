import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddedChatEntities1774203885060 implements MigrationInterface {
  name = 'AddedChatEntities1774203885060';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "message" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "senderId" character varying NOT NULL, "content" text NOT NULL, "type" character varying NOT NULL DEFAULT 'text', "isEdited" boolean NOT NULL DEFAULT false, "isDeleted" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ba01f0a3e0123651915008bc578" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "chat" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "isGroup" boolean NOT NULL DEFAULT false, "name" character varying, "lastMessageAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "lastMessageId" uuid, CONSTRAINT "REL_d96167b8ced25dc5253247fd34" UNIQUE ("lastMessageId"), CONSTRAINT "PK_9d0b2ba74336710fd31154738a5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "chat_member" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "unreadCount" integer NOT NULL DEFAULT '0', "lastReadAt" TIMESTAMP, "role" character varying NOT NULL DEFAULT 'member', "userUid" character varying, "chatId" uuid, CONSTRAINT "PK_2aad8c13481bba9b43eaa2a774f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat" ADD CONSTRAINT "FK_d96167b8ced25dc5253247fd348" FOREIGN KEY ("lastMessageId") REFERENCES "message"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_member" ADD CONSTRAINT "FK_b759a9f24573beb81fc243284c9" FOREIGN KEY ("userUid") REFERENCES "users"("uid") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_member" ADD CONSTRAINT "FK_92e48cf204fcce7febc738c8d6f" FOREIGN KEY ("chatId") REFERENCES "chat"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chat_member" DROP CONSTRAINT "FK_92e48cf204fcce7febc738c8d6f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_member" DROP CONSTRAINT "FK_b759a9f24573beb81fc243284c9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat" DROP CONSTRAINT "FK_d96167b8ced25dc5253247fd348"`,
    );
    await queryRunner.query(`DROP TABLE "chat_member"`);
    await queryRunner.query(`DROP TABLE "chat"`);
    await queryRunner.query(`DROP TABLE "message"`);
  }
}
