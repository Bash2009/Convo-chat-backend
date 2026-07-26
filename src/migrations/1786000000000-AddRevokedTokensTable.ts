import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRevokedTokensTable1786000000000 implements MigrationInterface {
  name = 'AddRevokedTokensTable1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "revoked_tokens" (
        "jti" varchar PRIMARY KEY,
        "uid" varchar NOT NULL,
        "revokedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_revoked_tokens_expires_at" ON "revoked_tokens" ("expiresAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_revoked_tokens_expires_at"`,
    );
    await queryRunner.query(`DROP TABLE "revoked_tokens"`);
  }
}
