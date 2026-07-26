import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDatabaseIndexes1785000000000 implements MigrationInterface {
  name = 'AddDatabaseIndexes1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Indexes for messages table
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_message_chat_id" ON "message" ("chatId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_message_sender_id" ON "message" ("senderId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_message_chat_status" ON "message" ("chatId", "status")`,
    );

    // Indexes for chat_member table
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_chat_member_chat_id" ON "chat_member" ("chatId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_chat_member_user_uid" ON "chat_member" ("userUid")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_chat_member_chat_user" ON "chat_member" ("chatId", "userUid")`,
    );

    // Index for profiles userUid
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_profiles_user_uid" ON "profiles" ("userUid")`,
    );

    // Index for users email
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_users_email" ON "users" ("email")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_message_chat_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_message_sender_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_message_chat_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chat_member_chat_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chat_member_user_uid"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_chat_member_chat_user"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_profiles_user_uid"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_email"`);
  }
}
