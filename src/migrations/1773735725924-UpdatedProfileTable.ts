import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdatedProfileTable1773735725924 implements MigrationInterface {
  name = 'UpdatedProfileTable1773735725924';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "profiles" ADD "location" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "profiles" ADD "website" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "website"`);
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "location"`);
  }
}
