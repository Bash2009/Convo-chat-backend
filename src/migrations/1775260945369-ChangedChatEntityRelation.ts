import { MigrationInterface, QueryRunner } from "typeorm";

export class ChangedChatEntityRelation1775260945369 implements MigrationInterface {
    name = 'ChangedChatEntityRelation1775260945369'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "chat_member" DROP CONSTRAINT "FK_92e48cf204fcce7febc738c8d6f"`);
        await queryRunner.query(`ALTER TABLE "chat_member" DROP CONSTRAINT "FK_b759a9f24573beb81fc243284c9"`);
        await queryRunner.query(`ALTER TABLE "chat_member" ALTER COLUMN "chatId" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "chat_member" ADD CONSTRAINT "FK_b759a9f24573beb81fc243284c9" FOREIGN KEY ("userUid") REFERENCES "users"("uid") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "chat_member" ADD CONSTRAINT "FK_92e48cf204fcce7febc738c8d6f" FOREIGN KEY ("chatId") REFERENCES "chat"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "chat_member" DROP CONSTRAINT "FK_92e48cf204fcce7febc738c8d6f"`);
        await queryRunner.query(`ALTER TABLE "chat_member" DROP CONSTRAINT "FK_b759a9f24573beb81fc243284c9"`);
        await queryRunner.query(`ALTER TABLE "chat_member" ALTER COLUMN "chatId" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "chat_member" ADD CONSTRAINT "FK_b759a9f24573beb81fc243284c9" FOREIGN KEY ("userUid") REFERENCES "users"("uid") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "chat_member" ADD CONSTRAINT "FK_92e48cf204fcce7febc738c8d6f" FOREIGN KEY ("chatId") REFERENCES "chat"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
