import { MigrationInterface, QueryRunner } from "typeorm";

export class ModifiedChatEntities1776603372719 implements MigrationInterface {
    name = 'ModifiedChatEntities1776603372719'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "chat" DROP CONSTRAINT "FK_d96167b8ced25dc5253247fd348"`);
        await queryRunner.query(`ALTER TABLE "chat" DROP CONSTRAINT "REL_d96167b8ced25dc5253247fd34"`);
        await queryRunner.query(`ALTER TABLE "chat" DROP COLUMN "lastMessageId"`);
        await queryRunner.query(`ALTER TABLE "message" ADD "chatId" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "message" ADD "status" character varying NOT NULL DEFAULT 'sent'`);
        await queryRunner.query(`ALTER TABLE "chat" ADD "avatarUrl" character varying`);
        await queryRunner.query(`ALTER TABLE "chat" ADD "lastMessageText" character varying`);
        await queryRunner.query(`ALTER TABLE "message" ADD CONSTRAINT "FK_619bc7b78eba833d2044153bacc" FOREIGN KEY ("chatId") REFERENCES "chat"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "message" DROP CONSTRAINT "FK_619bc7b78eba833d2044153bacc"`);
        await queryRunner.query(`ALTER TABLE "chat" DROP COLUMN "lastMessageText"`);
        await queryRunner.query(`ALTER TABLE "chat" DROP COLUMN "avatarUrl"`);
        await queryRunner.query(`ALTER TABLE "message" DROP COLUMN "status"`);
        await queryRunner.query(`ALTER TABLE "message" DROP COLUMN "chatId"`);
        await queryRunner.query(`ALTER TABLE "chat" ADD "lastMessageId" uuid`);
        await queryRunner.query(`ALTER TABLE "chat" ADD CONSTRAINT "REL_d96167b8ced25dc5253247fd34" UNIQUE ("lastMessageId")`);
        await queryRunner.query(`ALTER TABLE "chat" ADD CONSTRAINT "FK_d96167b8ced25dc5253247fd348" FOREIGN KEY ("lastMessageId") REFERENCES "message"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
